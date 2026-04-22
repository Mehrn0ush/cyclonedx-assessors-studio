/**
 * Minimal TypeScript types for the subset of CycloneDX (bom-1.6 and
 * bom-1.7) that this application produces and consumes. Hand-written
 * rather than generated from the JSON Schema because the schema is
 * large (~230 KB) and we only touch a narrow slice: the declarations
 * subtree, a few envelope fields, and the organizational-entity /
 * signatory / signature primitives.
 *
 * The types are deliberately permissive about optional fields (every
 * optional is marked optional here even when the schema allows it
 * only in certain contexts) because the writer modules are
 * responsible for enforcing the tighter invariants. Ajv validation
 * against the upstream JSON Schema is the authoritative check.
 */

export type CdxSpecVersion = '1.6' | '1.7';

export interface PostalAddress {
  country?: string;
  region?: string;
  locality?: string;
  postOfficeBoxNumber?: string;
  postalCode?: string;
  streetAddress?: string;
}

export interface OrganizationalContact {
  name?: string;
  email?: string;
  phone?: string;
}

export interface OrganizationalEntity {
  'bom-ref'?: string;
  name?: string;
  address?: PostalAddress;
  url?: string[];
  contact?: OrganizationalContact[];
}

export interface ExternalReference {
  type: string;
  url: string;
  comment?: string;
}

/**
 * The signature subtree is passed through opaquely because it is
 * produced by the JSF provider (see signatures/jsf-provider.ts). We
 * do not redefine the JSF envelope shape here.
 */
export type Signature = Record<string, unknown>;

/**
 * CycloneDX assessor is intentionally minimal. The human/team name
 * and contact email live inside `organization.contact[]`; the top
 * level `name` and `email` properties that some older exports used
 * are NOT in the schema and fail validation.
 */
export interface Assessor {
  'bom-ref': string;
  thirdParty?: boolean;
  organization?: OrganizationalEntity;
}

export interface Conformance {
  score: number;
  rationale?: string;
  mitigationStrategies?: string[];
}

export interface Confidence {
  score: number;
  rationale?: string;
}

export interface AttestationMapEntry {
  requirement: string;
  claims?: string[];
  counterClaims?: string[];
  conformance: Conformance;
  confidence?: Confidence;
}

export interface Attestation {
  summary?: string;
  assessor?: string;
  map: AttestationMapEntry[];
  signature?: Signature;
}

export interface Claim {
  'bom-ref': string;
  target?: string;
  predicate?: string;
  mitigationStrategies?: string[];
  reasoning?: string;
  evidence?: string[];
  counterEvidence?: string[];
  externalReferences?: ExternalReference[];
  signature?: Signature;
}

export interface Evidence {
  'bom-ref': string;
  propertyName?: string;
  description?: string;
  data?: unknown;
  created?: string;
  expires?: string;
  author?: OrganizationalContact;
  reviewer?: OrganizationalContact;
  signature?: Signature;
}

export interface Signatory {
  name?: string;
  role?: string;
  signature?: Signature;
  organization?: OrganizationalEntity;
  externalReference?: ExternalReference;
}

export interface Affirmation {
  statement?: string;
  signatories?: Signatory[];
  signature?: Signature;
}

export interface Targets {
  organizations?: OrganizationalEntity[];
  components?: Array<Record<string, unknown>>;
  services?: Array<Record<string, unknown>>;
}

export interface Declarations {
  assessors?: Assessor[];
  attestations?: Attestation[];
  claims?: Claim[];
  evidence?: Evidence[];
  targets?: Targets;
  affirmation?: Affirmation;
  signature?: Signature;
}

export interface StandardRequirement {
  'bom-ref': string;
  identifier?: string;
  title?: string;
  text?: string;
  descriptions?: string[];
  parent?: string;
  openCre?: string[];
  externalReferences?: ExternalReference[];
  properties?: Array<{ name: string; value?: string }>;
}

export interface Standard {
  'bom-ref': string;
  name?: string;
  version?: string;
  description?: string;
  owner?: string;
  requirements?: StandardRequirement[];
  externalReferences?: ExternalReference[];
}

export interface Definitions {
  standards?: Standard[];
}

export interface ToolComponent {
  type: string;
  name: string;
  version?: string;
}

export interface Metadata {
  timestamp?: string;
  tools?: {
    components?: ToolComponent[];
  };
}

export interface Bom {
  $schema?: string;
  bomFormat: 'CycloneDX';
  specVersion: CdxSpecVersion;
  serialNumber?: string;
  version?: number;
  metadata?: Metadata;
  declarations?: Declarations;
  definitions?: Definitions;
  signature?: Signature;
}
