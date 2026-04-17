/**
 * CLI script: rotate-jwt-secret.
 *
 * Generates a new JWT signing secret, persists it to the app_config
 * table, and clears the session table so every active session is
 * invalidated.
 *
 * Intended for two scenarios:
 *   1. Routine rotation of a server managed secret.
 *   2. Emergency rotation after a suspected leak.
 *
 * When JWT_SECRET is set via environment, this script refuses to run
 * and tells the operator to rotate the env value through their secrets
 * manager and restart the backend instead. Rotating through this script
 * while the env var pins the secret would leave stale state.
 *
 * Usage: npx tsx src/scripts/rotate-jwt-secret.ts
 */

import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, closeDatabase, getDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { logger } from '../utils/logger.js';

const CONFIG_KEY = 'jwt_secret';

async function main(): Promise<void> {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length > 0) {
    logger.error(
      'JWT_SECRET is set in the environment. Rotate it through your secrets manager and restart the backend. This script only rotates server managed secrets.'
    );
    process.exit(1);
  }

  await initializeDatabase();
  await runMigrations();

  const db = getDatabase();
  const generated = crypto.randomBytes(48).toString('hex');
  const now = new Date();

  await db
    .insertInto('app_config')
    .values({
      key: CONFIG_KEY,
      value: generated,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column('key').doUpdateSet({
        value: generated,
        updated_at: now,
      })
    )
    .execute();

  const deleteResult = await db.deleteFrom('session').execute();
  const sessionsInvalidated = Number(deleteResult[0]?.numDeletedRows ?? 0);

  logger.info('JWT signing secret rotated', {
    sessionsInvalidated,
  });

  await closeDatabase();
}

main().catch((error) => {
  logger.error('JWT secret rotation failed', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
