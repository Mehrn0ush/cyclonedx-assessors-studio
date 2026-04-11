import { Router } from 'express';
import type { Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { validatePagination } from '../utils/pagination.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const { limit, offset } = validatePagination(req.query);
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
}));

router.put('/:id/read', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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

  // Fetch and return the updated notification
  const updatedNotification = await db
    .selectFrom('notification')
    .where('id', '=', req.params.id)
    .selectAll()
    .executeTakeFirst();

  res.json(updatedNotification);
}));

router.put('/read-all', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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

  // Return the updated notifications
  const updatedNotifications = await db
    .selectFrom('notification')
    .where('user_id', '=', req.user!.id)
    .selectAll()
    .orderBy('created_at', 'desc')
    .execute();

  res.json({ data: updatedNotifications });
}));

router.get('/count', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const result = await db
    .selectFrom('notification')
    .select(db.fn.count<number>('id').as('count'))
    .where('user_id', '=', req.user!.id)
    .where('is_read', '=', false)
    .executeTakeFirstOrThrow();

  res.json({ unreadCount: result.count });
}));

export default router;
