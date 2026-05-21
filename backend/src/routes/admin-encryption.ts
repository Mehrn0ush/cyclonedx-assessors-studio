/**
 * Admin encryption management routes.
 *
 * Provides endpoints for viewing encryption status and rotating
 * encryption key versions.
 */

import { Router } from 'express';
import type { Response } from 'express';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  encryptionService,
  rotateKeyVersion,
  isEncryptedEnvelope,
} from '../utils/encryption.js';
import { asyncHandler } from '../utils/route-helpers.js';

const router = Router();

/**
 * GET /api/v1/admin/encryption/status
 *
 * Returns the current encryption status including key version info
 * and counts of encrypted vs. plaintext fields.
 */
router.get(
  '/status',
  requireAuth,
  requirePermission('admin.encryption'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const available = encryptionService.isAvailable();
    const activeVersion = encryptionService.getActiveKeyVersion();

    // Get all key versions
    let keyVersions: Record<string, unknown>[] = [];
    try {
      keyVersions = await db
        .selectFrom('encryption_key_version')
        .selectAll()
        .orderBy('version', 'desc')
        .execute();
    } catch {
      // Table may not exist yet
    }

    // Count encrypted vs. plaintext webhook secrets
    let webhookTotal = 0;
    let webhookEncrypted = 0;
    try {
      const webhooks = await db
        .selectFrom('webhook')
        .select(['secret'])
        .execute();

      webhookTotal = webhooks.length;
      webhookEncrypted = webhooks.filter((w) => isEncryptedEnvelope(w.secret)).length;
    } catch {
      // Table may not exist
    }

    res.json({
      available,
      passthroughMode: !available,
      activeKeyVersion: activeVersion,
      keyVersions: keyVersions.map((kv) => ({
        version: kv.version,
        isActive: kv.is_active,
        createdAt: kv.created_at,
        retiredAt: kv.retired_at,
      })),
      encryptedFields: {
        webhook: {
          total: webhookTotal,
          encrypted: webhookEncrypted,
          plaintext: webhookTotal - webhookEncrypted,
        },
      },
    });
  })
);

/**
 * POST /api/v1/admin/encryption/rotate
 *
 * Rotate to a new key version. Creates a new KEK derivation salt and
 * re-wraps all existing encrypted values under the new key version.
 */
router.post(
  '/rotate',
  requireAuth,
  requirePermission('admin.encryption'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    if (!encryptionService.isAvailable()) {
      res.status(400).json({
        error: 'Encryption is not available. Set MASTER_ENCRYPTION_KEY to enable.',
      });
      return;
    }

    const db = getDatabase();
    const oldVersion = encryptionService.getActiveKeyVersion();

    // Create new key version
    const newVersion = await rotateKeyVersion(db);

    // Re-wrap every encrypted-at-rest column under the new key version.
    // The chat_integration.webhook_url was added to this iteration set
    // when the column moved from plaintext to envelope encryption; rows
    // written before that change pass through `isEncryptedEnvelope`
    // inside `encryptionService.rekey` as a no-op so the upgrade is
    // safe to run repeatedly.
    let processed = 0;
    let rekeyed = 0;

    const webhookResult = await encryptionService.rekey(
      async function* () {
        const webhooks = await db
          .selectFrom('webhook')
          .select(['id', 'secret'])
          .execute();
        for (const wh of webhooks) {
          yield { id: wh.id, value: wh.secret };
        }
      },
      async (id, value) => {
        await db
          .updateTable('webhook')
          .set({ secret: value, updated_at: new Date() })
          .where('id', '=', id)
          .execute();
      },
    );
    processed += webhookResult.processed;
    rekeyed += webhookResult.rekeyed;

    const chatResult = await encryptionService.rekey(
      async function* () {
        const rows = await db
          .selectFrom('chat_integration')
          .select(['id', 'webhook_url'])
          .execute();
        for (const row of rows) {
          yield { id: row.id, value: row.webhook_url };
        }
      },
      async (id, value) => {
        await db
          .updateTable('chat_integration')
          .set({ webhook_url: value, updated_at: new Date() })
          .where('id', '=', id)
          .execute();
      },
    );
    processed += chatResult.processed;
    rekeyed += chatResult.rekeyed;

    logger.info('Encryption key rotated', {
      oldVersion,
      newVersion,
      processed,
      rekeyed,
      breakdown: {
        webhooks: webhookResult,
        chatIntegrations: chatResult,
      },
      userId: req.user!.id,
    });

    res.json({
      message: 'Encryption key rotated successfully',
      previousVersion: oldVersion,
      newVersion,
      processed,
      rekeyed,
      breakdown: {
        webhooks: webhookResult,
        chatIntegrations: chatResult,
      },
    });
  })
);

export default router;
