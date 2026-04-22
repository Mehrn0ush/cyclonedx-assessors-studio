/**
 * Standard + requirement serializer.
 *
 * Converts internal standard and requirement DB rows into the
 * CycloneDX `standard` shape emitted under `definitions.standards`.
 *
 * The mapping from the DB columns to the CycloneDX schema is not
 * one-to-one: the DB column `requirement.name` maps to the schema's
 * `title` and `requirement.description` maps to `text`. Prior
 * hand-rolled exports emitted the DB column names verbatim which
 * caused validation failures because the CycloneDX requirement schema
 * does not define `name` or `description`. Every caller MUST route
 * through this module so the translation happens in exactly one place.
 */

import { refFor } from '../bomref.js';
import type { Standard, StandardRequirement } from '../types.js';

export interface StandardRowInput {
  id: string;
  identifier?: string | null;
  name?: string | null;
  version?: string | null;
  description?: string | null;
  owner?: string | null;
}

export interface RequirementRowInput {
  id: string;
  identifier?: string | null;
  /**
   * The DB column is `name`; in CycloneDX this becomes `title`.
   */
  name?: string | null;
  /**
   * The DB column is `description`; in CycloneDX this becomes `text`.
   */
  description?: string | null;
  parent_id?: string | null;
  open_cre?: string | null;
}

export interface StandardInputs {
  row: StandardRowInput;
  requirements: RequirementRowInput[];
}

function requirementFromRow(row: RequirementRowInput): StandardRequirement {
  const req: StandardRequirement = {
    'bom-ref': refFor('requirement', row.id),
  };
  if (row.identifier) req.identifier = row.identifier;
  if (row.name) req.title = row.name;
  if (row.description) req.text = row.description;
  if (row.parent_id) req.parent = refFor('requirement', row.parent_id);
  if (row.open_cre && row.open_cre.trim().length > 0) {
    req.openCre = row.open_cre
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return req;
}

export function standardFromRow(inputs: StandardInputs): Standard {
  const std: Standard = {
    'bom-ref': refFor('standard', inputs.row.id),
  };
  // The DB `identifier` (e.g. "SSDF") is a short code and the DB
  // `name` is the expanded form ("Secure Software Development
  // Framework"). The CycloneDX schema only defines `name`, so the
  // full name is used here. The identifier flows through only as the
  // basis for the bom-ref which is already covered above.
  if (inputs.row.name) std.name = inputs.row.name;
  if (inputs.row.version) std.version = inputs.row.version;
  if (inputs.row.description) std.description = inputs.row.description;
  if (inputs.row.owner) std.owner = inputs.row.owner;

  if (inputs.requirements.length > 0) {
    std.requirements = inputs.requirements.map(requirementFromRow);
  }
  return std;
}
