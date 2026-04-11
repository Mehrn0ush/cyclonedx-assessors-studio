/**
 * CLI script: rotate-encryption-key.
 *
 * Rotates to a new key version (new KEK derivation salt) without
 * changing the master encryption key. Re-wraps all DEKs under the
 * new key version.
 *
 * Usage: npx tsx src/scripts/rotate-encryption-key.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, closeDatabase, getDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import {
  initializeEncryption,
  encryptionService,
  rotateKeyVersion,
} from '../utils/encryption.js';
import { logger } from '../utils/logger.js';

async function main() {
  logger.info('Starting encryption key rotation...');

  await initializeDatabase();
  await runMigrations();
  const db = getDatabase();
  await initializeEncryption(db);

  if (!encryptionService.isAvailable()) {
    logger.error('Encryption is not available. Set MASTER_ENCRYPTION_KEY environment variable.');
    process.exit(1);
  }

  const oldVersion = encryptionService.getActiveKeyVersion();
  logger.info('Current active key version', { version: oldVersion });

  // Create new key version
  const newVersion = await rotateKeyVersion(db);
  logger.info('Created new key version', { newVersion });

  // Re-wrap all webhook secrets
  const result = await encryptionService.rekey(
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

  logger.info('Key rotation complete', {
    oldVersion,
    newVersion,
    processed: result.processed,
    rekeyed: result.rekeyed,
  });

  await closeDatabase();
}

main().catch((error) => {
  logger.error('Key rotation failed', { error });
  process.exit(1);
});
