/**
 * Database Count Query Utilities
 *
 * Shared utilities to reduce duplication in count queries across route handlers.
 * Provides a generic countWhere() function and domain-specific helpers for
 * common counting patterns (assessments by state, evidence by state, etc.).
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * Generic count helper: counts all rows in a table that match optional conditions.
 * Returns the count as a number.
 *
 * Usage:
 *   const total = await countWhere(db, 'assessment');
 *   const active = await countWhere(db, 'assessment', (eb) =>
 *     eb('state', '=', 'in_progress')
 *   );
 */
export async function countWhere(
  db: Kysely<Database>,
  table: keyof Database,
  whereCallback?: (
    eb: any,
  ) => any,
): Promise<number> {
  let query = db
    .selectFrom(table as any)
    .select(db.fn.count<number>('id').as('count'));

  if (whereCallback) {
    query = query.where(whereCallback as any);
  }

  const result = await query.executeTakeFirstOrThrow();
  return Number(result.count);
}

/**
 * Count all rows in a table.
 *
 * Usage:
 *   const total = await countAll(db, 'project');
 */
export async function countAll(
  db: Kysely<Database>,
  table: keyof Database,
): Promise<number> {
  return countWhere(db, table);
}

/**
 * Count rows where a single column matches a value.
 *
 * Usage:
 *   const inProgress = await countByState(db, 'project', 'in_progress');
 */
export async function countByColumn<T extends string>(
  db: Kysely<Database>,
  table: keyof Database,
  column: string,
  value: T,
): Promise<number> {
  return countWhere(db, table, (eb: any) => eb(column, '=', value));
}

/**
 * Count assessment records by state.
 *
 * Usage:
 *   const complete = await countAssessmentsByState(db, 'complete');
 *   const inProgress = await countAssessmentsByState(db, 'in_progress');
 */
export async function countAssessmentsByState(
  db: Kysely<Database>,
  state: string,
): Promise<number> {
  return countByColumn(db, 'assessment', 'state', state);
}

/**
 * Count evidence records by state.
 *
 * Usage:
 *   const expired = await countEvidenceByState(db, 'expired');
 */
export async function countEvidenceByState(
  db: Kysely<Database>,
  state: string,
): Promise<number> {
  return countByColumn(db, 'evidence', 'state', state);
}

/**
 * Count projects by state.
 *
 * Usage:
 *   const inProgress = await countProjectsByState(db, 'in_progress');
 */
export async function countProjectsByState(
  db: Kysely<Database>,
  state: string,
): Promise<number> {
  return countByColumn(db, 'project', 'state', state);
}

/**
 * Count evidence expiring within a date range (exclusive of expired state).
 *
 * Usage:
 *   const expiringSoon = await countEvidenceExpiringWithin(db, 30); // 30 days
 */
export async function countEvidenceExpiringWithin(
  db: Kysely<Database>,
  daysFromNow: number,
): Promise<number> {
  const now = new Date();
  const expiryDate = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);

  return countWhere(db, 'evidence', (eb: any) =>
    eb.and([
      eb('expires_on', '>', now),
      eb('expires_on', '<', expiryDate),
      eb('state', '!=', 'expired'),
    ]),
  );
}

/**
 * Count overdue assessments (due_date in past, not complete/cancelled).
 *
 * Usage:
 *   const overdue = await countOverdueAssessments(db);
 */
export async function countOverdueAssessments(
  db: Kysely<Database>,
): Promise<number> {
  return countWhere(db, 'assessment', (eb: any) =>
    eb.and([
      eb('due_date', '<', new Date()),
      eb('state', '!=', 'complete'),
      eb('state', '!=', 'cancelled'),
    ]),
  );
}

/**
 * Count assessment requirements with a specific result value.
 *
 * Usage:
 *   const passed = await countAssessmentRequirementsByResult(db, 'yes');
 */
export async function countAssessmentRequirementsByResult(
  db: Kysely<Database>,
  result: string,
): Promise<number> {
  return countWhere(db, 'assessment_requirement', (eb: any) =>
    eb('result', '=', result),
  );
}

/**
 * Count assessments completed in a given quarter.
 *
 * Usage:
 *   const thisQuarter = await countCompletedAssessmentsThisQuarter(db);
 */
export async function countCompletedAssessmentsThisQuarter(
  db: Kysely<Database>,
): Promise<number> {
  const now = new Date();
  const quarterStart = new Date(
    now.getFullYear(),
    Math.floor(now.getMonth() / 3) * 3,
    1,
  );

  return countWhere(db, 'assessment', (eb: any) =>
    eb.and([
      eb('state', '=', 'complete'),
      eb('updated_at', '>=', quarterStart),
    ]),
  );
}
