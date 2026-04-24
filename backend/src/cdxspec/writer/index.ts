/**
 * Writer module barrel. Importers should use `../cdxspec/writer` or
 * `../cdxspec` (the top-level barrel) rather than reaching into the
 * individual files, so changes to the internal layout do not ripple
 * into call sites.
 */

export { composeBom } from './bom.js';
export type { ComposeBomInputs } from './bom.js';

export { composeDeclarations } from './declarations.js';
export type {
  ComposeDeclarationsInputs,
  TargetsInput,
} from './declarations.js';

export { claimFromRow, isCounterClaim } from './claim.js';
export type { ClaimRowInput } from './claim.js';

export { attestationFromRow } from './attestationMap.js';
export type {
  AttestationRowInput,
  AttestationRequirementRowInput,
  ClaimRefMap,
  AttestationInputs,
} from './attestationMap.js';

export { signatoryBlock, isSignatoryValid } from './signatory.js';
export type {
  SignatoryRowInput,
  OrganizationRowInput,
  SignatoryBlockInput,
} from './signatory.js';

export { TargetResolver } from './targets.js';
export type { TargetInput } from './targets.js';

export { standardFromRow } from './standard.js';
export type {
  StandardRowInput,
  RequirementRowInput,
  StandardInputs,
} from './standard.js';

export { assessorFromUserRow } from './assessor.js';
export type {
  AssessorUserRowInput,
  AssessorRowInput,
} from './assessor.js';
