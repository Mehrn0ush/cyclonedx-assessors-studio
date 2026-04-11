import { Router } from 'express';
import type { Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.js';
import { validatePagination } from '../utils/pagination.js';

const router = Router();

router.get('/', requireAuth, requirePermission('admin.audit'), asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
}));

router.get(
  '/entity/:entityType/:entityId',
  requireAuth,
  requirePermission('admin.audit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
  })
);

export default router;
