/**
 * Webhook management API routes.
 *
 * Admin-only endpoints for creating, updating, deleting, testing,
 * and re-enabling webhook subscriptions, plus delivery log access.
 */

import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDatabase } from '../db/connection.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.js';
import { getEventBus } from '../events/index.js';
import { CHANNEL_TEST } from '../events/catalog.js';
import { validatePagination } from '../utils/pagination.js';
import { encryptionService } from '../utils/encryption.js';

const router = Router();

/**
 * Generate a cryptographically secure webhook secret.
 */
function generateSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Validate that a webhook URL does not target private/internal networks (SSRF protection).
 * Blocks localhost, link-local, private RFC 1918, and cloud metadata endpoints.
 */
function isPrivateOrReservedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase();

    // Block obvious internal hostnames
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return true;
    }

    // Block cloud metadata endpoints (AWS, GCP, Azure)
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return true;
    }

    // Block private IPv4 ranges (RFC 1918) and link-local
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (a === 10) return true;                             // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16.0.0/12
      if (a === 192 && b === 168) return true;               // 192.168.0.0/16
      if (a === 169 && b === 254) return true;               // 169.254.0.0/16 (link-local)
      if (a === 127) return true;                            // 127.0.0.0/8 (loopback)
      if (a === 0) return true;                              // 0.0.0.0/8
    }

    // Require HTTPS for webhook endpoints
    if (parsed.protocol !== 'https:') {
      return true;
    }

    return false;
  } catch {
    return true; // Invalid URL
  }
}

// Custom Zod refinement for safe webhook URLs
const safeWebhookUrl = z.string().url('URL must be a valid URL').refine(
  (url) => !isPrivateOrReservedUrl(url),
  'Webhook URL must use HTTPS and cannot target private, reserved, or internal network addresses'
);

// ---- Schemas ----

const createWebhookSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  url: safeWebhookUrl,
  eventTypes: z.array(z.string().min(1)).min(1, 'At least one event type is required'),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: safeWebhookUrl.optional(),
  eventTypes: z.array(z.string().min(1)).min(1).optional(),
  regenerateSecret: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ---- Routes ----

/**
 * GET /api/v1/webhooks
 * List all webhooks (admin only).
 */
router.get(
  '/',
  requireAuth,
  requirePermission('admin.webhooks'),
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
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
  }),
);

/**
 * POST /api/v1/webhooks
 * Create a webhook (admin only).
 */
router.post(
  '/',
  requireAuth,
  requirePermission('admin.webhooks'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createWebhookSchema.parse(req.body);
      const db = getDatabase();

      const id = uuidv4();
      const secret = generateSecret();
      const encryptedSecret = encryptionService.encrypt(secret);

      await db
        .insertInto('webhook')
        .values({
          id,
          name: data.name,
          url: data.url,
          secret: encryptedSecret,
          event_types: data.eventTypes as string[],
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
      if (handleValidationError(res, error)) return;
      throw error;
    }
  }),
);

/**
 * GET /api/v1/webhooks/:id
 * Get webhook details with recent delivery stats (admin only).
 */
router.get(
  '/:id',
  requireAuth,
  requirePermission('admin.webhooks'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
  }),
);

/**
 * PUT /api/v1/webhooks/:id
 * Update webhook config (admin only).
 */
router.put(
  '/:id',
  requireAuth,
  requirePermission('admin.webhooks'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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

      const updates: Record<string, unknown> = { updated_at: new Date() };
      let newSecret: string | null = null;

      if (data.name !== undefined) updates.name = data.name;
      if (data.url !== undefined) updates.url = data.url;
      if (data.eventTypes !== undefined) updates.event_types = data.eventTypes;
      if (data.isActive !== undefined) {
        updates.is_active = data.isActive;
        if (data.isActive) updates.consecutive_failures = 0;
      }
      if (data.regenerateSecret) {
        newSecret = generateSecret();
        updates.secret = encryptionService.encrypt(newSecret);
      }

      await db
        .updateTable('webhook')
        .set(updates)
        .where('id', '=', req.params.id)
        .execute();

      const result: Record<string, unknown> = {
        id: webhook.id,
        name: data.name ?? webhook.name,
        url: data.url ?? webhook.url,
        eventTypes: data.eventTypes ?? webhook.event_types,
        isActive: data.isActive ?? webhook.is_active,
      };

      // Only include secret if it was regenerated
      if (newSecret) {
        result.secret = newSecret;
      }

      res.json(result);
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  }),
);

/**
 * DELETE /api/v1/webhooks/:id
 * Delete webhook and all delivery history (admin only).
 */
router.delete(
  '/:id',
  requireAuth,
  requirePermission('admin.webhooks'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
  }),
);

/**
 * POST /api/v1/webhooks/:id/test
 * Deliver a channel.test event to this webhook (admin only).
 */
router.post(
  '/:id/test',
  requireAuth,
  requirePermission('admin.webhooks'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const eventBus = getEventBus();
    const envelope = eventBus.emit(
      CHANNEL_TEST,
      {
        webhookId: webhook.id,
        webhookName: webhook.name,
        message: 'This is a test delivery from CycloneDX Assessors Studio',
      },
      { userId: req.user.id, displayName: req.user.displayName },
    );

    res.json({
      message: 'Test event emitted',
      eventId: envelope?.id || null,
    });
  }),
);

/**
 * POST /api/v1/webhooks/:id/enable
 * Re-enable a disabled webhook and reset its failure counter (admin only).
 */
router.post(
  '/:id/enable',
  requireAuth,
  requirePermission('admin.webhooks'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
  }),
);

/**
 * GET /api/v1/webhooks/:id/deliveries
 * Paginated delivery log for a webhook (admin only).
 */
router.get(
  '/:id/deliveries',
  requireAuth,
  requirePermission('admin.webhooks'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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
  }),
);

export default router;
