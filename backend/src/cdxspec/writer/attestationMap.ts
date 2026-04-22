/**
 * Attestation + map entry serializer.
 *
 * Converts an internal attestation row plus its attestation_requirement
 * rows and claims into the CycloneDX Attestation shape, including the
 * per-requirement map entries with conformance and confidence scores.
 * This is the only place in the codebase that converts DECIMAL score
 * columns to CycloneDX score numbers; every caller MUST route through
 * here so the toScore() coercion happens in exactly one place and
 * the score strings never leak into exported BOMs.
 */

import { refFor } from '../bomref.js';
import { toScore, requireScore } from '../scores.js';
import type { Attestation, AttestationMapEntry, Conformance, Confidence } from '../types.js';

export interface AttestationRowInput {
  id: string;
  summary?: string | null;
}

export interface AttestationRequirementRowInput {
  /**
   * The `id` (PK) of the upstream requirement row. The map entry's
   * `requirement` property is built from this value via bomref.refFor.
   */
  requirement_id: string;
  conformance_score: unknown;
  conformance_rationale?: string | null;
  confidence_score?: unknown;
  confidence_rationale?: string | null;
  mitigationStrategyRefs?: string[];
}

export interface ClaimRefMap {
  /** Claim bom-ref arrays per requirement. Empty if no direct link exists. */
  byRequirementId: Map<string, { claims: string[]; counterClaims: string[] }>;
  /** Fallback arrays when no per-requirement mapping is available. */
  allClaims: string[];
  allCounterClaims: string[];
}

export interface AttestationInputs {
  row: AttestationRowInput;
  requirements: AttestationRequirementRowInput[];
  claimRefs: ClaimRefMap;
  assessorRef?: string;
}

function buildConformance(ar: AttestationRequirementRowInput): Conformance {
  const conformance: Conformance = {
    score: requireScore(ar.conformance_score, 'conformance.score'),
  };
  if (ar.conformance_rationale) conformance.rationale = ar.conformance_rationale;
  if (ar.mitigationStrategyRefs && ar.mitigationStrategyRefs.length > 0) {
    conformance.mitigationStrategies = [...ar.mitigationStrategyRefs];
  }
  return conformance;
}

function buildConfidence(ar: AttestationRequirementRowInput): Confidence | undefined {
  const score = toScore(ar.confidence_score);
  if (score === undefined) return undefined;
  const confidence: Confidence = { score };
  if (ar.confidence_rationale) confidence.rationale = ar.confidence_rationale;
  return confidence;
}

function buildMapEntry(
  ar: AttestationRequirementRowInput,
  claimRefs: ClaimRefMap
): AttestationMapEntry {
  const entry: AttestationMapEntry = {
    requirement: refFor('requirement', ar.requirement_id),
    conformance: buildConformance(ar),
  };

  const perReq = claimRefs.byRequirementId.get(ar.requirement_id);
  const claims = perReq ? perReq.claims : claimRefs.allClaims;
  const counterClaims = perReq ? perReq.counterClaims : claimRefs.allCounterClaims;

  if (claims.length > 0) entry.claims = [...claims];
  if (counterClaims.length > 0) entry.counterClaims = [...counterClaims];

  const confidence = buildConfidence(ar);
  if (confidence) entry.confidence = confidence;

  return entry;
}

export function attestationFromRow(inputs: AttestationInputs): Attestation {
  const attestation: Attestation = {
    map: inputs.requirements.map((ar) => buildMapEntry(ar, inputs.claimRefs)),
  };

  if (inputs.row.summary) {
    attestation.summary = inputs.row.summary;
  }
  if (inputs.assessorRef) {
    attestation.assessor = inputs.assessorRef;
  }

  return attestation;
}
