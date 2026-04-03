import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { toSnakeCase } from '../middleware/camelCase.js';

const router = Router();

const importStandardSchema = z.object({
  identifier: z.string(),
  name: z.string(),
  description: z.string().optional(),
  owner: z.string().optional(),
  version: z.string().optional(),
  licenseId: z.string().optional(),
  requirements: z
    .array(
      z.object({
        identifier: z.string(),
        name: z.string(),
        description: z.string().optional(),
        openCre: z.string().optional(),
        parentIdentifier: z.string().optional(),
      })
    )
    .optional(),
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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
      .execute()) as any[];

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
  } catch (error) {
    logger.error('Get standards error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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
      .where('standard_id', '=', req.params.id)
      .selectAll()
      .execute();

    const requirementTree = buildRequirementTree(requirements);

    // Fetch levels with their associated requirement bom-refs
    const levels = await db
      .selectFrom('level')
      .where('standard_id', '=', req.params.id)
      .selectAll()
      .execute();

    const levelRequirements = await db
      .selectFrom('level_requirement')
      .innerJoin('level', 'level.id', 'level_requirement.level_id')
      .innerJoin('requirement', 'requirement.id', 'level_requirement.requirement_id')
      .where('level.standard_id', '=', req.params.id)
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
  } catch (error) {
    logger.error('Get standard error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/import',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = importStandardSchema.parse(req.body);
      const db = getDatabase();
      const standardId = uuidv4();

      await db
        .insertInto('standard')
        .values(toSnakeCase({
          id: standardId,
          identifier: data.identifier,
          name: data.name,
          description: data.description,
          owner: data.owner,
          version: data.version,
          licenseId: data.licenseId,
          state: 'published',
          isImported: true,
        }))
        .execute();

      if (data.requirements && data.requirements.length > 0) {
        const requirementMap = new Map<string, string>();

        for (const req of data.requirements) {
          const requirementId = uuidv4();

          const parentId =
            req.parentIdentifier && requirementMap.has(req.parentIdentifier)
              ? requirementMap.get(req.parentIdentifier)
              : null;

          await db
            .insertInto('requirement')
            .values(toSnakeCase({
              id: requirementId,
              identifier: req.identifier,
              name: req.name,
              description: req.description,
              openCre: req.openCre,
              parentId: parentId,
              standardId: standardId,
            }))
            .execute();

          requirementMap.set(req.identifier, requirementId);
        }
      }

      logger.info('Standard imported', {
        standardId,
        identifier: data.identifier,
        name: data.name,
        requestId: req.requestId,
      });

      res.status(201).json({
        id: standardId,
        identifier: data.identifier,
        name: data.name,
        message: 'Standard imported successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Import standard error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Create a new draft standard
router.post(
  '/',
  requireAuth,
  requireRole('admin', 'standards_manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      logger.error('Create standard error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Edit a draft standard
router.put(
  '/:id',
  requireAuth,
  requireRole('admin', 'standards_manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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

      if (standard.state !== 'draft') {
        res.status(403).json({ error: 'Only draft standards can be edited' });
        return;
      }

      const { name, identifier, version, owner, description } = req.body;

      await db
        .updateTable('standard')
        .set({
          ...(name && { name }),
          ...(identifier && { identifier }),
          ...(version !== undefined && { version }),
          ...(owner !== undefined && { owner }),
          ...(description !== undefined && { description }),
        })
        .where('id', '=', req.params.id)
        .execute();

      const updated = await db
        .selectFrom('standard')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      logger.info('Standard updated', {
        standardId: req.params.id,
        requestId: req.requestId,
      });

      res.json(updated);
    } catch (error) {
      logger.error('Update standard error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Submit standard for approval
router.post(
  '/:id/submit',
  requireAuth,
  requireRole('admin', 'standards_manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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
        .where('id', '=', req.params.id)
        .execute();

      const updated = await db
        .selectFrom('standard')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      logger.info('Standard submitted for approval', {
        standardId: req.params.id,
        userId: req.user!.id,
        requestId: req.requestId,
      });

      res.json(updated);
    } catch (error) {
      logger.error('Submit standard error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Approve a standard
router.post(
  '/:id/approve',
  requireAuth,
  requireRole('admin', 'standards_approver'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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

      if (standard.state !== 'in_review') {
        res.status(403).json({ error: 'Only standards in review can be approved' });
        return;
      }

      if (standard.authored_by === req.user!.id) {
        res.status(403).json({ error: 'Cannot approve your own standard submission' });
        return;
      }

      await db
        .updateTable('standard')
        .set({
          state: 'published',
          approved_by: req.user!.id,
          approved_at: new Date(),
        })
        .where('id', '=', req.params.id)
        .execute();

      const updated = await db
        .selectFrom('standard')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      logger.info('Standard approved', {
        standardId: req.params.id,
        approvedBy: req.user!.id,
        requestId: req.requestId,
      });

      res.json(updated);
    } catch (error) {
      logger.error('Approve standard error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Reject a standard back to draft
router.post(
  '/:id/reject',
  requireAuth,
  requireRole('admin', 'standards_approver'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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

      if (standard.state !== 'in_review') {
        res.status(403).json({ error: 'Only standards in review can be rejected' });
        return;
      }

      if (standard.authored_by === req.user!.id) {
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
        .where('id', '=', req.params.id)
        .execute();

      const updated = await db
        .selectFrom('standard')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      logger.info('Standard rejected', {
        standardId: req.params.id,
        rejectedBy: req.user!.id,
        reason,
        requestId: req.requestId,
      });

      res.json(updated);
    } catch (error) {
      logger.error('Reject standard error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Duplicate a standard
router.post(
  '/:id/duplicate',
  requireAuth,
  requireRole('admin', 'standards_manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const original = await db
        .selectFrom('standard')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!original) {
        res.status(404).json({ error: 'Standard not found' });
        return;
      }

      const newId = uuidv4();
      const newVersion = original.version ? `${original.version}-draft` : 'draft';

      await db
        .insertInto('standard')
        .values(toSnakeCase({
          id: newId,
          identifier: `${original.identifier}-copy`,
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

      // Copy all requirements from original
      const requirements = await db
        .selectFrom('requirement')
        .where('standard_id', '=', req.params.id)
        .selectAll()
        .execute();

      const requirementMap = new Map<string, string>();

      for (const req_item of requirements) {
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

      const created = await db
        .selectFrom('standard')
        .where('id', '=', newId)
        .selectAll()
        .executeTakeFirst();

      logger.info('Standard duplicated', {
        originalId: req.params.id,
        newId,
        duplicatedBy: req.user!.id,
        requestId: req.requestId,
      });

      res.status(201).json(created);
    } catch (error) {
      logger.error('Duplicate standard error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Retire a published standard
router.post(
  '/:id/retire',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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

      if (standard.state !== 'published') {
        res.status(403).json({ error: 'Only published standards can be retired' });
        return;
      }

      await db
        .updateTable('standard')
        .set({
          state: 'retired',
        })
        .where('id', '=', req.params.id)
        .execute();

      const updated = await db
        .selectFrom('standard')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      logger.info('Standard retired', {
        standardId: req.params.id,
        retiredBy: req.user!.id,
        requestId: req.requestId,
      });

      res.json(updated);
    } catch (error) {
      logger.error('Retire standard error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Add a requirement to a draft standard
router.post(
  '/:id/requirements',
  requireAuth,
  requireRole('admin', 'standards_manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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

      if (standard.state !== 'draft') {
        res.status(403).json({ error: 'Can only add requirements to draft standards' });
        return;
      }

      const { identifier, name, description, open_cre, parentIdentifier } = req.body;

      if (!identifier || !name) {
        res.status(400).json({ error: 'Missing required fields: identifier and name' });
        return;
      }

      let parentId = null;
      if (parentIdentifier) {
        const parent = await db
          .selectFrom('requirement')
          .where('standard_id', '=', req.params.id)
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
          standardId: req.params.id,
        }))
        .execute();

      const created = await db
        .selectFrom('requirement')
        .where('id', '=', requirementId)
        .selectAll()
        .executeTakeFirst();

      logger.info('Requirement added to standard', {
        standardId: req.params.id,
        requirementId,
        requestId: req.requestId,
      });

      res.status(201).json(created);
    } catch (error) {
      logger.error('Add requirement error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Edit a requirement in a draft standard
router.put(
  '/:standardId/requirements/:reqId',
  requireAuth,
  requireRole('admin', 'standards_manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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

      const { identifier, name, description, openCre } = req.body;

      await db
        .updateTable('requirement')
        .set(toSnakeCase({
          ...(identifier && { identifier }),
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(openCre !== undefined && { openCre }),
        }))
        .where('id', '=', req.params.reqId)
        .execute();

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
    } catch (error) {
      logger.error('Update requirement error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete a requirement from a draft standard
router.delete(
  '/:standardId/requirements/:reqId',
  requireAuth,
  requireRole('admin', 'standards_manager'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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
        res.status(403).json({ error: 'Can only delete requirements from draft standards' });
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

      await db
        .deleteFrom('requirement')
        .where('id', '=', req.params.reqId)
        .execute();

      logger.info('Requirement deleted from standard', {
        standardId: req.params.standardId,
        requirementId: req.params.reqId,
        requestId: req.requestId,
      });

      res.status(204).send();
    } catch (error) {
      logger.error('Delete requirement error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

function buildRequirementTree(
  requirements: Array<{
    id: string;
    identifier: string;
    name: string;
    parent_id: string | null | undefined;
    description: string | null | undefined;
    open_cre: string | null | undefined;
    standard_id: string;
    created_at: Date;
    updated_at: Date;
  }>
): Array<any> {
  const map = new Map<string | null | undefined, Array<any>>();

  for (const req of requirements) {
    if (!map.has(req.parent_id)) {
      map.set(req.parent_id, []);
    }
    map.get(req.parent_id)!.push(req);
  }

  function buildNode(parentId: string | null | undefined): Array<any> {
    const children = map.get(parentId) || [];
    return children.map(child => ({
      id: child.id,
      identifier: child.identifier,
      name: child.name,
      parent_id: child.parent_id || null,
      description: child.description || null,
      open_cre: child.open_cre || null,
      children: buildNode(child.id),
    }));
  }

  return buildNode(null);
}

export default router;
