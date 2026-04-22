/**
 * Signatory serializer.
 *
 * TODO(C): CycloneDX 1.7 requires a Signatory object to satisfy a
 * oneOf constraint: either `signature` is present, or BOTH
 * `externalReference` AND `organization` are present. The current
 * demo data produces signatories that meet neither branch (name +
 * role + organization, no externalReference, no signature) when a
 * single-attestation export omits the JSF envelope. Per the
 * decision in the design review, this pass preserves the existing
 * behavior. A follow-up decision will select between:
 *   (a) dropping the signatories[] array when no signatory can
 *       satisfy oneOf, keeping `affirmation.statement`;
 *   (b) omitting the entire `affirmation` block in that case.
 * Once chosen, add the enforcement here so invalid signatories
 * never reach the BOM.
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

  if (input.row.external_reference_type && input.row.external_reference_url) {
    const extRef: ExternalReference = {
      type: input.row.external_reference_type,
      url: input.row.external_reference_url,
    };
    block.externalReference = extRef;
  }

  if (input.envelope) block.signature = input.envelope;

  return block;
}
