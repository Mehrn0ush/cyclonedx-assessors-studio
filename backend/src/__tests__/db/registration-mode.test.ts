import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { bootstrapRegistrationModeTracking } from '../../db/registration-mode.js';
import { setupTestDb, teardownTestDb, getTestDatabase } from '../helpers/setup.js';
import { resetConfig } from '../../config/index.js';

// Bootstrap reads the live config and the test database. Point the
// module level getDatabase() at the test harness and mute the logger
// so assertions read cleanly.
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

const CONFIG_KEY = 'registration_mode_last_known';

async function readStored(): Promise<string | null> {
  const db = getTestDatabase();
  const row = await db
    .selectFrom('app_config')
    .select(['value'])
    .where('key', '=', CONFIG_KEY)
    .executeTakeFirst();
  return row?.value ?? null;
}

async function readDriftAuditRows(): Promise<
  Array<{ user_id: string | null; changes: Record<string, unknown> | null }>
> {
  const db = getTestDatabase();
  const rows = await db
    .selectFrom('audit_log')
    .where('entity_type', '=', 'config')
    .where('action', '=', 'config_change')
    .orderBy('created_at', 'asc')
    .select(['user_id', 'changes'])
    .execute();
  return rows as Array<{
    user_id: string | null;
    changes: Record<string, unknown> | null;
  }>;
}

describe('bootstrapRegistrationModeTracking (F15)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    // Wipe both the stored row and any drift audit rows from prior tests
    // so each case starts from a clean slate. Other tests in the suite
    // write their own audit rows, but none of them use entity_type=config.
    const db = getTestDatabase();
    await db.deleteFrom('app_config').where('key', '=', CONFIG_KEY).execute();
    await db
      .deleteFrom('audit_log')
      .where('entity_type', '=', 'config')
      .where('action', '=', 'config_change')
      .execute();
    resetConfig();
  });

  it('seeds the stored value on first run without emitting an audit row', async () => {
    process.env.REGISTRATION_MODE = 'invite_only';
    resetConfig();

    await bootstrapRegistrationModeTracking();

    expect(await readStored()).toBe('invite_only');
    expect(await readDriftAuditRows()).toEqual([]);
  });

  it('is a no-op when the runtime mode matches the stored value', async () => {
    process.env.REGISTRATION_MODE = 'invite_only';
    resetConfig();

    await bootstrapRegistrationModeTracking();
    await bootstrapRegistrationModeTracking();

    expect(await readStored()).toBe('invite_only');
    expect(await readDriftAuditRows()).toEqual([]);
  });

  it('emits a config_change audit row on drift and updates the stored value', async () => {
    // First boot: invite_only
    process.env.REGISTRATION_MODE = 'invite_only';
    resetConfig();
    await bootstrapRegistrationModeTracking();

    // Second boot: operator flipped to open
    process.env.REGISTRATION_MODE = 'open';
    resetConfig();
    await bootstrapRegistrationModeTracking();

    expect(await readStored()).toBe('open');
    const rows = await readDriftAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBeNull();
    expect(rows[0]!.changes).toMatchObject({
      key: 'REGISTRATION_MODE',
      from: 'invite_only',
      to: 'open',
      source: 'startup_reconciliation',
    });
  });

  it('records every subsequent transition independently', async () => {
    process.env.REGISTRATION_MODE = 'disabled';
    resetConfig();
    await bootstrapRegistrationModeTracking();

    process.env.REGISTRATION_MODE = 'invite_only';
    resetConfig();
    await bootstrapRegistrationModeTracking();

    process.env.REGISTRATION_MODE = 'open';
    resetConfig();
    await bootstrapRegistrationModeTracking();

    expect(await readStored()).toBe('open');
    const rows = await readDriftAuditRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.changes).toMatchObject({ from: 'disabled', to: 'invite_only' });
    expect(rows[1]!.changes).toMatchObject({ from: 'invite_only', to: 'open' });
  });
});
