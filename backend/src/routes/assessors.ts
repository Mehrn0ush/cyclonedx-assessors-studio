import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { logger } from '../utils/logger.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();

const createAssessorSchema = z.object({
  thirdParty: z.boolean(),
  entityId: z.string().uuid('Invalid entity ID').nullable().optional(),
  userId: z.string().uuid('Invalid user ID').nullable().optional(),
});

const updateAssessorSchema = z.object({
  thirdParty: z.boolean().optional(),
  entityId: z.string().uuid('Invalid entity ID').nullable().optional(),
  userId: z.string().uuid('Invalid user ID').nullable().optional(),
});

// GET / - List all assessors
router.get('/', requireAuth, asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const assessors = (await db
    .selectFrom('assessor')
    // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
    .leftJoin('entity', (join) =>
      // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
      join.onRef('entity.id' as any, '=',
        // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        'assessor.entity_id' as any)
    )
    // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
    .leftJoin('app_user', (join) =>
      // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
      join.onRef('app_user.id' as any, '=',
        // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        'assessor.user_id' as any)
    )
    .select([
      'assessor.id',
      'assessor.bom_ref',
      'assessor.third_party',
      'assessor.entity_id',
      'assessor.user_id',
      'assessor.created_at',
      'assessor.updated_at',
      'entity.name as entity_name',
      'entity.entity_type as entity_type',
      'app_user.display_name as user_display_name',
    ])
    .orderBy('assessor.created_at', 'desc')
    .execute()) as Record<string, unknown>[];

  res.json({ data: assessors });
}));

// GET /:id - Get assessor detail
router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const assessor = await db
    .selectFrom('assessor')
    // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
    .leftJoin('entity', (join) =>
      // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
      join.onRef('entity.id' as any, '=',
        // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        'assessor.entity_id' as any)
    )
    // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
    .leftJoin('app_user', (join) =>
      // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
      join.onRef('app_user.id' as any, '=',
        // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        'assessor.user_id' as any)
    )
    .select([
      'assessor.id',
      'assessor.bom_ref',
      'assessor.third_party',
      'assessor.entity_id',
      'assessor.user_id',
      'assessor.created_at',
      'assessor.updated_at',
      'entity.name as entity_name',
      'entity.entity_type as entity_type',
      'app_user.display_name as user_display_name',
    ])
    .where('assessor.id', '=', req.params.id)
    .executeTakeFirst();

  if (!assessor) {
    res.status(404).json({ error: 'Assessor not found' });
    return;
  }

  // Get attestations by this assessor
  const attestations = (await db
    .selectFrom('attestation')
    // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
    .leftJoin('assessment', (join) =>
      // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
      join.onRef('assessment.id' as any, '=',
        // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        'attestation.assessment_id' as any)
    )
    .where('attestation.assessor_id', '=', req.params.id)
    .select([
      'attestation.id',
      'attestation.summary',
      'attestation.created_at',
      'assessment.title as assessment_title',
      'assessment.id as assessment_id',
    ])
    .orderBy('attestation.created_at', 'desc')
    .execute()) as Record<string, unknown>[];

  res.json({ ...assessor, attestations });
}));

// POST / - Create assessor
router.post(
  '/',
  requireAuth,
  requirePermission('assessments.manage'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createAssessorSchema.parse(req.body);
      const db = getDatabase();

      const id = uuidv4();
      const bomRef = `assessor-${id.substring(0, 8)}`;

      await db.insertInto('assessor').values({
        id,
        bom_ref: bomRef,
        third_party: data.thirdParty,
        entity_id: data.entityId || null,
        user_id: data.userId || null,
      }).execute();

      logger.info('Assessor created', { assessorId: id, requestId: req.requestId });
      res.status(201).json({ id, bom_ref: bomRef, message: 'Assessor created successfully' });
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

// PUT /:id - Update assessor
router.put(
  '/:id',
  requireAuth,
  requirePermission('assessments.manage'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateAssessorSchema.parse(req.body);
      const db = getDatabase();

      const existing = await db
        .selectFrom('assessor')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ error: 'Assessor not found' });
        return;
      }

      const updateData: Record<string, unknown> = { updated_at: new Date() };
      if (data.thirdParty !== undefined) updateData.third_party = data.thirdParty;
      if (data.entityId !== undefined) updateData.entity_id = data.entityId;
      if (data.userId !== undefined) updateData.user_id = data.userId;

      await db.updateTable('assessor')
        .set(updateData)
        .where('id', '=', req.params.id)
        .execute();

      logger.info('Assessor updated', { assessorId: req.params.id, requestId: req.requestId });
      res.json({ message: 'Assessor updated successfully' });
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

// DELETE /:id - Delete assessor
router.delete(
  '/:id',
  requireAuth,
  requirePermission('assessments.manage'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    const existing = await db
      .selectFrom('assessor')
      .where('id', '=', req.params.id)
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      res.status(404).json({ error: 'Assessor not found' });
      return;
    }

    await db.deleteFrom('assessor')
      .where('id', '=', req.params.id)
      .execute();

    logger.info('Assessor deleted', { assessorId: req.params.id, requestId: req.requestId });
    res.json({ message: 'Assessor deleted successfully' });
  })
);

export default router;
