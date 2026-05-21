import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { setupTestDb, teardownTestDb, getTestDatabase } from '../helpers/setup.js';

/**
 * Append-only enforcement for `audit_log`. Two layers stack here:
 *
 *   1. `AuditLogAppendOnlyPlugin` (db/connection.ts) — a Kysely query
 *      interceptor that refuses any UPDATE or DELETE targeting the
 *      audit_log table. Always-on; works on every backend (PGlite,
 *      Postgres). This is what we test here.
 *   2. `audit_log_immutable()` PL/pgSQL trigger (migrate.ts) — the
 *      defense-in-depth layer for production Postgres deployments
 *      so a stray raw `psql` session or a future ORM swap cannot
 *      bypass the rule. Not exercised here because PGlite's
 *      PL/pgSQL trigger support is incomplete.
 *
 * INSERTs and SELECTs are unaffected by either layer.
 */
describe('audit_log is append-only (Kysely plugin)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function seedRow(): Promise<string> {
    const db = getTestDatabase();
    const id = uuidv4();
    await db
      .insertInto('audit_log')
      .values({
        id,
        entity_type: 'append_only_probe',
        entity_id: uuidv4(),
        action: 'create',
        user_id: null,
        changes: null,
      })
      .execute();
    return id;
  }

  it('allows INSERT', async () => {
    const id = await seedRow();
    const row = await getTestDatabase()
      .selectFrom('audit_log')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
    expect(row).toBeTruthy();
  });

  it('blocks UPDATE', async () => {
    const id = await seedRow();
    await expect(
      getTestDatabase()
        .updateTable('audit_log')
        .set({ entity_type: 'tampered' })
        .where('id', '=', id)
        .execute(),
    ).rejects.toThrow(/audit_log is append-only/);
  });

  it('blocks DELETE', async () => {
    const id = await seedRow();
    await expect(
      getTestDatabase().deleteFrom('audit_log').where('id', '=', id).execute(),
    ).rejects.toThrow(/audit_log is append-only/);
  });

  it('blocks bulk DELETE even when filter matches many rows', async () => {
    await seedRow();
    await seedRow();
    await expect(
      getTestDatabase()
        .deleteFrom('audit_log')
        .where('entity_type', '=', 'append_only_probe')
        .execute(),
    ).rejects.toThrow(/audit_log is append-only/);
  });
});
