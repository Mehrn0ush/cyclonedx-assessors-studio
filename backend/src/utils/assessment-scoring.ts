/**
 * Assessment Scoring Utilities
 *
 * Shared utilities for computing conformance scores from assessment requirements.
 * Reduces duplication of score calculation logic across route handlers.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * Result to score mapping for conformance calculations.
 * yes = 100%, partial = 50%, no = 0%, others are excluded.
 */
const RESULT_SCORES: Record<string, number> = {
  yes: 100,
  partial: 50,
  no: 0,
};

/**
 * Calculate conformance score for an assessment from its requirements.
 * Excludes 'not_applicable' and null results from calculation.
 *
 * Returns a score from 0-100, or 0 if no scored requirements exist.
 *
 * Usage:
 *   const score = await calculateAssessmentScore(db, assessmentId);
 */
export async function calculateAssessmentScore(
  db: Kysely<Database>,
  assessmentId: string,
): Promise<number> {
  const reqs = await db
    .selectFrom('assessment_requirement')
    .where('assessment_id', '=', assessmentId)
    .where('result', 'is not', null)
    .where('result', '!=', 'not_applicable')
    .select('result')
    .execute();

  if (reqs.length === 0) return 0;

  const total = reqs.reduce((sum, r) => {
    const score = RESULT_SCORES[r.result as string] ?? 0;
    return sum + score;
  }, 0);

  return Math.round(total / reqs.length);
}

/**
 * Calculate average conformance score across multiple assessments.
 * Excludes 'not_applicable' and null results.
 *
 * Usage:
 *   const avgScore = await calculateAverageConformance(db);
 *   const avgScore = await calculateAverageConformance(db, entityId);
 */
export async function calculateAverageConformance(
  db: Kysely<Database>,
  entityId?: string,
): Promise<number> {
  let query = db
    .selectFrom('assessment_requirement')
    .innerJoin('assessment', 'assessment.id', 'assessment_requirement.assessment_id')
    .where('assessment_requirement.result', 'is not', null)
    .where('assessment_requirement.result', '!=', 'not_applicable');

  if (entityId) {
    query = query.where('assessment.entity_id', '=', entityId);
  }

  const conformanceRows = await query
    .select(['assessment_requirement.result'])
    .execute();

  if (conformanceRows.length === 0) return 0;

  const total = conformanceRows.reduce((sum, r) => {
    const score = RESULT_SCORES[r.result as string] ?? 0;
    return sum + score;
  }, 0);

  return Math.round(total / conformanceRows.length);
}

/**
 * Batch calculate scores for multiple assessments.
 * Useful for computing scores across a list of assessments.
 *
 * Usage:
 *   const scores = await calculateAssessmentScores(db, [id1, id2, id3]);
 */
export async function calculateAssessmentScores(
  db: Kysely<Database>,
  assessmentIds: string[],
): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};

  await Promise.all(
    assessmentIds.map(async (id) => {
      scores[id] = await calculateAssessmentScore(db, id);
    })
  );

  return scores;
}
