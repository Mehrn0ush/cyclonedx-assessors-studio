import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';

/**
 * Represents a raw requirement object from CycloneDX standards.
 */
export interface RawRequirement {
  'bom-ref'?: string;
  bomRef?: string;
  identifier?: string;
  title?: string;
  text?: string;
  name?: string;
  description?: string;
  parent?: string | null;
  parentIdentifier?: string | null;
  openCre?: string | string[] | null;
  'open-cre'?: string | string[] | null;
}

/**
 * Represents a raw level object from CycloneDX standards.
 */
export interface RawLevel {
  'bom-ref'?: string;
  bomRef?: string;
  identifier?: string;
  title?: string | null;
  description?: string | null;
  requirements?: string[];
}

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
  requirements?: RawRequirement[];
  levels?: RawLevel[];
}

export interface ImportedStandardResult {
  id: string;
  identifier: string;
  name: string;
  requirementCount: number;
  levelCount: number;
  skipped: boolean;
}

// ---- Helper functions (not exported) ----

/**
 * Extract the reference ID from a requirement using multiple fallback formats.
 */
function getRequirementRef(req: RawRequirement): string {
  return req['bom-ref'] || req.bomRef || req.identifier || '';
}

/**
 * Extract the parent reference from a requirement using multiple fallback formats.
 */
function getRequirementParentRef(req: RawRequirement): string | null {
  return req.parent || req.parentIdentifier || null;
}

/**
 * Build parent-child relationships from requirements.
 */
function buildRelationshipMaps(requirements: RawRequirement[]): {
  childrenOf: Map<string, RawRequirement[]>;
  roots: RawRequirement[];
} {
  const childrenOf = new Map<string, RawRequirement[]>();
  const roots: RawRequirement[] = [];

  for (const req of requirements) {
    const parentRef = getRequirementParentRef(req);
    if (!parentRef) {
      roots.push(req);
    } else {
      if (!childrenOf.has(parentRef)) {
        childrenOf.set(parentRef, []);
      }
      childrenOf.get(parentRef)?.push(req);
    }
  }

  return { childrenOf, roots };
}

/**
 * Recursively visit a node and its children in DFS order.
 */
function visitRequirementNode(
  node: RawRequirement,
  childrenOf: Map<string, RawRequirement[]>,
  sorted: RawRequirement[]
): void {
  sorted.push(node);
  const ref = getRequirementRef(node);
  const children = childrenOf.get(ref) || [];
  for (const child of children) {
    visitRequirementNode(child, childrenOf, sorted);
  }
}

/**
 * Normalize standard metadata fields from various input formats.
 */
function normalizeStandardMetadata(standard: RawStandardInput, fallbackName: string) {
  const bomRef = standard['bom-ref'] || standard.bomRef || standard.identifier || uuidv4();
  return {
    identifier: bomRef,
    name: standard.name || standard.title || fallbackName,
    description: standard.description || null,
    version: standard.version || null,
    owner: standard.owner || null,
  };
}

/**
 * Build a topologically sorted list of requirements (parents before children).
 */
function topologicalSortRequirements(requirements: RawRequirement[]): RawRequirement[] {
  const { childrenOf, roots } = buildRelationshipMaps(requirements);

  const sorted: RawRequirement[] = [];
  for (const root of roots) {
    visitRequirementNode(root, childrenOf, sorted);
  }

  // Append any orphans whose parent ref doesn't match
  const visited = new Set(sorted);
  for (const req of requirements) {
    if (!visited.has(req)) {
      sorted.push(req);
    }
  }

  return sorted;
}

/**
 * Normalize openCre from various formats (array, string, or null).
 */
function normalizeOpenCre(openCreRaw: string | string[] | null): string | null {
  if (Array.isArray(openCreRaw)) {
    return openCreRaw.length > 0 ? openCreRaw.join(', ') : null;
  }
  return openCreRaw || null;
}

/**
 * Normalize a single requirement from various input formats.
 */
function normalizeRequirement(req: RawRequirement) {
  const reqBomRef = getRequirementRef(req);
  const reqIdentifier = req.identifier || reqBomRef;
  const reqTitle = req.title || req.text || req.name || reqIdentifier;
  const reqDescription = req.description || req.text || null;
  const reqParent = getRequirementParentRef(req);

  const openCreRaw = req.openCre || req['open-cre'] || null;
  const openCre = normalizeOpenCre(openCreRaw);

  return {
    bomRef: reqBomRef,
    identifier: reqIdentifier,
    title: reqTitle,
    description: reqDescription,
    parent: reqParent,
    openCre,
  };
}

/**
 * Insert a single requirement into the database.
 * Returns the requirement ID or null if duplicate and skipped.
 */
