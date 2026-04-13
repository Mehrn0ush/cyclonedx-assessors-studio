import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { URL } from 'node:url';
import { getDatabase } from '../db/connection.js';
import { hashPassword } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { checkSetupComplete, markSetupComplete } from '../middleware/setup.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { importStandard } from '../services/standard-import.js';
import { asyncHandler } from '../utils/route-helpers.js';

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

/**
 * Fetch a standard document from a trusted URL with timeout and size limits.
 */
async function fetchStandardDocument(url: string): Promise<{ text: string } | { error: string; status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => { controller.abort(); }, 30000); // 30 second timeout

  try {
    const docResponse = await fetch(url, { signal: controller.signal });

    if (!docResponse.ok) {
      logger.error('Failed to fetch standard document', { url, status: docResponse.status });
      return { error: 'Failed to download standard', status: 502 };
    }

    // Check Content-Length to prevent large downloads
    const contentLength = docResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) { // 10MB limit
      logger.error('Standard document too large', { url, contentLength });
      return { error: 'Standard document is too large (max 10MB)', status: 400 };
    }

    return { text: await docResponse.text() };
  } catch (fetchError) {
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      logger.error('Fetch timeout while downloading standard', { url });
      return { error: 'Request timeout while downloading standard', status: 504 };
    }
    logger.error('Failed to fetch standard document', { url, error: fetchError });
    return { error: 'Failed to download standard', status: 502 };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extract standards array from parsed CycloneDX document.
 */
function extractStandardsFromDoc(cdxDoc: Record<string, unknown>): Record<string, unknown>[] {
  const definitions = cdxDoc.definitions as Record<string, unknown> | undefined;
  const declarations = cdxDoc.declarations as Record<string, unknown> | undefined;
  return (
    (definitions?.standards as Record<string, unknown>[] | undefined) ??
    (declarations?.standards as Record<string, unknown>[] | undefined) ??
    []
  );
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
        details: error.issues.map((e) => ({
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
router.get('/standards-feed', async (__req: Request, res: Response): Promise<void> => {
  try {
    const feedResponse = await fetch('https://cyclonedx.org/standards/feed.json');
    if (!feedResponse.ok) {
      logger.error('Failed to fetch standards feed', { status: feedResponse.status });
      res.status(502).json({ error: 'Unable to fetch standards feed. Check your internet connection.' });
      return;
    }

    // biome-ignore lint/suspicious/noExplicitAny: JSON feed has dynamic structure
    const feed = (await feedResponse.json()) as Record<string, unknown>;
    // biome-ignore lint/suspicious/noExplicitAny: Feed items have dynamic structure
    const items = ((feed.items || []) as Record<string, unknown>[]).map((item: Record<string, unknown>) => {
      // The feed uses external_url for the CycloneDX document download link.
      // Attachments may also carry the URL with a matching MIME type.
      const attachmentUrl = ((item.attachments || []) as Record<string, unknown>[]).find(
        (a: Record<string, unknown>) => a.mime_type === 'application/vnd.cyclonedx+json'
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
    const fetchResult = await fetchStandardDocument(url);
    if ('error' in fetchResult) {
      res.status(fetchResult.status).json({ error: fetchResult.error });
      return;
    }

    const rawText = fetchResult.text;

    // biome-ignore lint/suspicious/noExplicitAny: CycloneDX document has dynamic structure
    const cdxDoc = JSON.parse(rawText) as Record<string, unknown>;

    // Extract standards from definitions (CycloneDX 1.6+) or declarations (older)
    const standards = extractStandardsFromDoc(cdxDoc);
    if (standards.length === 0) {
      res.status(422).json({ error: 'No standards found in this CycloneDX document' });
      return;
    }

    const importedStandards: { id: string; identifier: string; name: string; requirementCount: number }[] = [];

    for (const standard of standards) {
      const result = await importStandard(standard, {
        fallbackName: title || 'Unknown Standard',
        sourceJson: rawText,
      });
      importedStandards.push({
        id: result.id,
        identifier: result.identifier,
        name: result.name,
        requirementCount: result.requirementCount,
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

/**
 * POST /api/v1/setup/seed-demo
 * Seeds the database with comprehensive demo data.
 * Only available during/after setup. Requires that admin and standards exist.
 */
router.post('/seed-demo', async (__req: Request, res: Response): Promise<void> => {
  try {
    const { seedDemoData } = await import('../db/seed-demo.js');
    const seeded = await seedDemoData();

    if (seeded) {
      logger.info('Demo data seeded via setup wizard');
      res.status(201).json({ message: 'Demo data loaded successfully' });
    } else {
      res.status(200).json({ message: 'Demo data already present, skipped' });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error('Demo data seed error', { message: errMsg, stack: errStack });
    // Do not expose internal error details to the client (OWASP A4)
    res.status(500).json({ error: 'Failed to load demo data' });
  }
});

export default router;
