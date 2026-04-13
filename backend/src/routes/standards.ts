import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Selectable } from 'kysely';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { importStandard } from '../services/standard-import.js';
import { buildRequirementTree, topologicalSort } from '../services/requirement-utils.js';
import { generateStandardCycloneDX } from '../services/standard-export.js';
import type { Standard } from '../db/types.js';

const router = Router();

/**
 * Build a filesystem-safe export filename from a standard's name and version.
 * If version is missing, falls back to a UTC timestamp (YYYYMMDD-HHmmss).
 */
function buildExportFilename(name: string, version?: string | null): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // replace non-alphanum runs with hyphen
    .replace(/^-+|-+$/g, '');       // trim leading/trailing hyphens
  const suffix = version
    ? version.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    : new Date().toISOString().replace(/[-:T]/g, '').replace(/\.\d+Z$/, '');
  return `${slug}-${suffix}.cdx.json`;
}

const importStandardSchema = z.object({
  identifier: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  owner: z.string().nullish(),
  version: z.string().nullish(),
  licenseId: z.string().nullish(),
  requirements: z
    .array(
      z.object({
        identifier: z.string(),
        name: z.string(),
        description: z.string().nullish(),
        openCre: z.union([z.string(), z.array(z.string())]).nullish(),
        parentIdentifier: z.string().nullish(),
      })
    )
    .optional(),
  levels: z
    .array(
      z.object({
        identifier: z.string(),
        title: z.string().nullish(),
        description: z.string().nullish(),
        requirements: z.array(z.string()).optional(),
      })
    )
    .optional(),
  sourceJson: z.string().optional(),
});

router.get('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  const stateFilter = req.query.state as 'draft' | 'in_review' | 'published' | 'retired' | undefined;

  let query = db.selectFrom('standard');
  if (stateFilter) {
    query = query.where('state', '=', stateFilter);
  }

  const total = await query
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow()
    .then(r => r.count);

  const standards = (await query
    .selectAll()
    .limit(limit)
    .offset(offset)
    .orderBy('name', 'asc')
    .execute()) as Selectable<Standard>[];

  // Fetch requirement counts per standard in one query
  const reqCounts = await db
    .selectFrom('requirement')
    .select([
      'standard_id',
      db.fn.count<number>('id').as('count'),
    ])
    .groupBy('standard_id')
    .execute();

  const reqCountMap = new Map(reqCounts.map(r => [r.standard_id, Number(r.count)]));

  // Fetch level counts per standard
  const levelCounts = await db
    .selectFrom('level')
    .select([
      'standard_id',
      db.fn.count<number>('id').as('count'),
    ])
    .groupBy('standard_id')
    .execute();

  const levelCountMap = new Map(levelCounts.map(r => [r.standard_id, Number(r.count)]));

  const data = standards.map(s => ({
    ...s,
    requirementsCount: reqCountMap.get(s.id) || 0,
    levelsCount: levelCountMap.get(s.id) || 0,
  }));

  res.json({
    data,
    pagination: {
      limit,
      offset,
      total,
    },
  });
}));

router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const standard = await db
    .selectFrom('standard')
    .where('id', '=', req.params.id)
    .selectAll()
    .executeTakeFirst();

  if (!standard) {
    res.status(404).json({ error: 'Standard not found' });
    return;
  }

  const requirements = await db
    .selectFrom('requirement')
    .where('standard_id', '=', req.params.id as string)
    .selectAll()
    .execute();

  const requirementTree = buildRequirementTree(requirements);

  // Fetch levels with their associated requirement bom-refs
  const levels = await db
    .selectFrom('level')
    .where('standard_id', '=', req.params.id as string)
    .selectAll()
    .execute();

  const levelRequirements = await db
    .selectFrom('level_requirement')
    .innerJoin('level', 'level.id', 'level_requirement.level_id')
    .innerJoin('requirement', 'requirement.id', 'level_requirement.requirement_id')
    .where('level.standard_id', '=', req.params.id as string)
    .select([
      'level_requirement.level_id',
      'level_requirement.requirement_id',
      'requirement.identifier as requirement_identifier',
    ])
    .execute();

  const levelReqMap = new Map<string, string[]>();
  for (const lr of levelRequirements) {
    if (!levelReqMap.has(lr.level_id)) {
      levelReqMap.set(lr.level_id, []);
    }
    levelReqMap.get(lr.level_id)!.push(lr.requirement_id);
  }

  const levelsWithReqs = levels.map(l => ({
    ...l,
    requirementIds: levelReqMap.get(l.id) || [],
    requirementsCount: (levelReqMap.get(l.id) || []).length,
  }));

  res.json({
    standard,
    requirements: requirementTree,
    levels: levelsWithReqs,
  });
}));

