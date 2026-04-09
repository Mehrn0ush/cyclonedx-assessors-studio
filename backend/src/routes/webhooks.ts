/**
 * Webhook management API routes (spec 004).
 *
 * Admin-only endpoints for creating, updating, deleting, testing,
 * and re-enabling webhook subscriptions, plus delivery log access.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { getEventBus } from '../events/index.js';
import { CHANNEL_TEST } from '../events/catalog.js';
import { validatePagination } from '../utils/pagination.js';

const router = Router();

/**
 * Generate a cryptographically secure webhook secret.
 */
function generateSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

// ---- Schemas ----

const createWebhookSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  url: z.string().url('URL must be a valid URL'),
  eventTypes: z.array(z.string().min(1)).min(1, 'At least one event type is required'),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url('URL must be a valid URL').optional(),
  eventTypes: z.array(z.string().min(1)).min(1).optional(),
  regenerateSecret: z.boolean().optional(),
});

// ---- Routes ----

/**
 * GET /api/v1/webhooks
 * List all webhooks (admin only).
 */
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const webhooks = await db
        .selectFrom('webhook')
        .select([
          'id', 'name', 'url', 'event_types', 'is_active',
          'consecutive_failures', 'created_by', 'created_at', 'updated_at',
        ])
        .orderBy('created_at', 'desc')
        .execute();

      res.json({ data: webhooks });
    } catch (error) {
      logger.error('List webhooks error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * POST /api/v1/webhooks
 * Create a webhook (admin only).
 */
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createWebhookSchema.parse(req.body);
      const db = getDatabase();

      const id = uuidv4();
      const secret = generateSecret();

      await db
        .insertInto('webhook')
        .values({
          id,
          name: data.name,
          url: data.url,
          secret,
          event_types: data.eventTypes as any,
          is_active: true,
          consecutive_failures: 0,
          created_by: req.user!.id,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();

      // Return the secret only on create (it is never returned again in full)
      res.status(201).json({
        id,
        name: data.name,
        url: data.url,
        secret,
        eventTypes: data.eventTypes,
        isActive: true,
        consecutiveFailures: 0,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }
      logger.error('Create webhook error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * GET /api/v1/webhooks/:id
 * Get webhook details with recent delivery stats (admin only).
 */
router.get(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const webhook = await db
        .selectFrom('webhook')
        .where('id', '=', req.params.id)
        .select([
          'id', 'name', 'url', 'event_types', 'is_active',
          'consecutive_failures', 'created_by', 'created_at', 'updated_at',
        ])
        .executeTakeFirst();

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      // Get recent delivery stats
      const stats = await db
        .selectFrom('webhook_delivery')
        .where('webhook_id', '=', req.params.id)
        .select([
          db.fn.count<number>('id').as('total_deliveries'),
        ])
        .executeTakeFirst();

      const successCount = await db
        .selectFrom('webhook_delivery')
        .where('webhook_id', '=', req.params.id)
        .where('status', '=', 'success')
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      const lastSuccess = await db
        .selectFrom('webhook_delivery')
        .where('webhook_id', '=', req.params.id)
        .where('status', '=', 'success')
        .orderBy('delivered_at', 'desc')
        .select('delivered_at')
        .executeTakeFirst();

      res.json({
        ...webhook,
        deliveryStats: {
          totalDeliveries: Number(stats?.total_deliveries ?? 0),
          successfulDeliveries: Number(successCount?.count ?? 0),
          lastSuccessAt: lastSuccess?.delivered_at || null,
        },
      });
    } catch (error) {
      logger.error('Get webhook error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * PUT /api/v1/webhooks/:id
 * Update webhook config (admin only).
 */
router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateWebhookSchema.parse(req.body);
      const db = getDatabase();

      const webhook = await db
        .selectFrom('webhook')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      const updates: Record<string, any> = { updated_at: new Date() };
      let newSecret: string | null = null;

      if (data.name !== undefined) updates.name = data.name;
      if (data.url !== undefined) updates.url = data.url;
      if (data.eventTypes !== undefined) updates.event_types = data.eventTypes as any;
      if (data.regenerateSecret) {
        newSecret = generateSecret();
        updates.secret = newSecret;
      }

      await db
        .updateTable('webhook')
        .set(updates)
        .where('id', '=', req.params.id)
        .execute();

      const result: Record<string, any> = {
        id: webhook.id,
        name: data.name ?? webhook.name,
        url: data.url ?? webhook.url,
        eventTypes: data.eventTypes ?? webhook.event_types,
        isActive: webhook.is_active,
      };

      // Only include secret if it was regenerated
      if (newSecret) {
        result.secret = newSecret;
      }

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }
      logger.error('Update webhook error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * DELETE /api/v1/webhooks/:id
 * Delete webhook and all delivery history (admin only).
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      // Verify the webhook exists before deleting
      const existing = await db
        .selectFrom('webhook')
        .select('id')
        .where('id', '=', req.params.id)
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      await db
        .deleteFrom('webhook')
        .where('id', '=', req.params.id)
        .execute();

      res.json({ message: 'Webhook deleted successfully' });
    } catch (error) {
      logger.error('Delete webhook error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * POST /api/v1/webhooks/:id/test
 * Deliver a channel.test event to this webhook (admin only).
 */
router.post(
  '/:id/test',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const webhook = await db
        .selectFrom('webhook')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      // Emit a test event through the event bus
      const eventBus = getEventBus();
      const envelope = eventBus.emit(
        CHANNEL_TEST,
        {
          webhookId: webhook.id,
          webhookName: webhook.name,
          message: 'This is a test delivery from CycloneDX Assessors Studio',
        },
        { userId: req.user!.id, displayName: req.user!.displayName },
      );

      res.json({
        message: 'Test event emitted',
        eventId: envelope?.id || null,
      });
    } catch (error) {
      logger.error('Test webhook error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * POST /api/v1/webhooks/:id/enable
 * Re-enable a disabled webhook and reset its failure counter (admin only).
 */
router.post(
  '/:id/enable',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const webhook = await db
        .selectFrom('webhook')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      await db
        .updateTable('webhook')
        .set({
          is_active: true,
          consecutive_failures: 0,
          updated_at: new Date(),
        })
        .where('id', '=', req.params.id)
        .execute();

      res.json({
        message: 'Webhook re-enabled',
        id: webhook.id,
        isActive: true,
        consecutiveFailures: 0,
      });
    } catch (error) {
      logger.error('Enable webhook error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * GET /api/v1/webhooks/:id/deliveries
 * Paginated delivery log for a webhook (admin only).
 */
router.get(
  '/:id/deliveries',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { limit, offset } = validatePagination(req.query);

      // Verify webhook exists
      const webhook = await db
        .selectFrom('webhook')
        .where('id', '=', req.params.id)
        .select('id')
        .executeTakeFirst();

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      const totalResult = await db
        .selectFrom('webhook_delivery')
        .where('webhook_id', '=', req.params.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      const total = Number(totalResult?.count ?? 0);

      const deliveries = await db
        .selectFrom('webhook_delivery')
        .where('webhook_id', '=', req.params.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit)
        .execute();

      res.json({
        data: deliveries,
        pagination: {
          limit,
          offset,
          total,
        },
      });
    } catch (error) {
      logger.error('List webhook deliveries error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
