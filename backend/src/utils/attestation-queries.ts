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
  // A `complete` assessment is NOT treated as read-only here: by
  // policy, attestations can only be created on a completed
  // assessment (see POST /api/v1/attestations), so all edit paths
  // for an attestation are by definition against a completed
  // assessment. The true immutability gate post-creation is
  // rejectIfAttestationImmutable, which fires once the affirmation
  // is sealed.
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
  // Select each column explicitly so the joined `requirement` row can
  // surface `imported_bom_ref` under a stable alias. With
  // `.selectAll()` the joined columns collide by unqualified name and
  // Kysely returns the first match, which drops the imported bom-ref
  // silently and forces the writer back onto the UUID fallback.
  return db
    .selectFrom('attestation_requirement')
    .innerJoin('requirement', 'requirement.id', 'attestation_requirement.requirement_id')
    .where('attestation_requirement.attestation_id', '=', attestationId)
    .select([
      'attestation_requirement.id',
      'attestation_requirement.attestation_id',
      'attestation_requirement.requirement_id',
      'attestation_requirement.conformance_score',
      'attestation_requirement.conformance_rationale',
      'attestation_requirement.confidence_score',
      'attestation_requirement.confidence_rationale',
      'requirement.imported_bom_ref as requirement_imported_bom_ref',
    ])
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
