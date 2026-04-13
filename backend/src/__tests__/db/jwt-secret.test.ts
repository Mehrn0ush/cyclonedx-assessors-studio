import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { bootstrapJwtSecret } from '../../db/jwt-secret.js';
import { setupTestDb, teardownTestDb, getTestDatabase } from '../helpers/setup.js';

vi.mock('../../db/connection.js', () => ({
  getDatabase: () => getTestDatabase(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('bootstrapJwtSecret', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    const db = getTestDatabase();
    await db.deleteFrom('app_config').where('key', '=', 'jwt_secret').execute();
  });

  it('prefers a valid JWT_SECRET environment variable', async () => {
    const envSecret = 'env-provided-secret-at-least-32-chars-long!!';
    process.env.JWT_SECRET = envSecret;

    const resolved = await bootstrapJwtSecret();
    expect(resolved).toBe(envSecret);

    // Env takes precedence even when a DB row exists.
    const db = getTestDatabase();
    const row = await db
      .selectFrom('app_config')
      .select(['value'])
      .where('key', '=', 'jwt_secret')
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it('rejects a too-short JWT_SECRET from the environment', async () => {
    process.env.JWT_SECRET = 'too-short';
    await expect(bootstrapJwtSecret()).rejects.toThrow(/at least 32 characters/);
  });

  it('generates and persists a secret when env is empty and DB is empty', async () => {
    delete process.env.JWT_SECRET;

    const first = await bootstrapJwtSecret();
    expect(first.length).toBeGreaterThanOrEqual(32);

    const db = getTestDatabase();
    const row = await db
      .selectFrom('app_config')
      .select(['value'])
      .where('key', '=', 'jwt_secret')
      .executeTakeFirstOrThrow();
    expect(row.value).toBe(first);
  });

  it('reuses the persisted secret across calls', async () => {
    delete process.env.JWT_SECRET;

    const first = await bootstrapJwtSecret();
    const second = await bootstrapJwtSecret();
    expect(second).toBe(first);
  });
});
