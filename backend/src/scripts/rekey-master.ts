/**
 * CLI script: rekey-master.
 *
 * Re-keys all encrypted values from an old master encryption key
 * to the current one. Used when the MEK itself must be changed
 * (compromise scenario).
 *
 * Requires both:
 *   MASTER_ENCRYPTION_KEY     = new key (64 hex chars)
 *   OLD_MASTER_ENCRYPTION_KEY = old key (64 hex chars)
 *
 * Usage: npx tsx src/scripts/rekey-master.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, closeDatabase, getDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import {
  initializeEncryption,
  rekeyMaster,
} from '../utils/encryption.js';
import { logger } from '../utils/logger.js';

async function main() {
  const oldMasterKeyHex = process.env.OLD_MASTER_ENCRYPTION_KEY;
  if (!oldMasterKeyHex || oldMasterKeyHex.length < 64) {
    logger.error('OLD_MASTER_ENCRYPTION_KEY must be set to a 64-character hex string');
    process.exit(1);
  }

  const newMasterKeyHex = process.env.MASTER_ENCRYPTION_KEY;
  if (!newMasterKeyHex || newMasterKeyHex.length < 64) {
    logger.error('MASTER_ENCRYPTION_KEY (new key) must be set to a 64-character hex string');
    process.exit(1);
  }

  logger.info('Starting master encryption key rotation...');

  await initializeDatabase();
  await runMigrations();
  const db = getDatabase();

  // Initialize with the OLD key first so we can read existing values.
  // We temporarily set the env to the old key for initialization,
  // then swap back.
  const savedNewKey = process.env.MASTER_ENCRYPTION_KEY;
  process.env.MASTER_ENCRYPTION_KEY = oldMasterKeyHex;
  await initializeEncryption(db);
  process.env.MASTER_ENCRYPTION_KEY = savedNewKey;

  // Now perform the rekey using the rekeyMaster function
  const result = await rekeyMaster(
    db,
    oldMasterKeyHex,
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

  logger.info('Master key rotation complete', {
    processed: result.processed,
    rekeyed: result.rekeyed,
  });

  logger.info('You can now remove OLD_MASTER_ENCRYPTION_KEY from your environment.');

  await closeDatabase();
}

main().catch((error) => {
  logger.error('Master key rotation failed', { error });
  process.exit(1);
});
