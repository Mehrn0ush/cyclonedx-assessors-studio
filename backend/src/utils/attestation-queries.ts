/**
 * Shared attestation query helper functions.
 * Extracted from attestations.ts to reduce duplication.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * Check if an attestation's parent assessment is read-only.
 * Returns error message if read-only, null if mutable.
 */
export async function checkAttestationAssessmentReadOnly(
  db: Kysely<Database>,
  assessmentId: string
): Promise<string | null> {
  const assessment = await db
    .selectFrom('assessment')
    .where('id', '=', assessmentId)
    .select(['state'])
    .executeTakeFirst();

  if (!assessment) return null;
  if (assessment.state === 'archived') return 'This attestation belongs to an archived assessment and cannot be modified';
  if (assessment.state === 'complete') return 'This attestation belongs to a completed assessment. Reopen the assessment to make changes.';
  return null;
}

/**
 * Fetch an attestation by ID.
 */
export async function fetchAttestationById(db: Kysely<Database>, attestationId: string) {
  return db
    .selectFrom('attestation')
    .where('id', '=', attestationId)
    .selectAll()
    .executeTakeFirst();
}

/**
 * Fetch attestation requirements for an attestation.
 */
export async function fetchAttestationRequirements(db: Kysely<Database>, attestationId: string) {
  return db
    .selectFrom('attestation_requirement')
    .innerJoin('requirement', 'requirement.id', 'attestation_requirement.requirement_id')
    .where('attestation_requirement.attestation_id', '=', attestationId)
    .selectAll()
    .execute();
}

/**
 * Fetch claims for an attestation.
 */
export async function fetchAttestationClaims(db: Kysely<Database>, attestationId: string) {
  return db
    .selectFrom('claim')
    .where('attestation_id', '=', attestationId)
    .selectAll()
    .execute();
}

/**
 * Fetch signatory for an attestation.
 */
export async function fetchSignatory(db: Kysely<Database>, signatoryId: string | null) {
  if (!signatoryId) return null;
  return db
    .selectFrom('signatory')
    .where('id', '=', signatoryId)
    .selectAll()
    .executeTakeFirst();
}

/**
 * Check if a requirement already exists in an attestation.
 */
export async function checkRequirementExists(
  db: Kysely<Database>,
  attestationId: string,
  requirementId: string
) {
  return db
    .selectFrom('attestation_requirement')
    .where('attestation_id', '=', attestationId)
    .where('requirement_id', '=', requirementId)
    .selectAll()
    .executeTakeFirst();
}
