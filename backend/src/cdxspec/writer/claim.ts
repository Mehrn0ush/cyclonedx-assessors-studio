/**
 * Claim serializer. Converts an internal claim row (shape from the DB
 * `claim` table) into a CycloneDX Claim object. This is the ONLY
 * supported path for producing a Claim in the exported BOM. Route
 * handlers that previously emitted raw DB rows leaked internal fields
 * (id, createdAt, updatedAt, attestationId, targetEntityId,
 * isCounterClaim, name, bomRef:null) into the output, which failed
 * schema validation because the CycloneDX Claim schema sets
 * additionalProperties: false. The whitelist in this module
 * permanently closes that gap.
 *
 * The DB row carries `is_counter_claim` which does NOT belong on the
 * emitted Claim object: counter claims are represented by placing the
 * claim's bom-ref in `attestation.map[].counterClaims` instead of
 * `attestation.map[].claims`. The split happens in attestationMap.ts,
 * not here.
 */

import { refFor } from '../bomref.js';
import type { Claim } from '../types.js';
import type { TargetResolver } from './targets.js';

/**
 * Minimal shape the writer needs from a claim DB row. Liberal typing
 * because different call sites deliver slightly different shapes
 * (selectAll vs. explicit projections). Unknown keys are ignored.
 */
export interface ClaimRowInput {
  id: string;
  bom_ref?: string | null;
  target: string;
  target_entity_id?: string | null;
  predicate?: string | null;
  reasoning?: string | null;
  is_counter_claim?: boolean;
  // Optional arrays that the caller has already resolved to bom-refs
  evidenceRefs?: string[];
  counterEvidenceRefs?: string[];
  mitigationStrategyRefs?: string[];
}

export function claimFromRow(
  row: ClaimRowInput,
  resolver: TargetResolver
): Claim {
  const bomRef = row.bom_ref && row.bom_ref.trim().length > 0
    ? row.bom_ref
    : refFor('claim', row.id);

  const targetRef = resolver.resolve({
    target: row.target,
    targetEntityId: row.target_entity_id ?? null,
  });

  const claim: Claim = {
    'bom-ref': bomRef,
    target: targetRef,
  };

  if (row.predicate != null && row.predicate !== '') {
    claim.predicate = row.predicate;
  }
  if (row.reasoning != null && row.reasoning !== '') {
    claim.reasoning = row.reasoning;
  }
  if (row.evidenceRefs && row.evidenceRefs.length > 0) {
    claim.evidence = [...row.evidenceRefs];
  }
  if (row.counterEvidenceRefs && row.counterEvidenceRefs.length > 0) {
    claim.counterEvidence = [...row.counterEvidenceRefs];
  }
  if (row.mitigationStrategyRefs && row.mitigationStrategyRefs.length > 0) {
    claim.mitigationStrategies = [...row.mitigationStrategyRefs];
  }

  return claim;
}

/**
 * Helper that indicates whether a claim row represents a counter
 * claim. Callers (attestationMap.ts) use this to decide whether the
 * claim's bom-ref goes into `map[].claims` or `map[].counterClaims`.
 */
export function isCounterClaim(row: { is_counter_claim?: boolean }): boolean {
  return Boolean(row.is_counter_claim);
}
