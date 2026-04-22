/**
 * declarations subtree composer. Pulls together assessors,
 * attestations, claims, evidence, targets, and affirmation into the
 * CycloneDX declarations object. Also merges targets synthesized by
 * TargetResolver into declarations.targets.organizations.
 */

import type {
  Affirmation,
  Assessor,
  Attestation,
  Claim,
  Declarations,
  Evidence,
  OrganizationalEntity,
  Signature,
  Targets,
} from '../types.js';
import type { TargetResolver } from './targets.js';

export interface ComposeDeclarationsInputs {
  assessors?: Assessor[];
  attestations: Attestation[];
  claims: Claim[];
  evidence?: Evidence[];
  targets?: TargetsInput;
  affirmation?: Affirmation;
  /**
   * Declarations-level JSF seal. The CycloneDX schema places this at
   * declarations.signature; the affirmation cascade signing flow in
   * routes/affirmations.ts produces the envelope. Callers pass it in
   * already-parsed (JSON object, not string).
   */
  seal?: Signature;
  /**
   * TargetResolver accumulates synthesized organizationalEntity
   * records during claim serialization. Its contents are merged into
   * declarations.targets.organizations here.
   */
  targetResolver?: TargetResolver;
}

export interface TargetsInput {
  organizations?: OrganizationalEntity[];
  components?: Array<Record<string, unknown>>;
  services?: Array<Record<string, unknown>>;
}

/**
 * Merge an explicit organizations list with the resolver's synthesized
 * list, preferring explicit entries when bom-refs collide.
 */
function mergeOrganizations(
  explicit: OrganizationalEntity[] | undefined,
  resolver: TargetResolver | undefined
): OrganizationalEntity[] {
  const out = new Map<string, OrganizationalEntity>();
  if (explicit) {
    for (const e of explicit) {
      const ref = e['bom-ref'];
      if (!ref) continue;
      out.set(ref, e);
    }
  }
  if (resolver) {
    for (const e of resolver.organizations()) {
      const ref = e['bom-ref'];
      if (!ref) continue;
      if (!out.has(ref)) out.set(ref, e);
    }
  }
  return Array.from(out.values());
}

export function composeDeclarations(inputs: ComposeDeclarationsInputs): Declarations {
  const declarations: Declarations = {};

  if (inputs.assessors && inputs.assessors.length > 0) {
    declarations.assessors = [...inputs.assessors];
  }

  declarations.attestations = [...inputs.attestations];
  declarations.claims = [...inputs.claims];

  if (inputs.evidence && inputs.evidence.length > 0) {
    declarations.evidence = [...inputs.evidence];
  }

  const organizations = mergeOrganizations(
    inputs.targets?.organizations,
    inputs.targetResolver
  );

  const targets: Targets = {};
  if (organizations.length > 0) targets.organizations = organizations;
  if (inputs.targets?.components && inputs.targets.components.length > 0) {
    targets.components = [...inputs.targets.components];
  }
  if (inputs.targets?.services && inputs.targets.services.length > 0) {
    targets.services = [...inputs.targets.services];
  }
  if (Object.keys(targets).length > 0) declarations.targets = targets;

  if (inputs.affirmation) {
    // Drop internal affirmation.signature duplicate: the CycloneDX
    // schema places the declarations-level seal as declarations.signature,
    // not affirmation.signature. Prior code carried the seal on the
    // affirmation object for cohesion and hoisted it at serialization
    // time; we keep the same behavior but in one place.
    const { signature: _affirmationSeal, ...rest } = inputs.affirmation;
    void _affirmationSeal;
    declarations.affirmation = rest;
  }

  if (inputs.seal) {
    declarations.signature = inputs.seal;
  }

  return declarations;
}
