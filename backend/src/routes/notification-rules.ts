/**
 * User notification rules CRUD API.
 *
 * Routes for managing user-level notification rules.
 * Each user can only manage their own rules.
 */

import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const createRuleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  channel: z.enum(['in_app', 'email', 'slack', 'teams', 'mattermost', 'webhook']),
  eventTypes: z.array(z.string()).min(1, 'At least one event type is required'),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  destination: z.record(z.string(), z.unknown()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});

const updateRuleSchema = createRuleSchema.partial();

/**
 * GET /notification-rules
 * List current user's notification rules
 */
router.get('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const userId = req.user?.id;

  const rules = await db
    .selectFrom('notification_rule')
    .where('user_id', '=', userId!)
    .where('scope', '=', 'user')
    .selectAll()
    .orderBy('created_at', 'desc')
    .execute();

  res.json(rules);
}));

/**
 * POST /notification-rules
 * Create a new user notification rule
 */
router.post('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createRuleSchema.parse(req.body);
    const db = getDatabase();
    const ruleId = uuidv4();
    const userId = req.user?.id;

    // Validate event types are from catalog (basic validation)
    const validEventTypes = [
      'assessment.created',
      'assessment.state_changed',
      'evidence.state_changed',
      'attestation.created',
      'attestation.signed',
      '*',
    ];

    for (const eventType of data.eventTypes) {
      if (!validEventTypes.includes(eventType)) {
        res.status(400).json({ error: `Invalid event type: ${eventType}` });
        return;
      }
    }

    // Create rule (always user-scoped)
    await db
      .insertInto('notification_rule')
      .values({
        id: ruleId,
        name: data.name,
        scope: 'user',
        user_id: userId,
        channel: data.channel,
        event_types: JSON.stringify(data.eventTypes),
        filters: JSON.stringify(data.filters),
        destination: JSON.stringify(data.destination),
        enabled: data.enabled,
        created_by: userId,
      })
      .execute();

    const rule = await db
      .selectFrom('notification_rule')
      .where('id', '=', ruleId)
      .selectAll()
      .executeTakeFirstOrThrow();

    logger.info('Created notification rule', {
      ruleId,
      userId,
    });

    res.status(201).json(rule);
  } catch (error) {
    if (handleValidationError(res, error)) return;
    throw error;
  }
}));

/**
 * GET /notification-rules/:id
 * Get a single user notification rule (must belong to current user)
 */
router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const db = getDatabase();
  const userId = req.user?.id;

  const rule = await db
    .selectFrom('notification_rule')
    .where('id', '=', id)
    .where('user_id', '=', userId!)
    .where('scope', '=', 'user')
    .selectAll()
    .executeTakeFirst();

  if (!rule) {
    res.status(404).json({ error: 'Notification rule not found' });
    return;
  }

  res.json(rule);
}));

/**
 * PUT /notification-rules/:id
 * Update a user notification rule (must belong to current user)
 */
router.put('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updateRuleSchema.parse(req.body);
    const db = getDatabase();
    const userId = req.user?.id;

    // Check rule exists and belongs to user
    const existing = await db
      .selectFrom('notification_rule')
      .where('id', '=', id)
      .where('user_id', '=', userId!)
      .where('scope', '=', 'user')
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      res.status(404).json({ error: 'Notification rule not found' });
      return;
    }

    // Validate event types if provided
    if (data.eventTypes) {
      const validEventTypes = [
        'assessment.created',
        'assessment.state_changed',
        'evidence.state_changed',
        'attestation.created',
        'attestation.signed',
        '*',
      ];

      for (const eventType of data.eventTypes) {
        if (!validEventTypes.includes(eventType)) {
          res.status(400).json({ error: `Invalid event type: ${eventType}` });
          return;
        }
      }
    }

    // Update rule
    const updates: Record<string, any> = {};
    if (data.name) updates.name = data.name;
    if (data.channel) updates.channel = data.channel;
    if (data.eventTypes) updates.event_types = JSON.stringify(data.eventTypes);
    if (data.filters) updates.filters = JSON.stringify(data.filters);
    if (data.destination) updates.destination = JSON.stringify(data.destination);
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    updates.updated_at = new Date();

    await db
      .updateTable('notification_rule')
      .set(updates)
      .where('id', '=', id)
      .execute();

    const rule = await db
      .selectFrom('notification_rule')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirstOrThrow();

    logger.info('Updated notification rule', {
      ruleId: id,
      userId,
    });

    res.json(rule);
  } catch (error) {
    if (handleValidationError(res, error)) return;
    throw error;
  }
}));

/**
 * DELETE /notification-rules/:id
 * Delete a user notification rule (must belong to current user)
 */
router.delete('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const db = getDatabase();
  const userId = req.user?.id;

  // Check rule exists and belongs to user
  const existing = await db
    .selectFrom('notification_rule')
    .where('id', '=', id)
    .where('user_id', '=', userId!)
    .where('scope', '=', 'user')
    .selectAll()
    .executeTakeFirst();

  if (!existing) {
    res.status(404).json({ error: 'Notification rule not found' });
    return;
  }

  // Delete rule
  await db
    .deleteFrom('notification_rule')
    .where('id', '=', id)
    .execute();

  logger.info('Deleted notification rule', {
    ruleId: id,
    userId,
  });

  res.status(204).send();
}));

export default router;
