/**
 * Sprint 5.7: symmetric retention lock for claims and attestations.
 *
 * The evidence-side helper (`isEvidenceImmutable` in routes/evidence.ts)
 * already stops mutations on evidence once it has been used. Sprint 5.7
 * mirrors that stance up one level of the declaration record hierarchy:
 * if an evidence row is locked, the claim that cites it should be
 * locked too, and if a claim is locked, the attestation that cites that
 * claim should be locked too. Otherwise the record-integrity guarantee
 * we just added for evidence is trivially defeated by editing the
 * containing claim or attestation instead.
 *
 * The rules enforced here are:
 *
 *   Attestation is immutable when:
 *     1. `attestation.signed_at IS NOT NULL` (it has been signed).
 *     2. Its parent assessment is in a terminal state
 *        (`complete`, `archived`, or `cancelled`).
 *
 *   Claim is immutable when:
 *     1. It is cited (directly via `claim.attestation_id`, or through
 *        `attestation_requirement_claim` / `attestation_requirement_counter_claim`)
 *        by any attestation that has been signed.
 *     2. Its parent assessment (via its linked attestation) is in a
 *        terminal state.
 *
 * Like the evidence rule, these are record-integrity policies, not
 * authorization policies. Admins are bound by them. Callers must not
 * consult `req.user.role` or permissions to short-circuit.
 *
 * Enforcement layer returns 409 Conflict with a machine-readable
 * `reason` so the client can distinguish retention from 403 (no
 * permission) and 404 (not found / not authorized).
 */

import type { Kysely } from 'kysely';
import type { Response } from 'express';
import type { Database } from '../db/types.js';

export type AttestationImmutableReason =
  | 'signed'
  | 'assessment_terminal';

export type ClaimImmutableReason =
  | 'cited_in_signed_attestation'
  | 'assessment_terminal';

type AttestationImmutableResult =
  | { immutable: true; reason: AttestationImmutableReason }
  | { immutable: false };

type ClaimImmutableResult =
  | { immutable: true; reason: ClaimImmutableReason }
  | { immutable: false };

/**
 * Determine whether an attestation is retention-locked.
 *
 * Returns `{ immutable: false }` when the attestation does not exist so
 * the caller can fall through to the regular 404 path; there is no
 * benefit to a 409 on a phantom id.
 */
export async function isAttestationImmutable(
  db: Kysely<Database>,
  attestationId: string,
): Promise<AttestationImmutableResult> {
  const attestation = await db
    .selectFrom('attestation')
    .where('id', '=', attestationId)
    .select(['assessment_id', 'signed_at'])
    .executeTakeFirst();

  if (!attestation) return { immutable: false };

  if (attestation.signed_at) {
    return { immutable: true, reason: 'signed' };
  }

  if (attestation.assessment_id) {
    const assessment = await db
      .selectFrom('assessment')
      .where('id', '=', attestation.assessment_id)
      .select(['state'])
      .executeTakeFirst();
    if (assessment && ['complete', 'archived', 'cancelled'].includes(assessment.state)) {
      return { immutable: true, reason: 'assessment_terminal' };
    }
  }

  return { immutable: false };
}

/**
 * Determine whether a claim is retention-locked.
 */
export async function isClaimImmutable(
  db: Kysely<Database>,
  claimId: string,
): Promise<ClaimImmutableResult> {
  const claim = await db
    .selectFrom('claim')
    .where('id', '=', claimId)
    .select(['attestation_id'])
    .executeTakeFirst();

  if (!claim) return { immutable: false };

  // Case 1: the claim is directly bound to an attestation via the
  // attestation_id foreign key. A signed attestation locks the claim.
  if (claim.attestation_id) {
    const direct = await db
      .selectFrom('attestation')
      .where('id', '=', claim.attestation_id)
      .select(['signed_at', 'assessment_id'])
      .executeTakeFirst();

    if (direct?.signed_at) {
      return { immutable: true, reason: 'cited_in_signed_attestation' };
    }
    if (direct?.assessment_id) {
      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', direct.assessment_id)
        .select(['state'])
        .executeTakeFirst();
      if (assessment && ['complete', 'archived', 'cancelled'].includes(assessment.state)) {
        return { immutable: true, reason: 'assessment_terminal' };
      }
    }
  }

  // Case 2: the claim is cited via the attestation_requirement_claim
  // junction (map[].claims[] in CycloneDX declarations) by a signed
  // attestation. The attestation FK alone is not enough: CycloneDX lets
  // a claim live free-floating and still be referenced from an
  // attestation's requirement map.
  const citedByClaim = await db
    .selectFrom('attestation_requirement_claim as arc')
    .innerJoin('attestation_requirement as ar', 'ar.id', 'arc.attestation_requirement_id')
    .innerJoin('attestation as a', 'a.id', 'ar.attestation_id')
    .where('arc.claim_id', '=', claimId)
    .where('a.signed_at', 'is not', null)
    .select('a.id')
    .limit(1)
    .executeTakeFirst();
  if (citedByClaim) {
    return { immutable: true, reason: 'cited_in_signed_attestation' };
  }

  // Case 3: same check for counter-claims (map[].counterClaims[]).
  const citedByCounterClaim = await db
    .selectFrom('attestation_requirement_counter_claim as arcc')
    .innerJoin('attestation_requirement as ar', 'ar.id', 'arcc.attestation_requirement_id')
    .innerJoin('attestation as a', 'a.id', 'ar.attestation_id')
    .where('arcc.claim_id', '=', claimId)
    .where('a.signed_at', 'is not', null)
    .select('a.id')
    .limit(1)
    .executeTakeFirst();
  if (citedByCounterClaim) {
    return { immutable: true, reason: 'cited_in_signed_attestation' };
  }

  return { immutable: false };
}

const ATTESTATION_REASON_MESSAGES: Record<AttestationImmutableReason, string> = {
  signed: 'Attestation is immutable once signed',
  assessment_terminal: 'Attestation is immutable once its assessment is complete, archived, or cancelled',
};

const CLAIM_REASON_MESSAGES: Record<ClaimImmutableReason, string> = {
  cited_in_signed_attestation: 'Claim is immutable once cited in a signed attestation',
  assessment_terminal: 'Claim is immutable once its assessment is complete, archived, or cancelled',
};

/**
 * Convenience helper: if the attestation is retention-locked, write a
 * 409 Conflict response and return true so the caller can early-return.
 * Otherwise returns false and writes nothing.
 */
export async function rejectIfAttestationImmutable(
  db: Kysely<Database>,
  attestationId: string,
  res: Response,
): Promise<boolean> {
  const result = await isAttestationImmutable(db, attestationId);
  if (!result.immutable) return false;

  res.status(409).json({
    error: ATTESTATION_REASON_MESSAGES[result.reason],
    reason: result.reason,
  });
  return true;
}

/**
 * Convenience helper: if the claim is retention-locked, write a 409
 * Conflict response and return true so the caller can early-return.
 * Otherwise returns false and writes nothing.
 */
export async function rejectIfClaimImmutable(
  db: Kysely<Database>,
  claimId: string,
  res: Response,
): Promise<boolean> {
  const result = await isClaimImmutable(db, claimId);
  if (!result.immutable) return false;

  res.status(409).json({
    error: CLAIM_REASON_MESSAGES[result.reason],
    reason: result.reason,
  });
  return true;
}
