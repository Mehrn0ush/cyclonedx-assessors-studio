/**
 * Session and invite cleanup job.
 *
 * Expired sessions and terminal (consumed or revoked) invites accumulate
 * in the database over time. Left alone, two problems show up:
 *
 *   1. The session table grows unbounded. Index maintenance and lookup
 *      latency degrade well before the table becomes a storage concern.
 *   2. Expired or revoked records remain a replay surface. Token hashes
 *      for dead sessions and invites should not sit in the database
 *      longer than the forensic window requires.
 *
 * This module runs on a cadence set by SESSION_CLEANUP_INTERVAL_MINUTES
 * and deletes rows that are older than the configured retention
 * windows. A small retention window for expired sessions is kept so
 * operators can investigate a replay attempt that surfaces in logs
 * before the record disappears.
 *
 * Exported `runSessionCleanupOnce` is the unit-testable entry point.
 * `startSessionCleanup` wires it to a setInterval at startup, and
 * `stopSessionCleanup` clears the timer during graceful shutdown.
 */

import { getDatabase } from '../db/connection.js';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface SessionCleanupResult {
  /** Rows deleted from the session table. */
  sessionsDeleted: number;
  /** Rows deleted from the user_invite table. */
  invitesDeleted: number;
}

/**
 * Run a single cleanup pass against the database. Returns the number
 * of rows deleted per table. Safe to call from a worker, a script, or
 * a test harness.
 */
export async function runSessionCleanupOnce(): Promise<SessionCleanupResult> {
  const config = getConfig();
  const db = getDatabase();
  const now = new Date();

  const sessionCutoff = new Date(
    now.getTime() - config.SESSION_RETAIN_EXPIRED_HOURS * 60 * 60 * 1000,
  );

  const inviteCutoff = new Date(
    now.getTime() - config.INVITE_RETAIN_AFTER_TERMINAL_DAYS * 24 * 60 * 60 * 1000,
  );

  // Delete sessions whose expires_at is older than the retention
  // window. The column is NOT NULL per the schema, so a simple
  // predicate is enough. RETURNING is used so the deletion count is
  // portable across PGlite (which does not populate numDeletedRows)
  // and PostgreSQL.
  const sessionRows = await db
    .deleteFrom('session')
    .where('expires_at', '<', sessionCutoff)
    .returning('id')
    .execute();

  // Delete invites that are in a terminal state (consumed or revoked)
  // and have been terminal for longer than the retention window, plus
  // invites whose expires_at passed that retention window (never
  // consumed, never revoked, just abandoned).
  const inviteConsumedOrRevokedRows = await db
    .deleteFrom('user_invite')
    .where((eb) =>
      eb.or([
        eb.and([
          eb('consumed_at', 'is not', null),
          eb('consumed_at', '<', inviteCutoff),
        ]),
        eb.and([
          eb('revoked_at', 'is not', null),
          eb('revoked_at', '<', inviteCutoff),
        ]),
      ]),
    )
    .returning('id')
    .execute();

  const inviteExpiredRows = await db
    .deleteFrom('user_invite')
    .where('consumed_at', 'is', null)
    .where('revoked_at', 'is', null)
    .where('expires_at', '<', inviteCutoff)
    .returning('id')
    .execute();

  const sessionsDeleted = sessionRows.length;
  const invitesDeleted = inviteConsumedOrRevokedRows.length + inviteExpiredRows.length;

  if (sessionsDeleted > 0 || invitesDeleted > 0) {
    logger.info('Session cleanup removed stale records', {
      sessionsDeleted,
      invitesDeleted,
      sessionCutoff: sessionCutoff.toISOString(),
      inviteCutoff: inviteCutoff.toISOString(),
    });
  }

  return { sessionsDeleted, invitesDeleted };
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic session and invite cleanup job. No-op when
 * SESSION_CLEANUP_INTERVAL_MINUTES is 0 (tests disable the job by
 * setting that variable).
 */
export function startSessionCleanup(): void {
  const config = getConfig();
  const minutes = config.SESSION_CLEANUP_INTERVAL_MINUTES;

  if (minutes <= 0) {
    logger.info('Session cleanup job disabled by configuration');
    return;
  }

  if (cleanupTimer) {
    return;
  }

  const intervalMs = minutes * 60 * 1000;

  // Run once on startup so a restart does not delay the first sweep
  // by the full interval.
  runSessionCleanupOnce().catch((error: unknown) => {
    logger.error('Session cleanup job failed on startup', {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  cleanupTimer = setInterval(() => {
    runSessionCleanupOnce().catch((error: unknown) => {
      logger.error('Session cleanup job failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  logger.info('Session cleanup job started', { intervalMinutes: minutes });
}

/** Stop the periodic cleanup job. Safe to call when not started. */
export function stopSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
