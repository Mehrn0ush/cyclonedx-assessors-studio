import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { topologicalSort, compareIdentifiers } from './requirement-utils.js';

/**
 * Generate a CycloneDX 1.6 JSON document for a single standard.
 *
 * The output conforms to the `definitions.standards[]` structure
 * described in the CycloneDX specification (ECMA-424).
 *
 * Requirements use `bom-ref` for identity and `parent` for hierarchy
 * (referencing the parent requirement's bom-ref string).
 * Levels include an array of requirement bom-refs.
 */
export async function generateStandardCycloneDX(standardId: string): Promise<string> {
  const db = getDatabase();

  const standard = await db
    .selectFrom('standard')
    .where('id', '=', standardId)
    .selectAll()
    .executeTakeFirstOrThrow();

  // Fetch all requirements (flat)
  const requirements = await db
    .selectFrom('requirement')
    .where('standard_id', '=', standardId)
    .selectAll()
    .execute();

  // Sort requirements: parents before children, siblings in natural
  // alphanumeric order by identifier (matches in-app display order).
  const sortedRequirements = topologicalSort(requirements);

  // Build a map from UUID to identifier for parent resolution
  const idToIdentifier = new Map<string, string>();
  for (const req of sortedRequirements) {
    idToIdentifier.set(req.id, req.identifier);
  }

  // Serialize requirements in a flat list with parent bom-ref references
  const cdxRequirements = sortedRequirements.map((req) => {
    const entry: Record<string, string | string[] | boolean> = {
      'bom-ref': req.identifier,
      identifier: req.identifier,
      title: req.name,
    };

    if (req.description) {
      entry.text = req.description;
    }

    if (req.open_cre) {
      entry.openCre = req.open_cre.includes(',')
        ? req.open_cre.split(',').map((s: string) => s.trim())
        : [req.open_cre];
    }

    if (req.parent_id) {
      const parentIdentifier = idToIdentifier.get(req.parent_id);
      if (parentIdentifier) {
        entry.parent = parentIdentifier;
      }
    }

    return entry;
  });

  // Fetch levels with their requirement associations, sorted by identifier
  const levels = await db
    .selectFrom('level')
    .where('standard_id', '=', standardId)
    .selectAll()
    .execute();

  levels.sort((a, b) => compareIdentifiers(a.identifier, b.identifier));

  const cdxLevels = [];
  for (const lvl of levels) {
    const lvlReqs = await db
      .selectFrom('level_requirement')
      .innerJoin('requirement', 'requirement.id', 'level_requirement.requirement_id')
      .where('level_requirement.level_id', '=', lvl.id)
      .select(['requirement.identifier'])
      .execute();

    const entry: Record<string, any> = {
      'bom-ref': lvl.identifier,
      identifier: lvl.identifier,
    };

    if (lvl.title) {
      entry.title = lvl.title;
    }
    if (lvl.description) {
      entry.description = lvl.description;
    }
    if (lvlReqs.length > 0) {
      entry.requirements = lvlReqs
        .map((r) => r.identifier)
        .sort(compareIdentifiers);
    }

    cdxLevels.push(entry);
  }

  // Build the standard object
  const cdxStandard: Record<string, string | object[]> = {
    'bom-ref': standard.identifier,
    name: standard.name,
  };

  if (standard.version) {
    cdxStandard.version = standard.version;
  }
  if (standard.description) {
    cdxStandard.description = standard.description;
  }
  if (standard.owner) {
    cdxStandard.owner = standard.owner;
  }
  if (cdxRequirements.length > 0) {
    cdxStandard.requirements = cdxRequirements;
  }
  if (cdxLevels.length > 0) {
    cdxStandard.levels = cdxLevels;
  }

  // Build full CycloneDX BOM envelope
  const bom = {
    $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${uuidv4()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: {
        components: [
          {
            type: 'application',
            name: 'CycloneDX Assessors Studio',
            version: '1.0.0',
          },
        ],
      },
    },
    definitions: {
      standards: [cdxStandard],
    },
  };

  return JSON.stringify(bom, null, 2);
}