// Export a standard as CycloneDX JSON
router.get(
  '/:id/export',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    const exportFilename = buildExportFilename(standard.name, standard.version);

    // Serve the stored blob if available (imported or published in-app standards)
    if (standard.source_json) {
      res.setHeader('Content-Type', 'application/vnd.cyclonedx+json; version=1.6');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${exportFilename}"`,
      );
      res.send(standard.source_json);
      return;
    }

    // No stored blob: this standard has not been published yet or was created
    // before blob storage was added. Generate on the fly but do not persist.
    if (standard.state === 'draft' || standard.state === 'in_review') {
      const json = await generateStandardCycloneDX(req.params.id as string);
      res.setHeader('Content-Type', 'application/vnd.cyclonedx+json; version=1.6');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${exportFilename}"`,
      );
      res.send(json);
      return;
    }

    // Published/retired without a blob (legacy data): generate and store
    const json = await generateStandardCycloneDX(req.params.id as string);
    await db
      .updateTable('standard')
      .set({ source_json: json })
      .where('id', '=', req.params.id as string)
      .execute();

    res.setHeader('Content-Type', 'application/vnd.cyclonedx+json; version=1.6');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportFilename}"`,
    );
    res.send(json);
  }),
);

router.post(
  '/import',
  requireAuth,
  requirePermission('standards.import'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = importStandardSchema.parse(req.body);

      // Build a raw standard object compatible with the shared import service.
      // The frontend pre-normalizes fields (identifier, name, parentIdentifier)
      // so we map them back to the format importStandard expects.
      const rawStandard = {
        'bom-ref': data.identifier,
        name: data.name,
        description: data.description || undefined,
        owner: data.owner || undefined,
        version: data.version || undefined,
        requirements: data.requirements?.map((r) => ({
          'bom-ref': r.identifier,
          identifier: r.identifier,
          title: r.name,
          description: r.description || undefined,
          openCre: r.openCre || undefined,
          parent: r.parentIdentifier || undefined,
        })),
        levels: data.levels?.map((l) => ({
          'bom-ref': l.identifier,
          identifier: l.identifier,
          title: l.title || undefined,
          description: l.description || undefined,
          requirements: l.requirements || [],
        })),
      };

      const result = await importStandard(rawStandard, {
        sourceJson: data.sourceJson,
      });

      if (result.skipped) {
        res.status(409).json({
          error: 'Standard already exists',
          id: result.id,
          identifier: result.identifier,
        });
        return;
      }

      res.status(201).json({
        id: result.id,
        identifier: result.identifier,
        name: result.name,
        requirementCount: result.requirementCount,
        message: 'Standard imported successfully',
      });
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

// Create a new draft standard
router.post(
  '/',
  requireAuth,
  requirePermission('standards.create'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { name, identifier, version, owner, description } = req.body;

    if (!name || !identifier) {
      res.status(400).json({ error: 'Missing required fields: name and identifier' });
      return;
    }

    const db = getDatabase();
    const standardId = uuidv4();

    await db
      .insertInto('standard')
      .values(toSnakeCase({
        id: standardId,
        identifier,
        name,
        description,
        owner,
        version,
        state: 'draft',
        authoredBy: req.user!.id,
        isImported: false,
      }))
      .execute();

    const created = await db
      .selectFrom('standard')
      .where('id', '=', standardId)
      .selectAll()
      .executeTakeFirst();

    logger.info('Standard created', {
      standardId,
      identifier,
      name,
      requestId: req.requestId,
    });

    res.status(201).json(created);
  })
);

// Edit a draft standard
router.put(
  '/:id',
  requireAuth,
  requirePermission('standards.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'draft') {
      res.status(403).json({ error: 'Only draft standards can be edited' });
      return;
    }

    const { name, identifier, version, owner, description } = req.body;

    try {
      await db
        .updateTable('standard')
        .set({
          ...(name && { name }),
          ...(identifier && { identifier }),
          ...(version !== undefined && { version }),
          ...(owner !== undefined && { owner }),
          ...(description !== undefined && { description }),
        })
        .where('id', '=', req.params.id as string)
        .execute();
    } catch (error: unknown) {
      const err = error as Record<string, unknown> | null;
      const msg = err?.message as string | undefined;
      if (msg?.includes('duplicate') || msg?.includes('unique')) {
        res.status(409).json({ error: 'A standard with this identifier already exists' });
        return;
      }
      throw error;
    }

    const updated = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    logger.info('Standard updated', {
      standardId: req.params.id,
      requestId: req.requestId,
    });

    res.json(updated);
  })
);

