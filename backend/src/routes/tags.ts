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

const createTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color').default('#6366f1'),
});

const updateTagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// List all tags
router.get('/', requireAuth, asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const tags = await db.selectFrom('tag').selectAll().orderBy('name', 'asc').execute();
  res.json({ data: tags });
}));

// Tag autocomplete
router.get('/autocomplete', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const query = (req.query.q as string) || '';
  const db = getDatabase();

  const tags = await db
    .selectFrom('tag')
    .where('name', 'ilike', `%${query}%`)
    .selectAll()
    .orderBy('name', 'asc')
    .limit(10)
    .execute();

  res.json({ data: tags });
}));

// Create tag
router.post(
  '/',
  requireAuth,
  requirePermission('admin.tags'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createTagSchema.parse(req.body);
      const db = getDatabase();
      const tagId = uuidv4();

      await db
        .insertInto('tag')
        .values({ id: tagId, name: data.name, color: data.color, created_at: new Date() })
        .execute();

      logger.info('Tag created', { tagId, name: data.name, requestId: req.requestId });
      res.status(201).json({ id: tagId, name: data.name, color: data.color });
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

// Update tag
router.put(
  '/:id',
  requireAuth,
  requirePermission('admin.tags'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateTagSchema.parse(req.body);
      const db = getDatabase();

      const tag = await db.selectFrom('tag').where('id', '=', req.params.id).selectAll().executeTakeFirst();
      if (!tag) {
        res.status(404).json({ error: 'Tag not found' });
        return;
      }

      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.color !== undefined) updateData.color = data.color;

      if (Object.keys(updateData).length > 0) {
        await db.updateTable('tag').set(updateData).where('id', '=', req.params.id).execute();
      }

      // Fetch and return the updated tag
      const updatedTag = await db.selectFrom('tag').where('id', '=', req.params.id).selectAll().executeTakeFirst();

      res.json(updatedTag);
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

// Delete tag
router.delete(
  '/:id',
  requireAuth,
  requirePermission('admin.tags'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const tag = await db.selectFrom('tag').where('id', '=', req.params.id).selectAll().executeTakeFirst();

    // Idempotent: return 204 whether resource exists or not
    if (!tag) {
      res.status(204).send();
      return;
    }

    await db.deleteFrom('tag').where('id', '=', req.params.id).execute();
    logger.info('Tag deleted', { tagId: req.params.id, requestId: req.requestId });
    res.status(204).send();
  })
);

export default router;
