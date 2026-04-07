import { Router, Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { validatePagination } from '../utils/pagination.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const { limit, offset } = validatePagination(req.query);
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const action = req.query.action as string | undefined;

    let query = db.selectFrom('audit_log').selectAll();

    if (entityType) {
      query = query.where('entity_type', '=', entityType);
    }

    if (entityId) {
      query = query.where('entity_id', '=', entityId);
    }

    if (userId) {
      query = query.where('user_id', '=', userId);
    }

    if (action) {
      query = query.where('action', '=', action as any);
    }

    const total = await db
      .selectFrom('audit_log')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => r.count);

    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    res.json({
      data: logs,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    logger.error('Get audit logs error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/entity/:entityType/:entityId',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { limit, offset } = validatePagination(req.query);

      const total = await db
        .selectFrom('audit_log')
        .select(db.fn.count<number>('id').as('count'))
        .where('entity_type', '=', req.params.entityType)
        .where('entity_id', '=', req.params.entityId)
        .executeTakeFirstOrThrow()
        .then(r => r.count);

      const logs = await db
        .selectFrom('audit_log')
        .where('entity_type', '=', req.params.entityType)
        .where('entity_id', '=', req.params.entityId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

      res.json({
        data: logs,
        pagination: {
          limit,
          offset,
          total,
        },
      });
    } catch (error) {
      logger.error('Get entity audit logs error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
