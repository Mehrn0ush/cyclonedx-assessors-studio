import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { URL } from 'url';
import { getDatabase } from '../db/connection.js';
import { hashPassword } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { checkSetupComplete, markSetupComplete } from '../middleware/setup.js';
import { toSnakeCase } from '../middleware/camelCase.js';

const router = Router();

// Allowed domains for importing CycloneDX standards
const ALLOWED_DOMAINS = [
  'github.com',
  'raw.githubusercontent.com',
  'cyclonedx.org',
];

function isUrlTrusted(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS
    if (url.protocol !== 'https:') {
      return false;
    }

    // Check if hostname is in allowed domains (with subdomain support)
    const hostname = url.hostname.toLowerCase();
    return ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

const setupSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(64, 'Username must be at most 64 characters')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, hyphens, and underscores'),
  email: z.string()
    .email('A valid email address is required'),
  displayName: z.string()
    .min(1, 'Display name is required')
    .max(128, 'Display name must be at most 128 characters'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

/**
 * GET /api/v1/setup/status
 * Returns whether initial setup has been completed.
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const complete = await checkSetupComplete();
  res.json({ setupComplete: complete });
});

/**
 * POST /api/v1/setup
 * Creates the initial administrator account.
 * Only works when no users exist in the database.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Guard: only allowed when no users exist
    const complete = await checkSetupComplete();
    if (complete) {
      res.status(403).json({
        error: 'Setup already completed',
        message: 'An administrator account already exists. This endpoint is no longer available.',
      });
      return;
    }

    const data = setupSchema.parse(req.body);
    const db = getDatabase();

    const passwordHash = await hashPassword(data.password);
    const userId = uuidv4();

    await db
      .insertInto('app_user')
      .values(toSnakeCase({
        id: userId,
        username: data.username,
        email: data.email,
        passwordHash: passwordHash,
        displayName: data.displayName,
        role: 'admin',
        isActive: true,
      }))
      .execute();

    markSetupComplete();

    logger.info('Initial admin account created via setup wizard', {
      userId,
      username: data.username,
      email: data.email,
    });

    res.status(201).json({
      message: 'Administrator account created successfully',
      user: {
        id: userId,
        username: data.username,
        email: data.email,
        displayName: data.displayName,
        role: 'admin',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    logger.error('Setup error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/setup/standards-feed
 * Fetches the CycloneDX standards feed so the frontend can display what will be imported.
 * Only available during setup (before setup is complete).
 */
router.get('/standards-feed', async (_req: Request, res: Response): Promise<void> => {
  try {
    const feedResponse = await fetch('https://cyclonedx.org/standards/feed.json');
    if (!feedResponse.ok) {
      logger.error('Failed to fetch standards feed', { status: feedResponse.status });
      res.status(502).json({ error: 'Unable to fetch standards feed. Check your internet connection.' });
      return;
    }

    const feed = (await feedResponse.json()) as any;
    const items = (feed.items || []).map((item: any) => {
      // The feed uses external_url for the CycloneDX document download link.
      // Attachments may also carry the URL with a matching MIME type.
      const attachmentUrl = (item.attachments || []).find(
        (a: any) => a.mime_type === 'application/vnd.cyclonedx+json'
      )?.url;
      return {
        id: item.id,
        title: item.title,
        url: item.external_url || attachmentUrl || item.url,
        summary: item.summary,
        contentHtml: item.content_html,
        datePublished: item.date_published,
        authors: item.authors,
        metadata: item._metadata,
      };
    });

    res.json({ data: items });
  } catch (error) {
    logger.error('Standards feed fetch error', { error });
    res.status(502).json({ error: 'Unable to fetch standards feed. Check your internet connection.' });
  }
});

/**
 * POST /api/v1/setup/import-standard
 * Downloads a single CycloneDX standards document from a URL and imports it into the database.
 * Only available during setup. No auth required since no users may exist yet.
 */
router.post('/import-standard', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, title } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'A valid URL is required' });
      return;
    }

    // Validate URL: must be HTTPS and from a trusted domain
    if (!isUrlTrusted(url)) {
      logger.warn('Attempt to import from untrusted URL', { url });
      res.status(400).json({
        error: 'Invalid URL: Must be HTTPS and from a trusted source (github.com, raw.githubusercontent.com, or cyclonedx.org)',
      });
      return;
    }

    // Fetch the CycloneDX standards document
    const docResponse = await fetch(url);
    if (!docResponse.ok) {
      logger.error('Failed to fetch standard document', { url, status: docResponse.status });
      res.status(502).json({ error: `Failed to download standard: ${title || url}` });
      return;
    }

    const cdxDoc = (await docResponse.json()) as any;

    // Extract standards from definitions (CycloneDX 1.6+) or declarations (older)
    const standards =
      cdxDoc.definitions?.standards ||
      cdxDoc.declarations?.standards ||
      [];
    if (standards.length === 0) {
      res.status(422).json({ error: 'No standards found in this CycloneDX document' });
      return;
    }

    const db = getDatabase();
    const importedStandards: Array<{ id: string; identifier: string; name: string; requirementCount: number }> = [];

    for (const standard of standards) {
      const bomRef = standard['bom-ref'] || standard.bomRef || uuidv4();
      const standardName = standard.name || title || 'Unknown Standard';
      const standardDesc = standard.description || '';
      const standardVersion = standard.version || '';
      const standardOwner = standard.owner || '';

      // Use bom-ref as identifier, fallback to name
      const identifier = bomRef;

      // Check if already imported (idempotent)
      const existing = await db
        .selectFrom('standard')
        .where('identifier', '=', identifier)
        .select('id')
        .executeTakeFirst();

      if (existing) {
        importedStandards.push({
          id: existing.id,
          identifier,
          name: standardName,
          requirementCount: 0,
        });
        continue;
      }

      const standardId = uuidv4();

      await db
        .insertInto('standard')
        .values({
          id: standardId,
          identifier,
          name: standardName,
          description: standardDesc,
          owner: standardOwner,
          version: standardVersion,
          license_id: null,
        })
        .execute();

      // Import requirements
      let requirementCount = 0;
      const requirements = standard.requirements || [];
      // Maps bom-ref to generated UUID for parent resolution and level associations
      const requirementMap = new Map<string, string>();

      // Sort requirements so parents come before children
      const sortedRequirements = [...requirements].sort((a: any, b: any) => {
        const aId = a['bom-ref'] || a.bomRef || a.identifier || '';
        const bId = b['bom-ref'] || b.bomRef || b.identifier || '';
        return aId.localeCompare(bId);
      });

      for (const req of sortedRequirements) {
        const reqBomRef = req['bom-ref'] || req.bomRef || '';
        const reqIdentifier = req.identifier || reqBomRef;
        const reqTitle = req.title || req.name || reqIdentifier;
        const reqDescription = req.text || req.description || null;
        const reqParent = req.parent || null;

        // Collect OpenCRE identifiers as comma separated string
        const openCreArr: string[] = req.openCre || req['open-cre'] || [];
        const openCre = openCreArr.length > 0 ? openCreArr.join(', ') : null;

        const requirementId = uuidv4();

        // Resolve parent
        let parentId: string | null = null;
        if (reqParent && requirementMap.has(reqParent)) {
          parentId = requirementMap.get(reqParent) || null;
        }

        try {
          await db
            .insertInto('requirement')
            .values({
              id: requirementId,
              identifier: reqIdentifier,
              name: reqTitle,
              description: reqDescription,
              open_cre: openCre,
              parent_id: parentId,
              standard_id: standardId,
            })
            .execute();

          requirementMap.set(reqBomRef, requirementId);
          requirementCount++;
        } catch (insertError: any) {
          // Skip duplicates
          if (insertError?.message?.includes('duplicate') || insertError?.message?.includes('unique')) {
            continue;
          }
          throw insertError;
        }
      }

      // Import levels and their requirement associations
      const levels = standard.levels || [];
      let levelCount = 0;
      for (const lvl of levels) {
        const lvlBomRef = lvl['bom-ref'] || lvl.bomRef || '';
        const lvlIdentifier = lvl.identifier || lvlBomRef;
        const lvlTitle = lvl.title || null;
        const lvlDescription = lvl.description || null;

        const levelId = uuidv4();

        try {
          await db
            .insertInto('level')
            .values({
              id: levelId,
              identifier: lvlIdentifier,
              title: lvlTitle,
              description: lvlDescription,
              standard_id: standardId,
            })
            .execute();

          // Associate requirements with this level
          const lvlRequirements: string[] = lvl.requirements || [];
          for (const reqRef of lvlRequirements) {
            const reqUuid = requirementMap.get(reqRef);
            if (reqUuid) {
              try {
                await db
                  .insertInto('level_requirement')
                  .values({
                    level_id: levelId,
                    requirement_id: reqUuid,
                  })
                  .execute();
              } catch (junctionError: any) {
                // Skip duplicates
                if (junctionError?.message?.includes('duplicate') || junctionError?.message?.includes('unique')) {
                  continue;
                }
                throw junctionError;
              }
            }
          }

          levelCount++;
        } catch (insertError: any) {
          if (insertError?.message?.includes('duplicate') || insertError?.message?.includes('unique')) {
            continue;
          }
          throw insertError;
        }
      }

      logger.info('Standard imported during setup', {
        standardId,
        identifier,
        name: standardName,
        requirementCount,
        levelCount,
      });

      importedStandards.push({
        id: standardId,
        identifier,
        name: standardName,
        requirementCount,
      });
    }

    res.status(201).json({
      message: 'Standard imported successfully',
      data: importedStandards,
    });
  } catch (error) {
    logger.error('Setup standard import error', { error });
    res.status(500).json({ error: 'Failed to import standard' });
  }
});

export default router;
