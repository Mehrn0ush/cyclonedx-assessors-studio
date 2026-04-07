import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';

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
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const tags = await db.selectFrom('tag').selectAll().orderBy('name', 'asc').execute();
    res.json({ data: tags });
  } catch (error) {
    logger.error('Get tags error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Tag autocomplete
router.get('/autocomplete', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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
  } catch (error) {
    logger.error('Tag autocomplete error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create tag
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
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
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }
      logger.error('Create tag error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update tag
router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateTagSchema.parse(req.body);
      const db = getDatabase();

      const tag = await db.selectFrom('tag').where('id', '=', req.params.id).selectAll().executeTakeFirst();
      if (!tag) {
        res.status(404).json({ error: 'Tag not found' });
        return;
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.color !== undefined) updateData.color = data.color;

      if (Object.keys(updateData).length > 0) {
        await db.updateTable('tag').set(updateData).where('id', '=', req.params.id).execute();
      }

      // Fetch and return the updated tag
      const updatedTag = await db.selectFrom('tag').where('id', '=', req.params.id).selectAll().executeTakeFirst();

      res.json(updatedTag);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }
      logger.error('Update tag error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete tag
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      logger.error('Delete tag error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
