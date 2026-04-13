import crypto from 'node:crypto';
import { getDatabase } from './connection.js';
import { logger } from '../utils/logger.js';

const CONFIG_KEY = 'jwt_secret';
const MIN_LENGTH = 32;

/**
 * Resolve the JWT signing secret used to sign session tokens.
 *
 * Precedence:
 *   1. JWT_SECRET environment variable (must be at least 32 chars).
 *      Always wins when set. Use this in multi-replica deployments
 *      and when you want to manage the secret externally.
 *   2. A row in the app_config table with key='jwt_secret'.
 *   3. A newly generated secret that is persisted for future runs.
 *
 * The secret is only used to sign and verify session tokens. It is
 * not used to protect data at rest; that is handled by the
 * encryption-at-rest subsystem using a separate master key.
 */
export async function bootstrapJwtSecret(): Promise<string> {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) {
    if (fromEnv.length < MIN_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_LENGTH} characters when set via environment`
      );
    }
    logger.info('JWT signing secret loaded from environment');
    return fromEnv;
  }

  const db = getDatabase();

  const existing = await db
    .selectFrom('app_config')
    .select(['value'])
    .where('key', '=', CONFIG_KEY)
    .executeTakeFirst();

  if (existing?.value && existing.value.length >= MIN_LENGTH) {
    logger.info('JWT signing secret loaded from database');
    return existing.value;
  }

  const generated = crypto.randomBytes(48).toString('hex');
  const now = new Date();

  // Use an upsert so two replicas starting simultaneously do not
  // trip over one another. One will insert; the other will update
  // its own copy to the same generated value, and then the caller
  // will re-read on the next boot. Losing one generation is fine
  // because both values are equally random.
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

  // Read back the winning value in case another replica wrote first.
  const confirmed = await db
    .selectFrom('app_config')
    .select(['value'])
    .where('key', '=', CONFIG_KEY)
    .executeTakeFirstOrThrow();

  logger.info('JWT signing secret generated and persisted to database');
  return confirmed.value;
}
