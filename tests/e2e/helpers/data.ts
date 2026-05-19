/**
 * Random data helpers for E2E tests.
 *
 * All generators are seeded by the process clock so each run produces
 * unique fixtures. We avoid pulling in faker to keep the e2e package
 * lightweight; the few values we generate are good enough to avoid
 * username/email collisions across runs.
 */

let seq = 0;
function nextSeq(): string {
  seq += 1;
  return `${Date.now().toString(36)}${seq.toString(36)}`;
}

export function uniqueUsername(prefix = 'e2e_user'): string {
  return `${prefix}_${nextSeq()}`.slice(0, 32);
}

export function uniqueEmail(localPrefix = 'e2e_user'): string {
  return `${localPrefix}_${nextSeq()}@e2e.test`.toLowerCase();
}

export function uniqueDisplayName(label = 'E2E User'): string {
  return `${label} ${nextSeq()}`;
}

export function uniqueProjectName(): string {
  return `E2E Project ${nextSeq()}`;
}

export function uniqueEntityName(kind = 'product'): string {
  return `E2E ${kind} ${nextSeq()}`;
}

export function uniqueAssessmentTitle(): string {
  return `E2E Assessment ${nextSeq()}`;
}

export function uniqueStandardIdentifier(): string {
  return `E2E-STD-${nextSeq().toUpperCase()}`;
}

export function uniqueEvidenceName(): string {
  return `E2E Evidence ${nextSeq()}`;
}

/**
 * A 15-word rationale meets the assessment requirement update
 * validation rule (see backend/src/routes/assessments.ts).
 */
export const VALID_RATIONALE =
  'This requirement has been thoroughly reviewed and is fully satisfied based on comprehensive evidence and detailed analysis provided.';

/**
 * Strong password that passes the centralized policy
 * (validatePasswordPolicy) regardless of HIBP toggling.
 */
export function strongPassword(): string {
  return `E2eStrong_${nextSeq()}!Aa1`;
}
