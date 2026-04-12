import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';

/**
 * Represents a raw CycloneDX standard object (from definitions.standards[]).
 * Accepts both CycloneDX native field names (bom-ref, title, text) and
 * pre-normalized camelCase names (identifier, name, description).
 */
export interface RawStandardInput {
  'bom-ref'?: string;
  bomRef?: string;
  identifier?: string;
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  owner?: string;
  requirements?: any[];
  levels?: any[];
}

export interface ImportedStandardResult {
  id: string;
  identifier: string;
  name: string;
  requirementCount: number;
  levelCount: number;
  skipped: boolean;
}

/**
 * Import a single standard (with requirements and levels) into the database.
 *
 * This is the canonical import logic used by both:
 *  - POST /api/v1/setup/standard  (setup wizard)
 *  - POST /api/v1/standards/import (standards management)
 *
 * The function is idempotent: if a standard with the same identifier already
 * exists, it returns the existing record without modification.
 *
 * @param standard  Raw standard object (CycloneDX native or pre-normalized)
 * @param options   Optional overrides (fallbackName, markAsImported)
 */
export async function importStandard(
  standard: RawStandardInput,
  options: { fallbackName?: string; markAsImported?: boolean; sourceJson?: string } = {},
): Promise<ImportedStandardResult> {
  const db = getDatabase();
  const { fallbackName = 'Unknown Standard', markAsImported = true, sourceJson } = options;

  const bomRef = standard['bom-ref'] || standard.bomRef || standard.identifier || uuidv4();
  const standardName = standard.name || standard.title || fallbackName;
  const standardDesc = standard.description || null;
  const standardVersion = standard.version || null;
  const standardOwner = standard.owner || null;
  const identifier = bomRef;

  // Check if already imported (idempotent)
  const existing = await db
    .selectFrom('standard')
    .where('identifier', '=', identifier)
    .select(['id', 'name'])
    .executeTakeFirst();

  if (existing) {
    return {
      id: existing.id,
      identifier,
      name: existing.name,
      requirementCount: 0,
      levelCount: 0,
      skipped: true,
    };
  }

  const standardId = uuidv4();

  await db
    .insertInto('standard')
    .values({
      id: standardId,
      identifier,
      name: standardName,
      description: standardDesc,
      owner: standardOwner,
      version: standardVersion,
      license_id: null,
      state: 'published',
      is_imported: markAsImported,
      source_json: sourceJson || null,
    })
    .execute();

  // --- Requirements ---
  let requirementCount = 0;
  const requirements = standard.requirements || [];
  const requirementMap = new Map<string, string>();

  // Topological sort: parents must be inserted before their children.
  // Build a map of bom-ref -> requirement, then walk from roots down.
  const reqByRef = new Map<string, any>();
  const childrenOf = new Map<string, any[]>();
  const roots: any[] = [];

  for (const req of requirements) {
    const ref = req['bom-ref'] || req.bomRef || req.identifier || '';
    reqByRef.set(ref, req);
    const parentRef = req.parent || req.parentIdentifier || null;
    if (!parentRef) {
      roots.push(req);
    } else {
      if (!childrenOf.has(parentRef)) {
        childrenOf.set(parentRef, []);
      }
      childrenOf.get(parentRef)!.push(req);
    }
  }

  const sortedRequirements: any[] = [];
  const visit = (node: any) => {
    sortedRequirements.push(node);
    const ref = node['bom-ref'] || node.bomRef || node.identifier || '';
    const children = childrenOf.get(ref) || [];
    for (const child of children) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }

  // Append any orphans whose parent ref doesn't match a known requirement
  // (fallback: they get null parent_id)
  const visited = new Set(sortedRequirements);
  for (const req of requirements) {
    if (!visited.has(req)) {
      sortedRequirements.push(req);
    }
  }

  for (const req of sortedRequirements) {
    const reqBomRef = req['bom-ref'] || req.bomRef || req.identifier || '';
    const reqIdentifier = req.identifier || reqBomRef;
    const reqTitle = req.title || req.text || req.name || reqIdentifier;
    const reqDescription = req.description || req.text || null;
    const reqParent = req.parent || req.parentIdentifier || null;

    // Normalize openCre: may be an array, a string, or absent
    const openCreRaw = req.openCre || req['open-cre'] || null;
    let openCre: string | null = null;
    if (Array.isArray(openCreRaw)) {
      openCre = openCreRaw.length > 0 ? openCreRaw.join(', ') : null;
    } else if (openCreRaw) {
      openCre = openCreRaw;
    }

    const requirementId = uuidv4();

    // Resolve parent
    let parentId: string | null = null;
    if (reqParent && requirementMap.has(reqParent)) {
      parentId = requirementMap.get(reqParent) || null;
    }

    try {
      await db
        .insertInto('requirement')
        .values({
          id: requirementId,
          identifier: reqIdentifier,
          name: reqTitle,
          description: reqDescription,
          open_cre: openCre,
          parent_id: parentId,
          standard_id: standardId,
        })
        .execute();

      requirementMap.set(reqBomRef || reqIdentifier, requirementId);
      requirementCount++;
    } catch (insertError: any) {
      // Skip duplicates
      if (insertError?.message?.includes('duplicate') || insertError?.message?.includes('unique')) {
        continue;
      }
      throw insertError;
    }
  }

  // --- Levels ---
  const levels = standard.levels ?? [];
  let levelCount = 0;

  for (const lvl of levels) {
    const lvlBomRef = lvl['bom-ref'] || lvl.bomRef || '';
    const lvlIdentifier = lvl.identifier || lvlBomRef;
    const lvlTitle = lvl.title || null;
    const lvlDescription = lvl.description || null;

    const levelId = uuidv4();

    try {
      await db
        .insertInto('level')
        .values({
          id: levelId,
          identifier: lvlIdentifier,
          title: lvlTitle,
          description: lvlDescription,
          standard_id: standardId,
        })
        .execute();

      // Associate requirements with this level
      const lvlRequirements: string[] = lvl.requirements || [];
      for (const reqRef of lvlRequirements) {
        const reqUuid = requirementMap.get(reqRef);
        if (reqUuid) {
          try {
            await db
              .insertInto('level_requirement')
              .values({
                level_id: levelId,
                requirement_id: reqUuid,
              })
              .execute();
          } catch (junctionError: any) {
            if (junctionError?.message?.includes('duplicate') || junctionError?.message?.includes('unique')) {
              continue;
            }
            throw junctionError;
          }
        }
      }

      levelCount++;
    } catch (insertError: any) {
      if (insertError?.message?.includes('duplicate') || insertError?.message?.includes('unique')) {
        continue;
      }
      throw insertError;
    }
  }

  logger.info('Standard imported', {
    standardId,
    identifier,
    name: standardName,
    requirementCount,
    levelCount,
  });

  return {
    id: standardId,
    identifier,
    name: standardName,
    requirementCount,
    levelCount,
    skipped: false,
  };
}
