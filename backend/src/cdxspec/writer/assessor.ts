/**
 * Assessor serializer.
 *
 * Maps an internal app_user row into the CycloneDX `assessor` shape.
 * The CycloneDX schema's assessor object only permits three
 * properties: `bom-ref`, `organization`, and `thirdParty`. The
 * person's display name and email do NOT live at the top level;
 * they belong inside `organization.contact[]`. Prior code emitted
 * `name` and `email` directly on the assessor object which the
 * schema flags as additionalProperties violations.
 *
 * For self-assessment scenarios the assessor is the same person /
 * team as the assessee. The `thirdParty` flag is left to callers
 * because the assessor object alone does not carry enough context
 * to decide.
 */

import { refFor } from '../bomref.js';
import type { Assessor, OrganizationalContact, OrganizationalEntity } from '../types.js';

export interface AssessorUserRowInput {
  id: string;
  display_name?: string | null;
  email?: string | null;
  /**
   * Optional organization name to set on `organization.name`. When
   * omitted, the contact is wrapped in an organization object that
   * carries only the contact array.
   */
  organization_name?: string | null;
}

export interface AssessorRowInput {
  user: AssessorUserRowInput;
  thirdParty?: boolean;
}

function buildContact(user: AssessorUserRowInput): OrganizationalContact | undefined {
  const contact: OrganizationalContact = {};
  if (user.display_name) contact.name = user.display_name;
  if (user.email) contact.email = user.email;
  return Object.keys(contact).length > 0 ? contact : undefined;
}

export function assessorFromUserRow(input: AssessorRowInput): Assessor {
  const assessor: Assessor = { 'bom-ref': refFor('assessor', input.user.id) };

  const organization: OrganizationalEntity = {};
  if (input.user.organization_name) organization.name = input.user.organization_name;
  const contact = buildContact(input.user);
  if (contact) organization.contact = [contact];

  if (Object.keys(organization).length > 0) assessor.organization = organization;
  if (input.thirdParty !== undefined) assessor.thirdParty = input.thirdParty;

  return assessor;
}
