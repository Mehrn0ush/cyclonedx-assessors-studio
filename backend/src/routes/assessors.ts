import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';

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
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const assessors = (await db
      .selectFrom('assessor')
      .leftJoin('entity', (join) =>
        join.onRef('entity.id' as any, '=', 'assessor.entity_id' as any)
      )
      .leftJoin('app_user', (join) =>
        join.onRef('app_user.id' as any, '=', 'assessor.user_id' as any)
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
      .execute()) as any[];

    res.json({ data: assessors });
  } catch (error) {
    logger.error('List assessors error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:id - Get assessor detail
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const assessor = await db
      .selectFrom('assessor')
      .leftJoin('entity', (join) =>
        join.onRef('entity.id' as any, '=', 'assessor.entity_id' as any)
      )
      .leftJoin('app_user', (join) =>
        join.onRef('app_user.id' as any, '=', 'assessor.user_id' as any)
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
      .leftJoin('assessment', (join) =>
        join.onRef('assessment.id' as any, '=', 'attestation.assessment_id' as any)
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
      .execute()) as any[];

    res.json({ ...assessor, attestations });
  } catch (error) {
    logger.error('Get assessor error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST / - Create assessor
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
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
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.issues });
        return;
      }
      logger.error('Create assessor error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /:id - Update assessor
router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
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

      const updateData: any = { updated_at: new Date() };
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
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.issues });
        return;
      }
      logger.error('Update assessor error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// DELETE /:id - Delete assessor
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      logger.error('Delete assessor error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