async function insertRequirement(
  db: ReturnType<typeof getDatabase>,
  req: RawRequirement,
  standardId: string,
  requirementMap: Map<string, string>,
): Promise<string | null> {
  const normalized = normalizeRequirement(req);
  const requirementId = uuidv4();

  // Resolve parent
  let parentId: string | null = null;
  if (normalized.parent && requirementMap.has(normalized.parent)) {
    parentId = requirementMap.get(normalized.parent) || null;
  }

  try {
    await db
      .insertInto('requirement')
      .values({
        id: requirementId,
        identifier: normalized.identifier,
        name: normalized.title,
        description: normalized.description,
        open_cre: normalized.openCre,
        parent_id: parentId,
        standard_id: standardId,
      })
      .execute();

    requirementMap.set(normalized.bomRef || normalized.identifier, requirementId);
    return requirementId;
  } catch (insertError: unknown) {
    // Skip duplicates
    const error = insertError as Record<string, unknown>;
    const message = error?.message ?? '';
    if (typeof message === 'string' && (message.includes('duplicate') || message.includes('unique'))) {
      return null;
    }
    throw insertError;
  }
}

/**
 * Import all requirements for a standard.
 * Returns count of successfully imported requirements.
 */
async function importRequirements(
  db: ReturnType<typeof getDatabase>,
  standard: RawStandardInput,
  standardId: string,
): Promise<{ count: number; map: Map<string, string> }> {
  const requirements = standard.requirements || [];
  const requirementMap = new Map<string, string>();
  let count = 0;

  const sortedRequirements = topologicalSortRequirements(requirements);

  for (const req of sortedRequirements) {
    const id = await insertRequirement(db, req, standardId, requirementMap);
    if (id) {
      count++;
    }
  }

  return { count, map: requirementMap };
}

/**
 * Normalize a single level from various input formats.
 */
function normalizeLevel(lvl: RawLevel) {
  const lvlBomRef = lvl['bom-ref'] || lvl.bomRef || '';
  return {
    bomRef: lvlBomRef,
    identifier: lvl.identifier || lvlBomRef,
    title: lvl.title || null,
    description: lvl.description || null,
    requirements: lvl.requirements || [],
  };
}

/**
 * Link a level to its requirements via junction table.
 */
async function linkLevelRequirements(
  db: ReturnType<typeof getDatabase>,
  levelId: string,
  lvlRequirements: string[],
  requirementMap: Map<string, string>,
): Promise<void> {
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
      } catch (junctionError: unknown) {
        const error = junctionError as Record<string, unknown>;
        const message = error?.message ?? '';
        if (typeof message === 'string' && (message.includes('duplicate') || message.includes('unique'))) {
          continue;
        }
        throw junctionError;
      }
    }
  }
}

/**
 * Insert a single level into the database.
 * Returns the level ID or null if duplicate and skipped.
 */
async function insertLevel(
  db: ReturnType<typeof getDatabase>,
  lvl: RawLevel,
  standardId: string,
  requirementMap: Map<string, string>,
): Promise<string | null> {
  const normalized = normalizeLevel(lvl);
  const levelId = uuidv4();

  try {
    await db
      .insertInto('level')
      .values({
        id: levelId,
        identifier: normalized.identifier,
        title: normalized.title,
        description: normalized.description,
        standard_id: standardId,
      })
      .execute();

    // Link requirements to this level
    await linkLevelRequirements(db, levelId, normalized.requirements, requirementMap);

    return levelId;
  } catch (insertError: unknown) {
    const error = insertError as Record<string, unknown>;
    const message = error?.message ?? '';
    if (typeof message === 'string' && (message.includes('duplicate') || message.includes('unique'))) {
      return null;
    }
    throw insertError;
  }
}

/**
 * Import all levels for a standard.
 * Returns count of successfully imported levels.
 */
async function importLevels(
  db: ReturnType<typeof getDatabase>,
  standard: RawStandardInput,
  standardId: string,
  requirementMap: Map<string, string>,
): Promise<number> {
  const levels = standard.levels ?? [];
  let count = 0;

  for (const lvl of levels) {
    const id = await insertLevel(db, lvl, standardId, requirementMap);
    if (id) {
      count++;
    }
  }

  return count;
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

  const meta = normalizeStandardMetadata(standard, fallbackName);

  // Check if already imported (idempotent)
  const existing = await db
    .selectFrom('standard')
    .where('identifier', '=', meta.identifier)
    .select(['id', 'name'])
    .executeTakeFirst();

  if (existing) {
    return {
      id: existing.id,
      identifier: meta.identifier,
      name: existing.name,
      requirementCount: 0,
      levelCount: 0,
      skipped: true,
    };
  }

  const standardId = uuidv4();

  // Create the standard record
  await db
    .insertInto('standard')
    .values({
      id: standardId,
      identifier: meta.identifier,
      name: meta.name,
      description: meta.description,
      owner: meta.owner,
      version: meta.version,
      license_id: null,
      state: 'published',
      is_imported: markAsImported,
      source_json: sourceJson || null,
    })
    .execute();

  // Import requirements and levels
  const { count: requirementCount, map: requirementMap } = await importRequirements(db, standard, standardId);
  const levelCount = await importLevels(db, standard, standardId, requirementMap);

  logger.info('Standard imported', {
    standardId,
    identifier: meta.identifier,
    name: meta.name,
    requirementCount,
    levelCount,
  });

  return {
    id: standardId,
    identifier: meta.identifier,
    name: meta.name,
    requirementCount,
    levelCount,
    skipped: false,
  };
}
