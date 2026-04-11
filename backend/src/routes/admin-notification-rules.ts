/**
 * Admin notification rules CRUD API.
 *
 * Routes for managing system-level notification rules.
 * All routes require admin role.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.js';

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
 * GET /admin/notification-rules
 * List all system notification rules
 */
router.get('/', requireAuth, requirePermission('admin.notification_rules'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const rules = await db
      .selectFrom('notification_rule')
      .where('scope', '=', 'system')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    res.json(rules);
  } catch (error) {
    logger.error('Failed to list notification rules', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to list notification rules' });
  }
});

/**
 * POST /admin/notification-rules
 * Create a new system notification rule
 */
router.post('/', requireAuth, requirePermission('admin.notification_rules'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createRuleSchema.parse(req.body);
    const db = getDatabase();
    const ruleId = uuidv4();

    // Validate event types are from catalog (basic validation)
    const validEventTypes = [
      // Assessment
      'assessment.created',
      'assessment.state_changed',
      'assessment.deleted',
      'assessment.assigned',
      // Evidence
      'evidence.created',
      'evidence.state_changed',
      'evidence.attachment_added',
      'evidence.attachment_removed',
      // Claim
      'claim.created',
      'claim.updated',
      // Attestation
      'attestation.created',
      'attestation.signed',
      'attestation.exported',
      // Project
      'project.created',
      'project.state_changed',
      'project.archived',
      // Standard
      'standard.imported',
      'standard.state_changed',
      // System
      'user.created',
      'user.deactivated',
      'apikey.created',
      // Wildcard
      '*',
    ];

    for (const eventType of data.eventTypes) {
      if (!validEventTypes.includes(eventType)) {
        res.status(400).json({ error: `Invalid event type: ${eventType}` });
        return;
      }
    }

    // Create rule
    await db
      .insertInto('notification_rule')
      .values({
        id: ruleId,
        name: data.name,
        scope: 'system',
        channel: data.channel,
        event_types: JSON.stringify(data.eventTypes),
        filters: JSON.stringify(data.filters),
        destination: JSON.stringify(data.destination),
        enabled: data.enabled,
        created_by: req.user?.id,
      })
      .execute();

    const rule = await db
      .selectFrom('notification_rule')
      .where('id', '=', ruleId)
      .selectAll()
      .executeTakeFirstOrThrow();

    logger.info('Created notification rule', {
      ruleId,
      userId: req.user?.id,
    });

    res.status(201).json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    logger.error('Failed to create notification rule', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to create notification rule' });
  }
});

/**
 * GET /admin/notification-rules/:id
 * Get a single system notification rule
 */
router.get('/:id', requireAuth, requirePermission('admin.notification_rules'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const rule = await db
      .selectFrom('notification_rule')
      .where('id', '=', id)
      .where('scope', '=', 'system')
      .selectAll()
      .executeTakeFirst();

    if (!rule) {
      res.status(404).json({ error: 'Notification rule not found' });
      return;
    }

    res.json(rule);
  } catch (error) {
    logger.error('Failed to get notification rule', {
      ruleId: req.params.id,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to get notification rule' });
  }
});

/**
 * PUT /admin/notification-rules/:id
 * Update a system notification rule
 */
router.put('/:id', requireAuth, requirePermission('admin.notification_rules'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updateRuleSchema.parse(req.body);
    const db = getDatabase();

    // Check rule exists
    const existing = await db
      .selectFrom('notification_rule')
      .where('id', '=', id)
      .where('scope', '=', 'system')
      .selectAll()
      .executeTakeFirst();

    if (!existing) {
      res.status(404).json({ error: 'Notification rule not found' });
      return;
    }

    // Validate event types if provided
    if (data.eventTypes) {
      const validEventTypes = [
        'assessment.created', 'assessment.state_changed', 'assessment.deleted', 'assessment.assigned',
        'evidence.created', 'evidence.state_changed', 'evidence.attachment_added', 'evidence.attachment_removed',
        'claim.created', 'claim.updated',
        'attestation.created', 'attestation.signed', 'attestation.exported',
        'project.created', 'project.state_changed', 'project.archived',
        'standard.imported', 'standard.state_changed',
        'user.created', 'user.deactivated', 'apikey.created',
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
      userId: req.user?.id,
    });

    res.json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    logger.error('Failed to update notification rule', {
      ruleId: req.params.id,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to update notification rule' });
  }
});

/**
 * DELETE /admin/notification-rules/:id
 * Delete a system notification rule
 */
router.delete('/:id', requireAuth, requirePermission('admin.notification_rules'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    // Check rule exists
    const existing = await db
      .selectFrom('notification_rule')
      .where('id', '=', id)
      .where('scope', '=', 'system')
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
      userId: req.user?.id,
    });

    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete notification rule', {
      ruleId: req.params.id,
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to delete notification rule' });
  }
});

export default router;
