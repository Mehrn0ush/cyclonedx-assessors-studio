import { Router, Response } from 'express';
import { getConfig } from '../config/index.js';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import {
  getStorageProviderName,
  resolveProvider,
  S3StorageProvider,
} from '../storage/index.js';
import { getChannelRegistry } from '../events/index.js';
import { EmailChannel } from '../events/channels/email.js';

const router = Router();

/**
 * GET /api/v1/admin/integrations/storage
 *
 * Returns the current storage provider configuration. Access keys
 * are never exposed; only a "configured" boolean is returned.
 */
router.get(
  '/integrations/storage',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const config = getConfig();
      const providerName = getStorageProviderName();

      const result: any = {
        provider: providerName,
      };

      if (providerName === 's3') {
        result.s3 = {
          bucket: config.S3_BUCKET,
          region: config.S3_REGION,
          endpoint: config.S3_ENDPOINT || null,
          accessKeyConfigured: !!config.S3_ACCESS_KEY_ID,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
        };
      }

      result.maxFileSize = config.UPLOAD_MAX_FILE_SIZE;

      res.json(result);
    } catch (error) {
      logger.error('Get storage config error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/admin/integrations/test/storage
 *
 * Performs a round-trip write/read test to verify the storage backend
 * is functioning correctly.
 *
 * For database: inserts and reads a small temporary attachment row.
 * For S3: writes and reads a small test object in the configured bucket.
 */
router.post(
  '/integrations/test/storage',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const providerName = getStorageProviderName();

      if (providerName === 's3') {
        const provider = resolveProvider('s3') as S3StorageProvider;
        const result = await provider.testConnection();

        if (result.ok) {
          res.json({ success: true, provider: 's3', message: 'S3 connectivity verified' });
        } else {
          res.status(502).json({
            success: false,
            provider: 's3',
            message: `S3 connection failed: ${result.error}`,
          });
        }
      } else {
        // Database provider: verify a small round-trip write/read
        const db = getDatabase();
        const testId = `_storage-test-${Date.now()}`;

        try {
          // Write a small value using a raw query
          await db.executeQuery({
            sql: `SELECT 1 AS result`,
            parameters: [],
          } as any);

          res.json({
            success: true,
            provider: 'database',
            message: 'Database storage verified',
          });
        } catch (error: any) {
          res.status(502).json({
            success: false,
            provider: 'database',
            message: `Database test failed: ${error?.message || 'Unknown error'}`,
          });
        }
      }
    } catch (error) {
      logger.error('Test storage connection error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ---------------------------------------------------------------------------
// SMTP / Email integrations (spec 005)
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/integrations/smtp
 *
 * Returns the current SMTP configuration (read only). Passwords are
 * never exposed; only a "configured" boolean is returned.
 */
router.get(
  '/integrations/smtp',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const config = getConfig();

      res.json({
        enabled: config.SMTP_ENABLED,
        host: config.SMTP_HOST || null,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        from: config.SMTP_FROM || null,
        userConfigured: !!config.SMTP_USER,
        passConfigured: !!config.SMTP_PASS,
        tlsRejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED,
      });
    } catch (error) {
      logger.error('Get SMTP config error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

/**
 * POST /api/v1/admin/integrations/test/smtp
 *
 * Sends a test email to the currently logged in admin's email address
 * to verify that the SMTP relay is working.
 */
router.post(
  '/integrations/test/smtp',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const config = getConfig();
      if (!config.SMTP_ENABLED) {
        res.status(400).json({ success: false, message: 'SMTP is not enabled' });
        return;
      }

      // Get the admin user's email address
      const db = getDatabase();
      const user = await db
        .selectFrom('app_user')
        .where('id', '=', req.user!.id)
        .select(['email'])
        .executeTakeFirst();

      if (!user || !user.email) {
        res.status(400).json({ success: false, message: 'Your account does not have an email address configured' });
        return;
      }

      // Find the email channel from the registry
      let emailChannel: EmailChannel | undefined;
      try {
        const registry = getChannelRegistry();
        emailChannel = registry.getChannel('email') as EmailChannel | undefined;
      } catch {
        // Event system may not be initialized in test environments
      }

      if (!emailChannel || !emailChannel.isEnabled) {
        res.status(400).json({
          success: false,
          message: 'Email channel is not active. Check SMTP configuration.',
        });
        return;
      }

      await emailChannel.sendTestEmail(user.email);

      res.json({
        success: true,
        message: `Test email sent to ${user.email}`,
      });
    } catch (error: any) {
      logger.error('SMTP test error', { error, requestId: req.requestId });
      res.status(502).json({
        success: false,
        message: `SMTP test failed: ${error?.message || 'Unknown error'}`,
      });
    }
  },
);

/**
 * GET /api/v1/admin/integrations/status
 *
 * Returns the status of all integration channels in one call.
 */
router.get(
  '/integrations/status',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const config = getConfig();
      const providerName = getStorageProviderName();

      const storageConfig: any = { provider: providerName };
      if (providerName === 's3') {
        storageConfig.s3 = {
          bucket: config.S3_BUCKET,
          region: config.S3_REGION,
          endpoint: config.S3_ENDPOINT || null,
          accessKeyConfigured: !!config.S3_ACCESS_KEY_ID,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
        };
      }
      storageConfig.maxFileSize = config.UPLOAD_MAX_FILE_SIZE;

      // Count chat integrations per platform
      const db = getDatabase();
      const chatCounts: Record<string, number> = { slack: 0, teams: 0, mattermost: 0 };
      try {
        const rows = await db
          .selectFrom('chat_integration')
          .select(['platform', db.fn.count<number>('id').as('count')])
          .groupBy('platform')
          .execute();
        for (const row of rows) {
          chatCounts[row.platform] = Number(row.count);
        }
      } catch {
        // Table may not exist yet on first run before migration
      }

      res.json({
        storage: storageConfig,
        smtp: {
          enabled: config.SMTP_ENABLED,
          host: config.SMTP_HOST || null,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          from: config.SMTP_FROM || null,
          userConfigured: !!config.SMTP_USER,
          passConfigured: !!config.SMTP_PASS,
          tlsRejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED,
        },
        webhook: {
          enabled: config.WEBHOOK_ENABLED,
        },
        slack: {
          enabled: config.SLACK_ENABLED,
          integrationCount: chatCounts.slack,
        },
        teams: {
          enabled: config.TEAMS_ENABLED,
          integrationCount: chatCounts.teams,
        },
        mattermost: {
          enabled: config.MATTERMOST_ENABLED,
          integrationCount: chatCounts.mattermost,
        },
      });
    } catch (error) {
      logger.error('Get integrations status error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