// Submit standard for approval
router.post(
  '/:id/submit',
  requireAuth,
  requirePermission('standards.submit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'draft') {
      res.status(403).json({ error: 'Only draft standards can be submitted for approval' });
      return;
    }

    await db
      .updateTable('standard')
      .set({
        state: 'in_review',
        submitted_at: new Date(),
      })
      .where('id', '=', req.params.id as string)
      .execute();

    const updated = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    logger.info('Standard submitted for approval', {
      standardId: req.params.id as string,
      userId: req.user.id,
      requestId: req.requestId,
    });

    res.json(updated);
  })
);

// Approve a standard
router.post(
  '/:id/approve',
  requireAuth,
  requirePermission('standards.approve'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'in_review') {
      res.status(403).json({ error: 'Only standards in review can be approved' });
      return;
    }

    if (standard.authored_by === (req.user?.id ?? '')) {
      res.status(403).json({ error: 'Cannot approve your own standard submission' });
      return;
    }

    // Generate CycloneDX JSON blob at publish time for deterministic exports
    const sourceJson = await generateStandardCycloneDX(req.params.id as string);

    await db
      .updateTable('standard')
      .set({
        state: 'published',
        approved_by: req.user?.id ?? '',
        approved_at: new Date(),
        source_json: sourceJson,
      })
      .where('id', '=', req.params.id as string)
      .execute();

    const updated = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    logger.info('Standard approved', {
      standardId: req.params.id as string,
      approvedBy: req.user!.id,
      requestId: req.requestId,
    });

    res.json(updated);
  })
);

