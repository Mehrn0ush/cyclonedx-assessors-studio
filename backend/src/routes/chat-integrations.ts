/**
 * Chat integration management API routes.
 *
 * Admin-only endpoints for creating, updating, deleting, testing,
 * and re-enabling chat integrations for Slack, Teams, and Mattermost,
 * plus delivery log access.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { getChannelRegistry } from '../events/index.js';
import { SlackChannel } from '../events/channels/chat-slack.js';
import { TeamsChannel } from '../events/channels/chat-teams.js';
import { MattermostChannel } from '../events/channels/chat-mattermost.js';
import { BaseChatChannel } from '../events/channels/chat-base.js';
import { validatePagination } from '../utils/pagination.js';

const router = Router();

// ---- URL validation per platform ----

const PLATFORM_VALIDATORS: Record<string, (url: string) => boolean> = {
  slack: SlackChannel.validateWebhookUrl,
  teams: TeamsChannel.validateWebhookUrl,
  mattermost: MattermostChannel.validateWebhookUrl,
};

const PLATFORM_URL_HINTS: Record<string, string> = {
  slack: 'Must start with https://hooks.slack.com/',
  teams: 'Must start with https:// and contain .webhook.office.com/ or .logic.azure.com/',
  mattermost: 'Must start with https://',
};

// ---- Schemas ----

const createChatIntegrationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  platform: z.enum(['slack', 'teams', 'mattermost']),
  webhookUrl: z.string().url('Must be a valid URL'),
  eventCategories: z.array(z.string().min(1)).min(1, 'At least one event category is required'),
  channelName: z.string().max(255).optional(),
});

const updateChatIntegrationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  webhookUrl: z.string().url('Must be a valid URL').optional(),
  eventCategories: z.array(z.string().min(1)).min(1).optional(),
  channelName: z.string().max(255).nullable().optional(),
});

// ---- Routes ----

/**
 * GET /api/v1/integrations/chat
 * List all chat integrations (admin only).
 */
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { platform } = req.query;

      let query = db
        .selectFrom('chat_integration')
        .selectAll()
        .orderBy('created_at', 'desc');

      if (platform && typeof platform === 'string') {
        query = query.where('platform', '=', platform);
      }

      const integrations = await query.execute();
      res.json({ data: integrations });
    } catch (error) {
      logger.error('List chat integrations error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * POST /api/v1/integrations/chat
 * Create a chat integration (admin only).
 */
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createChatIntegrationSchema.parse(req.body);

      // Validate webhook URL format for the platform
      const validator = PLATFORM_VALIDATORS[data.platform];
      if (validator && !validator(data.webhookUrl)) {
        res.status(400).json({
          error: 'Invalid webhook URL',
          message: PLATFORM_URL_HINTS[data.platform],
        });
        return;
      }

      const db = getDatabase();
      const id = uuidv4();

      await db
        .insertInto('chat_integration')
        .values({
          id,
          name: data.name,
          platform: data.platform,
          webhook_url: data.webhookUrl,
          event_categories: JSON.stringify(data.eventCategories),
          channel_name: data.channelName || null,
          is_active: true,
          consecutive_failures: 0,
          created_by: req.user!.id,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();

      res.status(201).json({
        id,
        name: data.name,
        platform: data.platform,
        webhookUrl: data.webhookUrl,
        eventCategories: data.eventCategories,
        channelName: data.channelName || null,
        isActive: true,
        consecutiveFailures: 0,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }
      logger.error('Create chat integration error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * GET /api/v1/integrations/chat/:id
 * Get integration details with delivery stats (admin only).
 */
router.get(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const integration = await db
        .selectFrom('chat_integration')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!integration) {
        res.status(404).json({ error: 'Chat integration not found' });
        return;
      }

      // Delivery stats
      const totalResult = await db
        .selectFrom('chat_delivery')
        .where('integration_id', '=', req.params.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      const successResult = await db
        .selectFrom('chat_delivery')
        .where('integration_id', '=', req.params.id)
        .where('status', '=', 'success')
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      const lastSuccess = await db
        .selectFrom('chat_delivery')
        .where('integration_id', '=', req.params.id)
        .where('status', '=', 'success')
        .orderBy('delivered_at', 'desc')
        .select('delivered_at')
        .executeTakeFirst();

      res.json({
        ...integration,
        deliveryStats: {
          totalDeliveries: Number(totalResult?.count ?? 0),
          successfulDeliveries: Number(successResult?.count ?? 0),
          lastSuccessAt: lastSuccess?.delivered_at || null,
        },
      });
    } catch (error) {
      logger.error('Get chat integration error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * PUT /api/v1/integrations/chat/:id
 * Update a chat integration (admin only).
 */
router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateChatIntegrationSchema.parse(req.body);
      const db = getDatabase();

      const integration = await db
        .selectFrom('chat_integration')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!integration) {
        res.status(404).json({ error: 'Chat integration not found' });
        return;
      }

      // Validate webhook URL if provided
      if (data.webhookUrl) {
        const validator = PLATFORM_VALIDATORS[integration.platform];
        if (validator && !validator(data.webhookUrl)) {
          res.status(400).json({
            error: 'Invalid webhook URL',
            message: PLATFORM_URL_HINTS[integration.platform],
          });
          return;
        }
      }

      const updates: Record<string, any> = { updated_at: new Date() };
      if (data.name !== undefined) updates.name = data.name;
      if (data.webhookUrl !== undefined) updates.webhook_url = data.webhookUrl;
      if (data.eventCategories !== undefined) updates.event_categories = JSON.stringify(data.eventCategories);
      if (data.channelName !== undefined) updates.channel_name = data.channelName;

      await db
        .updateTable('chat_integration')
        .set(updates)
        .where('id', '=', req.params.id)
        .execute();

      res.json({
        id: integration.id,
        name: data.name ?? integration.name,
        platform: integration.platform,
        webhookUrl: data.webhookUrl ?? integration.webhook_url,
        eventCategories: data.eventCategories ?? JSON.parse(integration.event_categories),
        channelName: data.channelName !== undefined ? data.channelName : integration.channel_name,
        isActive: integration.is_active,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }
      logger.error('Update chat integration error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * DELETE /api/v1/integrations/chat/:id
 * Delete a chat integration and all delivery history (admin only).
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const existing = await db
        .selectFrom('chat_integration')
        .select('id')
        .where('id', '=', req.params.id)
        .executeTakeFirst();

      if (!existing) {
        res.status(404).json({ error: 'Chat integration not found' });
        return;
      }

      await db
        .deleteFrom('chat_integration')
        .where('id', '=', req.params.id)
        .execute();

      res.json({ message: 'Chat integration deleted successfully' });
    } catch (error) {
      logger.error('Delete chat integration error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * POST /api/v1/integrations/chat/:id/test
 * Send a test message to the integration (admin only).
 */
router.post(
  '/:id/test',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const integration = await db
        .selectFrom('chat_integration')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!integration) {
        res.status(404).json({ error: 'Chat integration not found' });
        return;
      }

      // Find the corresponding chat channel from the registry
      let chatChannel: BaseChatChannel | undefined;
      try {
        const registry = getChannelRegistry();
        chatChannel = registry.getChannel(integration.platform) as BaseChatChannel | undefined;
      } catch {
        // Event system may not be initialized
      }

      if (!chatChannel) {
        // Channel not registered (platform not enabled). Create a temporary
        // instance just for testing.
        const { SlackChannel: SC } = await import('../events/channels/chat-slack.js');
        const { TeamsChannel: TC } = await import('../events/channels/chat-teams.js');
        const { MattermostChannel: MC } = await import('../events/channels/chat-mattermost.js');

        const ChannelMap: Record<string, typeof SC | typeof TC | typeof MC> = {
          slack: SC,
          teams: TC,
          mattermost: MC,
        };

        const ChannelClass = ChannelMap[integration.platform];
        if (ChannelClass) {
          chatChannel = new ChannelClass(() => getDatabase());
        }
      }

      if (!chatChannel) {
        res.status(400).json({
          success: false,
          message: `No channel handler available for platform: ${integration.platform}`,
        });
        return;
      }

      const result = await chatChannel.sendTestMessage(integration.id);

      if (result.success) {
        res.json(result);
      } else {
        res.status(502).json(result);
      }
    } catch (error: any) {
      logger.error('Test chat integration error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * POST /api/v1/integrations/chat/:id/enable
 * Re-enable a disabled chat integration (admin only).
 */
router.post(
  '/:id/enable',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const integration = await db
        .selectFrom('chat_integration')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!integration) {
        res.status(404).json({ error: 'Chat integration not found' });
        return;
      }

      await db
        .updateTable('chat_integration')
        .set({
          is_active: true,
          consecutive_failures: 0,
          updated_at: new Date(),
        })
        .where('id', '=', req.params.id)
        .execute();

      res.json({
        message: 'Chat integration re-enabled',
        id: integration.id,
        isActive: true,
        consecutiveFailures: 0,
      });
    } catch (error) {
      logger.error('Enable chat integration error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * GET /api/v1/integrations/chat/:id/deliveries
 * Paginated delivery log for a chat integration (admin only).
 */
router.get(
  '/:id/deliveries',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const { limit, offset } = validatePagination(req.query);

      const integration = await db
        .selectFrom('chat_integration')
        .where('id', '=', req.params.id)
        .select('id')
        .executeTakeFirst();

      if (!integration) {
        res.status(404).json({ error: 'Chat integration not found' });
        return;
      }

      const totalResult = await db
        .selectFrom('chat_delivery')
        .where('integration_id', '=', req.params.id)
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirst();

      const total = Number(totalResult?.count ?? 0);

      const deliveries = await db
        .selectFrom('chat_delivery')
        .where('integration_id', '=', req.params.id)
        .selectAll()
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(limit)
        .execute();

      res.json({
        data: deliveries,
        pagination: { limit, offset, total },
      });
    } catch (error) {
      logger.error('List chat deliveries error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
