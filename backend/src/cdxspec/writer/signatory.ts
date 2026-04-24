/**
 * Signatory serializer.
 *
 * CycloneDX 1.7 (and 1.6) constrain every Signatory object with a
 * oneOf: either `signature` is present, or BOTH `externalReference`
 * AND `organization` are present. A signatory that provides only
 * `name` / `role` / `organization` satisfies neither branch and
 * breaks schema validation on the whole BOM.
 *
 * The writer therefore guards the output in two places:
 *
 *   1. `isSignatoryValid` inspects the final block and reports
 *      whether it satisfies `oneOf`. Callers use this to filter
 *      signatory rows before emitting them into `affirmation.
 *      signatories`.
 *   2. `signatoryBlock` still produces a best-effort block from
 *      whatever the DB row carries. It never throws — validation
 *      is the caller's job so tests can inspect the raw shape.
 *
 * The two-part split lets the route layer decide how to degrade: a
 * per-attestation export that cannot collect a signature for a
 * signatory can either drop that entry or drop the whole
 * `signatories[]` array, keeping `affirmation.statement` as a
 * pointer to the assessment-level sealed envelope.
 */

import type {
  ExternalReference,
  OrganizationalEntity,
  PostalAddress,
  Signatory,
  Signature,
} from '../types.js';

/**
 * Minimal shape the writer needs from a signatory DB row. Liberal
 * typing because the caller delivers selectAll() rows with extra
 * internal fields (created_at, updated_at, organization_id) that
 * are irrelevant here.
 */
export interface SignatoryRowInput {
  name?: string | null;
  role?: string | null;
  external_reference_type?: string | null;
  external_reference_url?: string | null;
}

export interface OrganizationRowInput {
  name?: string | null;
  country?: string | null;
  region?: string | null;
  locality?: string | null;
  post_office_box_number?: string | null;
  postal_code?: string | null;
  street_address?: string | null;
  website?: string | null;
}

export interface SignatoryBlockInput {
  row: SignatoryRowInput;
  organization?: OrganizationRowInput | null;
  envelope?: Signature | null;
  /**
   * Override for the role field. Affirmation signatory slots carry a
   * `required_title` value that should appear as the CycloneDX role
   * when populated, falling back to the underlying signatory's role.
   */
  roleOverride?: string | null;
}

function buildAddress(org: OrganizationRowInput): PostalAddress | undefined {
  const address: PostalAddress = {};
  if (org.country) address.country = org.country;
  if (org.region) address.region = org.region;
  if (org.locality) address.locality = org.locality;
  if (org.post_office_box_number) address.postOfficeBoxNumber = org.post_office_box_number;
  if (org.postal_code) address.postalCode = org.postal_code;
  if (org.street_address) address.streetAddress = org.street_address;
  if (Object.keys(address).length === 0) return undefined;
  return address;
}

function buildOrganization(org: OrganizationRowInput | null | undefined): OrganizationalEntity | undefined {
  if (!org) return undefined;
  const out: OrganizationalEntity = {};
  if (org.name) out.name = org.name;
  const addr = buildAddress(org);
  if (addr) out.address = addr;
  if (org.website) out.url = [org.website];
  return Object.keys(out).length > 0 ? out : undefined;
}

export function signatoryBlock(input: SignatoryBlockInput): Signatory {
  const block: Signatory = {};
  if (input.row.name) block.name = input.row.name;

  const role = input.roleOverride ?? input.row.role;
  if (role) block.role = role;

  const org = buildOrganization(input.organization ?? null);
  if (org) block.organization = org;

  // CycloneDX 1.6 and 1.7 require a Signatory to satisfy exactly
  // one of the two branches: `signature` alone, or
  // `externalReference + organization`. Emitting both causes the
  // schema `oneOf` to fail with "passingSchemas: [0,1]". Prefer the
  // digital-signature branch when an envelope is available, and
  // fall back to externalReference only when the row has no
  // envelope.
  if (input.envelope) {
    block.signature = input.envelope;
  } else if (input.row.external_reference_type && input.row.external_reference_url) {
    const extRef: ExternalReference = {
      type: input.row.external_reference_type,
      url: input.row.external_reference_url,
    };
    block.externalReference = extRef;
  }

  return block;
}

/**
 * Return true when the block satisfies the CycloneDX 1.6 / 1.7
 * Signatory `oneOf`:
 *   - `signature` present (digital signature branch), OR
 *   - BOTH `externalReference` AND `organization` present
 *     (electronic signature / external reference branch).
 *
 * Callers should drop any signatory that returns false before
 * inserting it into an `affirmation.signatories` array; otherwise
 * the entire exported BOM fails schema validation.
 */
export function isSignatoryValid(block: Signatory): boolean {
  if (block.signature) return true;
  if (block.externalReference && block.organization) return true;
  return false;
}