// Reject a standard back to draft
router.post(
  '/:id/reject',
  requireAuth,
  requirePermission('standards.approve'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'in_review') {
      res.status(403).json({ error: 'Only standards in review can be rejected' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (standard.authored_by === req.user.id) {
      res.status(403).json({ error: 'Cannot reject your own standard submission' });
      return;
    }

    const { reason } = req.body;

    await db
      .updateTable('standard')
      .set({
        state: 'draft',
        submitted_at: null,
      })
      .where('id', '=', req.params.id as string)
      .execute();

    const updated = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    logger.info('Standard rejected', {
      standardId: req.params.id as string,
      rejectedBy: req.user!.id,
      reason,
      requestId: req.requestId,
    });

    res.json(updated);
  })
);

// Duplicate a standard
router.post(
  '/:id/duplicate',
  requireAuth,
  requirePermission('standards.duplicate'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const original = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!original) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    const newId = uuidv4();
    const newVersion = original.version ? `${original.version}-draft` : 'draft';

    // Build a cleaner identifier for the duplicate: strip the old version
    // suffix (if the identifier ends with it) and append the new version.
    let baseIdentifier = original.identifier;
    if (original.version) {
      const versionSuffix = `-${original.version}`;
      if (baseIdentifier.endsWith(versionSuffix)) {
        baseIdentifier = baseIdentifier.slice(0, -versionSuffix.length);
      }
    }
    // Also strip any trailing "-copy" from previous duplications
    baseIdentifier = baseIdentifier.replace(/-copy$/, '');
    const newIdentifier = `${baseIdentifier}-${newVersion}`;

    await db
      .insertInto('standard')
      .values(toSnakeCase({
        id: newId,
        identifier: newIdentifier,
        name: `${original.name} (Draft)`,
        description: original.description,
        owner: original.owner,
        version: newVersion,
        licenseId: original.license_id,
        state: 'draft',
        authoredBy: req.user!.id,
        isImported: false,
      }))
      .execute();

    // Copy all requirements from original, preserving parent/child hierarchy.
    // Topological sort ensures parents are always inserted before children.
    const rawRequirements = await db
      .selectFrom('requirement')
      .where('standard_id', '=', req.params.id as string)
      .selectAll()
      .execute();

    const sortedRequirements = topologicalSort(rawRequirements);
    const requirementMap = new Map<string, string>();

    for (const req_item of sortedRequirements) {
      const newReqId = uuidv4();

      const parentId =
        req_item.parent_id && requirementMap.has(req_item.parent_id)
          ? requirementMap.get(req_item.parent_id)
          : null;

      await db
        .insertInto('requirement')
        .values(toSnakeCase({
          id: newReqId,
          identifier: req_item.identifier,
          name: req_item.name,
          description: req_item.description,
          openCre: req_item.open_cre,
          parentId: parentId,
          standardId: newId,
        }))
        .execute();

      requirementMap.set(req_item.id, newReqId);
    }

    // Copy levels and their requirement associations
    const originalLevels = await db
      .selectFrom('level')
      .where('standard_id', '=', req.params.id as string)
      .selectAll()
      .execute();

    for (const lvl of originalLevels) {
      const newLevelId = uuidv4();

      await db
        .insertInto('level')
        .values({
          id: newLevelId,
          identifier: lvl.identifier,
          title: lvl.title,
          description: lvl.description,
          standard_id: newId,
        })
        .execute();

      // Copy level-requirement junctions, mapping old requirement IDs to new ones
      const lvlReqs = await db
        .selectFrom('level_requirement')
        .where('level_id', '=', lvl.id)
        .selectAll()
        .execute();

      for (const lr of lvlReqs) {
        const newReqId = requirementMap.get(lr.requirement_id);
        if (newReqId) {
          await db
            .insertInto('level_requirement')
            .values({
              level_id: newLevelId,
              requirement_id: newReqId,
            })
            .execute();
        }
      }
    }

    const created = await db
      .selectFrom('standard')
      .where('id', '=', newId)
      .selectAll()
      .executeTakeFirst();

    logger.info('Standard duplicated', {
      originalId: req.params.id as string,
      newId,
      duplicatedBy: req.user!.id,
      requestId: req.requestId,
    });

    res.status(201).json(created);
  })
);

// Retire a published standard
router.post(
  '/:id/retire',
  requireAuth,
  requirePermission('standards.approve'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'published') {
      res.status(403).json({ error: 'Only published standards can be retired' });
      return;
    }

    await db
      .updateTable('standard')
      .set({
        state: 'retired',
      })
      .where('id', '=', req.params.id as string)
      .execute();

    const updated = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    logger.info('Standard retired', {
      standardId: req.params.id as string,
      retiredBy: req.user?.id ?? '',
      requestId: req.requestId,
    });

    res.json(updated);
  })
);

// Add a requirement to a draft standard
router.post(
  '/:id/requirements',
  requireAuth,
  requirePermission('requirements.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'draft') {
      res.status(403).json({ error: 'Can only add requirements to draft standards' });
      return;
    }

    const { identifier, name, description, open_cre, parentIdentifier, parentId: bodyParentId } = req.body;

    if (!identifier || !name) {
      res.status(400).json({ error: 'Missing required fields: identifier and name' });
      return;
    }

    let parentId: string | null = bodyParentId || null;
    if (!parentId && parentIdentifier) {
      const parent = await db
        .selectFrom('requirement')
        .where('standard_id', '=', req.params.id as string)
        .where('identifier', '=', parentIdentifier)
        .select('id')
        .executeTakeFirst();

      if (!parent) {
        res.status(400).json({ error: 'Parent requirement not found' });
        return;
      }

      parentId = parent.id;
    }

    const requirementId = uuidv4();

    await db
      .insertInto('requirement')
      .values(toSnakeCase({
        id: requirementId,
        identifier,
        name,
        description,
        openCre: open_cre,
        parentId: parentId,
        standardId: req.params.id as string,
      }))
      .execute();

    const created = await db
      .selectFrom('requirement')
      .where('id', '=', requirementId)
      .selectAll()
      .executeTakeFirst();

    logger.info('Requirement added to standard', {
      standardId: req.params.id as string,
      requirementId,
      requestId: req.requestId,
    });

    res.status(201).json(created);
  })
);

