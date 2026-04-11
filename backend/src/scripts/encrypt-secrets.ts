/**
 * CLI script: encrypt-secrets.
 *
 * Migrates all plaintext webhook secrets to encrypted envelopes.
 * Can run while the application is serving traffic.
 *
 * Usage: npx tsx src/scripts/encrypt-secrets.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, closeDatabase, getDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { initializeEncryption, encryptionService, isEncryptedEnvelope } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';

async function main() {
  logger.info('Starting secret encryption migration...');

  await initializeDatabase();
  await runMigrations();
  const db = getDatabase();
  await initializeEncryption(db);

  if (!encryptionService.isAvailable()) {
    logger.error('Encryption is not available. Set MASTER_ENCRYPTION_KEY environment variable.');
    process.exit(1);
  }

  // Find all webhook secrets
  const webhooks = await db
    .selectFrom('webhook')
    .select(['id', 'name', 'secret'])
    .execute();

  let encrypted = 0;
  let skipped = 0;

  for (const webhook of webhooks) {
    if (isEncryptedEnvelope(webhook.secret)) {
      skipped++;
      logger.debug('Already encrypted, skipping', { webhookId: webhook.id, name: webhook.name });
      continue;
    }

    const encryptedSecret = encryptionService.encrypt(webhook.secret);
    await db
      .updateTable('webhook')
      .set({ secret: encryptedSecret, updated_at: new Date() })
      .where('id', '=', webhook.id)
      .execute();

    encrypted++;
    logger.info('Encrypted webhook secret', { webhookId: webhook.id, name: webhook.name });
  }

  logger.info('Secret encryption migration complete', {
    total: webhooks.length,
    encrypted,
    skipped,
  });

  // Verification pass
  const verification = await db
    .selectFrom('webhook')
    .select(['id', 'name', 'secret'])
    .execute();

  const stillPlaintext = verification.filter((w) => !isEncryptedEnvelope(w.secret));
  if (stillPlaintext.length > 0) {
    logger.warn('Some secrets are still plaintext after migration', {
      count: stillPlaintext.length,
      ids: stillPlaintext.map((w) => w.id),
    });
  } else {
    logger.info('Verification passed: all webhook secrets are encrypted');
  }

  await closeDatabase();
}

main().catch((error) => {
  logger.error('Secret encryption migration failed', { error });
  process.exit(1);
});
