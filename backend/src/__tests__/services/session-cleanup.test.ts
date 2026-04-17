import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  setupTestDb,
  teardownTestDb,
  getTestDatabase,
  createTestUser,
} from '../helpers/setup.js';
import { resetConfig } from '../../config/index.js';

vi.mock('../../db/connection.js', () => ({
  getDatabase: () => getTestDatabase(),
}));

const { runSessionCleanupOnce } = await import('../../services/session-cleanup.js');

/**
 * Utility to compose an absolute Date offset from now by a number of
 * seconds. Positive values produce future times, negative values
 * produce past times.
 */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

describe('runSessionCleanupOnce', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    const db = getTestDatabase();
    // Clear both tables between tests so assertions are hermetic.
    await db.deleteFrom('session').execute();
    await db.deleteFrom('user_invite').execute();

    // Reset config so the retention windows reflect process.env in
    // case a prior test overrode them.
    delete process.env.SESSION_RETAIN_EXPIRED_HOURS;
    delete process.env.INVITE_RETAIN_AFTER_TERMINAL_DAYS;
    resetConfig();
  });

  describe('session table', () => {
    it('deletes sessions that expired longer ago than the retention window', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();

      const oldSessionId = uuidv4();
      await db
        .insertInto('session')
        .values({
          id: oldSessionId,
          user_id: user.id,
          expires_at: hoursFromNow(-48), // 48h in the past, beyond 24h default window
        })
        .execute();

      const result = await runSessionCleanupOnce();
      expect(result.sessionsDeleted).toBe(1);

      const remaining = await db
        .selectFrom('session')
        .selectAll()
        .execute();
      expect(remaining.length).toBe(0);
    });

    it('keeps sessions that expired inside the retention window', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();

      await db
        .insertInto('session')
        .values({
          id: uuidv4(),
          user_id: user.id,
          expires_at: hoursFromNow(-1), // 1h in the past, inside 24h retention
        })
        .execute();

      const result = await runSessionCleanupOnce();
      expect(result.sessionsDeleted).toBe(0);

      const remaining = await db.selectFrom('session').selectAll().execute();
      expect(remaining.length).toBe(1);
    });

    it('keeps sessions that have not yet expired', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();

      await db
        .insertInto('session')
        .values({
          id: uuidv4(),
          user_id: user.id,
          expires_at: hoursFromNow(1),
        })
        .execute();

      const result = await runSessionCleanupOnce();
      expect(result.sessionsDeleted).toBe(0);
    });
  });

  describe('user_invite table', () => {
    it('deletes consumed invites older than the retention window', async () => {
      const db = getTestDatabase();
      const admin = await createTestUser({ role: 'admin' });

      await db
        .insertInto('user_invite')
        .values({
          id: uuidv4(),
          token_hash: 'invite-hash-1',
          email: 'gone@example.com',
          intended_role: 'assessee',
          created_by: admin.id,
          expires_at: daysFromNow(7),
          consumed_at: daysFromNow(-45), // 45d ago, beyond 30d default
          consumed_by: admin.id,
        })
        .execute();

      const result = await runSessionCleanupOnce();
      expect(result.invitesDeleted).toBe(1);
    });

    it('deletes revoked invites older than the retention window', async () => {
      const db = getTestDatabase();
      const admin = await createTestUser({ role: 'admin' });

      await db
        .insertInto('user_invite')
        .values({
          id: uuidv4(),
          token_hash: 'invite-hash-2',
          email: 'revoked@example.com',
          intended_role: 'assessee',
          created_by: admin.id,
          expires_at: daysFromNow(7),
          revoked_at: daysFromNow(-60),
        })
        .execute();

      const result = await runSessionCleanupOnce();
      expect(result.invitesDeleted).toBe(1);
    });

    it('deletes unused invites whose own expiry is past the retention window', async () => {
      const db = getTestDatabase();
      const admin = await createTestUser({ role: 'admin' });

      await db
        .insertInto('user_invite')
        .values({
          id: uuidv4(),
          token_hash: 'invite-hash-3',
          email: 'abandoned@example.com',
          intended_role: 'assessee',
          created_by: admin.id,
          expires_at: daysFromNow(-45),
        })
        .execute();

      const result = await runSessionCleanupOnce();
      expect(result.invitesDeleted).toBe(1);
    });

    it('keeps pending invites that have not yet expired', async () => {
      const db = getTestDatabase();
      const admin = await createTestUser({ role: 'admin' });

      await db
        .insertInto('user_invite')
        .values({
          id: uuidv4(),
          token_hash: 'invite-hash-4',
          email: 'pending@example.com',
          intended_role: 'assessee',
          created_by: admin.id,
          expires_at: daysFromNow(7),
        })
        .execute();

      const result = await runSessionCleanupOnce();
      expect(result.invitesDeleted).toBe(0);

      const remaining = await db.selectFrom('user_invite').selectAll().execute();
      expect(remaining.length).toBe(1);
    });

    it('keeps recently consumed invites inside the retention window', async () => {
      const db = getTestDatabase();
      const admin = await createTestUser({ role: 'admin' });

      await db
        .insertInto('user_invite')
        .values({
          id: uuidv4(),
          token_hash: 'invite-hash-5',
          email: 'just-consumed@example.com',
          intended_role: 'assessee',
          created_by: admin.id,
          expires_at: daysFromNow(7),
          consumed_at: daysFromNow(-3),
          consumed_by: admin.id,
        })
        .execute();

      const result = await runSessionCleanupOnce();
      expect(result.invitesDeleted).toBe(0);
    });
  });

  it('returns an aggregate count across both tables in a single pass', async () => {
    const db = getTestDatabase();
    const admin = await createTestUser({ role: 'admin' });

    await db
      .insertInto('session')
      .values({
        id: uuidv4(),
        user_id: admin.id,
        expires_at: hoursFromNow(-72),
      })
      .execute();

    await db
      .insertInto('user_invite')
      .values({
        id: uuidv4(),
        token_hash: 'invite-hash-agg',
        email: 'agg@example.com',
        intended_role: 'assessee',
        created_by: admin.id,
        expires_at: daysFromNow(7),
        revoked_at: daysFromNow(-90),
      })
      .execute();

    const result = await runSessionCleanupOnce();
    expect(result.sessionsDeleted).toBe(1);
    expect(result.invitesDeleted).toBe(1);
  });
});