// Edit a requirement in a draft standard
router.put(
  '/:standardId/requirements/:reqId',
  requireAuth,
  requirePermission('requirements.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.standardId)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'draft') {
      res.status(403).json({ error: 'Can only edit requirements in draft standards' });
      return;
    }

    const requirement = await db
      .selectFrom('requirement')
      .where('id', '=', req.params.reqId)
      .where('standard_id', '=', req.params.standardId)
      .selectAll()
      .executeTakeFirst();

    if (!requirement) {
      res.status(404).json({ error: 'Requirement not found' });
      return;
    }

    const { identifier, name, description, openCre, parentId } = req.body;

    // Validate parentId if provided (prevent self-reference and circular references)
    if (parentId !== undefined && parentId !== null) {
      if (parentId === req.params.reqId) {
        res.status(400).json({ error: 'A requirement cannot be its own parent' });
        return;
      }
      const parent = await db
        .selectFrom('requirement')
        .where('id', '=', parentId)
        .where('standard_id', '=', req.params.standardId as string)
        .selectAll()
        .executeTakeFirst();

      if (!parent) {
        res.status(400).json({ error: 'Parent requirement not found in this standard' });
        return;
      }
    }

    try {
      await db
        .updateTable('requirement')
        .set(toSnakeCase({
          ...(identifier && { identifier }),
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(openCre !== undefined && { openCre }),
          ...(parentId !== undefined && { parentId: parentId || null }),
        }))
        .where('id', '=', req.params.reqId)
        .execute();
    } catch (error: unknown) {
      const err = error as Record<string, unknown> | null;
      const msg = err?.message as string | undefined;
      if (msg?.includes('duplicate') || msg?.includes('unique')) {
        res.status(409).json({ error: 'A requirement with this identifier already exists in this standard' });
        return;
      }
      throw error;
    }

    const updated = await db
      .selectFrom('requirement')
      .where('id', '=', req.params.reqId)
      .selectAll()
      .executeTakeFirst();

    logger.info('Requirement updated in standard', {
      standardId: req.params.standardId,
      requirementId: req.params.reqId,
      requestId: req.requestId,
    });

    res.json(updated);
  })
);

// Delete a requirement from a draft standard
router.delete(
  '/:standardId/requirements/:reqId',
  requireAuth,
  requirePermission('requirements.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'draft') {
      res.status(403).json({ error: 'Can only delete requirements from draft standards' });
      return;
    }

    const requirement = await db
      .selectFrom('requirement')
      .where('id', '=', req.params.reqId)
      .where('standard_id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!requirement) {
      res.status(404).json({ error: 'Requirement not found' });
      return;
    }

    await db
      .deleteFrom('requirement')
      .where('id', '=', req.params.reqId)
      .execute();

    logger.info('Requirement deleted from standard', {
      standardId: req.params.standardId as string,
      requirementId: req.params.reqId,
      requestId: req.requestId,
    });

    res.status(204).send();
  })
);

// =====================================================================
// Level management routes
// =====================================================================

// Add a level to a draft standard
router.post(
  '/:standardId/levels',
  requireAuth,
  requirePermission('standards.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) { res.status(404).json({ error: 'Standard not found' }); return; }
    if (standard.state !== 'draft') { res.status(403).json({ error: 'Can only add levels to draft standards' }); return; }

    const { identifier, title, description } = req.body;
    if (!identifier) { res.status(400).json({ error: 'Missing required field: identifier' }); return; }

    const levelId = uuidv4();
    try {
      await db
        .insertInto('level')
        .values({ id: levelId, identifier, title: title || null, description: description || null, standard_id: req.params.standardId as string })
        .execute();
    } catch (error: unknown) {
      const err = error as Record<string, unknown> | null;
      const msg = err?.message as string | undefined;
      if (msg?.includes('duplicate') || msg?.includes('unique')) {
        res.status(409).json({ error: 'A level with this identifier already exists in this standard' });
        return;
      }
      throw error;
    }

    const created = await db.selectFrom('level').where('id', '=', levelId).selectAll().executeTakeFirst();
    logger.info('Level added', { standardId: req.params.standardId as string, levelId, requestId: req.requestId });
    res.status(201).json(created);
  })
);

