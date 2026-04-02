import { Router, Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';

    let query = db
      .selectFrom('notification')
      .where('user_id', '=', req.user!.id);

    if (unreadOnly) {
      query = query.where('is_read', '=', false);
    }

    const total = await db
      .selectFrom('notification')
      .select(db.fn.count<number>('id').as('count'))
      .where('user_id', '=', req.user!.id)
      .executeTakeFirstOrThrow()
      .then(r => r.count);

    const notifications = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    res.json({
      data: notifications,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    logger.error('Get notifications error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/read', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const notification = await db
      .selectFrom('notification')
      .where('id', '=', req.params.id)
      .where('user_id', '=', req.user!.id)
      .selectAll()
      .executeTakeFirst();

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    await db
      .updateTable('notification')
      .set({ is_read: true })
      .where('id', '=', req.params.id)
      .execute();

    logger.info('Notification marked as read', {
      notificationId: req.params.id,
      requestId: req.requestId,
    });

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    logger.error('Mark notification as read error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/read-all', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    await db
      .updateTable('notification')
      .set({ is_read: true })
      .where('user_id', '=', req.user!.id)
      .where('is_read', '=', false)
      .execute();

    logger.info('All notifications marked as read', {
      userId: req.user!.id,
      requestId: req.requestId,
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('Mark all notifications as read error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/count', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const result = await db
      .selectFrom('notification')
      .select(db.fn.count<number>('id').as('count'))
      .where('user_id', '=', req.user!.id)
      .where('is_read', '=', false)
      .executeTakeFirstOrThrow();

    res.json({ unreadCount: result.count });
  } catch (error) {
    logger.error('Get notification count error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