// Update a level in a draft standard
router.put(
  '/:standardId/levels/:levelId',
  requireAuth,
  requirePermission('standards.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) { res.status(404).json({ error: 'Standard not found' }); return; }
    if (standard.state !== 'draft') { res.status(403).json({ error: 'Can only edit levels in draft standards' }); return; }

    const level = await db
      .selectFrom('level')
      .where('id', '=', req.params.levelId)
      .where('standard_id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!level) { res.status(404).json({ error: 'Level not found' }); return; }

    const { identifier, title, description } = req.body;

    try {
      await db
        .updateTable('level')
        .set({
          ...(identifier !== undefined && { identifier }),
          ...(title !== undefined && { title: title || null }),
          ...(description !== undefined && { description: description || null }),
        })
        .where('id', '=', req.params.levelId)
        .execute();
    } catch (error: unknown) {
      const err = error as Record<string, unknown> | null;
      const msg = err?.message as string | undefined;
      if (msg?.includes('duplicate') || msg?.includes('unique')) {
        res.status(409).json({ error: 'A level with this identifier already exists in this standard' });
        return;
      }
      throw error;
    }

    const updated = await db.selectFrom('level').where('id', '=', req.params.levelId).selectAll().executeTakeFirst();
    res.json(updated);
  })
);

// Delete a level from a draft standard
router.delete(
  '/:standardId/levels/:levelId',
  requireAuth,
  requirePermission('standards.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.standardId)
      .selectAll()
      .executeTakeFirst();

    if (!standard) { res.status(404).json({ error: 'Standard not found' }); return; }
    if (standard.state !== 'draft') { res.status(403).json({ error: 'Can only delete levels from draft standards' }); return; }

    await db.deleteFrom('level').where('id', '=', req.params.levelId).where('standard_id', '=', req.params.standardId as string).execute();
    res.status(204).send();
  })
);

// Set requirements for a level (replaces all current assignments)
router.put(
  '/:standardId/levels/:levelId/requirements',
  requireAuth,
  requirePermission('standards.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) { res.status(404).json({ error: 'Standard not found' }); return; }
    if (standard.state !== 'draft') { res.status(403).json({ error: 'Can only modify level requirements in draft standards' }); return; }

    const level = await db
      .selectFrom('level')
      .where('id', '=', req.params.levelId)
      .where('standard_id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!level) { res.status(404).json({ error: 'Level not found' }); return; }

    const { requirementIds } = req.body;
    if (!Array.isArray(requirementIds)) { res.status(400).json({ error: 'requirementIds must be an array' }); return; }

    // Clear existing and re-insert
    await db.deleteFrom('level_requirement').where('level_id', '=', req.params.levelId).execute();

    for (const reqId of requirementIds) {
      try {
        await db
          .insertInto('level_requirement')
          .values({ level_id: req.params.levelId, requirement_id: reqId })
          .execute();
      } catch (insertErr: unknown) {
        const err = insertErr as Record<string, unknown> | null;
        const msg = err?.message as string | undefined;
        if (msg?.includes('duplicate') || msg?.includes('unique')) continue;
        throw insertErr;
      }
    }

    logger.info('Level requirements updated', { standardId: req.params.standardId, levelId: req.params.levelId, count: requirementIds.length, requestId: req.requestId });
    res.json({ success: true, count: requirementIds.length });
  })
);

// Delete a draft or retired standard (retired only if no references exist)
router.delete(
  '/:id',
  requireAuth,
  requirePermission('standards.approve'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'draft' && standard.state !== 'retired') {
      res.status(403).json({ error: 'Only draft or retired standards can be deleted' });
      return;
    }

    // For retired standards, verify no other objects reference it
    if (standard.state === 'retired') {
      const requirementIds = await db
        .selectFrom('requirement')
        .where('standard_id', '=', req.params.id as string)
        .select('id')
        .execute();

      const reqIdList = requirementIds.map((r) => r.id);

      // Check project_standard references
      const projectRefs = await db
        .selectFrom('project_standard')
        .where('standard_id', '=', req.params.id as string)
        .select(db.fn.count<number>('project_id').as('count'))
        .executeTakeFirstOrThrow();

      if (Number(projectRefs.count) > 0) {
        res.status(409).json({ error: 'Cannot delete: standard is still referenced by one or more projects' });
        return;
      }

      // Check entity_standard references
      const entityRefs = await db
        .selectFrom('entity_standard')
        .where('standard_id', '=', req.params.id as string)
        .select(db.fn.count<number>('entity_id').as('count'))
        .executeTakeFirstOrThrow();

      if (Number(entityRefs.count) > 0) {
        res.status(409).json({ error: 'Cannot delete: standard is still referenced by one or more entities' });
        return;
      }

      // Check compliance_policy references
      const policyRefs = await db
        .selectFrom('compliance_policy')
        .where('standard_id', '=', req.params.id as string)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow();

      if (Number(policyRefs.count) > 0) {
        res.status(409).json({ error: 'Cannot delete: standard is still referenced by one or more compliance policies' });
        return;
      }

      // Check assessment references
      const assessmentRefs = await db
        .selectFrom('assessment')
        .where('standard_id', '=', req.params.id as string)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow();

      if (Number(assessmentRefs.count) > 0) {
        res.status(409).json({ error: 'Cannot delete: standard is still referenced by one or more assessments' });
        return;
      }

      // Check if any requirements are referenced by assessment_requirement, attestation_requirement, or claims
      if (reqIdList.length > 0) {
        const assessmentReqRefs = await db
          .selectFrom('assessment_requirement')
          .where('requirement_id', 'in', reqIdList)
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow();

        if (Number(assessmentReqRefs.count) > 0) {
          res.status(409).json({ error: 'Cannot delete: requirements from this standard are referenced by assessment data' });
          return;
        }

        const attestationReqRefs = await db
          .selectFrom('attestation_requirement')
          .where('requirement_id', 'in', reqIdList)
          .select(db.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow();

        if (Number(attestationReqRefs.count) > 0) {
          res.status(409).json({ error: 'Cannot delete: requirements from this standard are referenced by attestation data' });
          return;
        }
      }
    }

    // CASCADE will remove requirements, levels, level_requirements
    await db
      .deleteFrom('standard')
      .where('id', '=', req.params.id as string)
      .execute();

    logger.info('Standard deleted', {
      standardId: req.params.id as string,
      state: standard.state,
      deletedBy: req.user!.id,
      requestId: req.requestId,
    });

    res.status(204).send();
  })
);

// Reparent a requirement (move it to a different parent via drag/drop)
router.put(
  '/:standardId/requirements/:reqId/reparent',
  requireAuth,
  requirePermission('requirements.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const standard = await db
      .selectFrom('standard')
      .where('id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!standard) {
      res.status(404).json({ error: 'Standard not found' });
      return;
    }

    if (standard.state !== 'draft') {
      res.status(403).json({ error: 'Can only reparent requirements in draft standards' });
      return;
    }

    const requirement = await db
      .selectFrom('requirement')
      .where('id', '=', req.params.reqId)
      .where('standard_id', '=', req.params.standardId as string)
      .selectAll()
      .executeTakeFirst();

    if (!requirement) {
      res.status(404).json({ error: 'Requirement not found' });
      return;
    }

    const { parent_id: newParentId } = req.body;

    // Prevent self-reference
    if (newParentId === req.params.reqId) {
      res.status(400).json({ error: 'A requirement cannot be its own parent' });
      return;
    }

    // Validate parent exists in this standard (if not null)
    if (newParentId) {
      const parent = await db
        .selectFrom('requirement')
        .where('id', '=', newParentId)
        .where('standard_id', '=', req.params.standardId as string)
        .selectAll()
        .executeTakeFirst();

      if (!parent) {
        res.status(400).json({ error: 'Parent requirement not found in this standard' });
        return;
      }

      // Prevent circular references: walk up from proposed parent to ensure
      // it does not eventually reach the requirement being moved
      let cursor = parent;
      while (cursor.parent_id) {
        if (cursor.parent_id === req.params.reqId) {
          res.status(400).json({ error: 'This move would create a circular reference' });
          return;
        }
        const next = await db
          .selectFrom('requirement')
          .where('id', '=', cursor.parent_id)
          .where('standard_id', '=', req.params.standardId as string)
          .selectAll()
          .executeTakeFirst();
        if (!next) break;
        cursor = next;
      }
    }

    await db
      .updateTable('requirement')
      .set({ parent_id: newParentId || null })
      .where('id', '=', req.params.reqId)
      .execute();

    logger.info('Requirement reparented', {
      standardId: req.params.standardId as string,
      requirementId: req.params.reqId,
      newParentId: newParentId || null,
      requestId: req.requestId,
    });

    res.json({ success: true });
  })
);

export default router;
