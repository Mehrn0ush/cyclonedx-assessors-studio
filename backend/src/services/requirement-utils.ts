/**
 * Centralized utilities for requirement hierarchy operations.
 *
 * Every feature that works with parent/child requirement trees (import,
 * duplicate, tree building) should use these helpers so that
 * topological ordering and natural sorting live in a single place.
 */

/**
 * Natural alpha-numeric comparator.
 * e.g. "AM1.2" < "AM3.5" < "AM10.1"
 */
export function compareIdentifiers(a: string, b: string): number {
  return (a || '').localeCompare(b || '', undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Given a flat array of requirement rows (each having an `id` and optional
 * `parent_id`), return them in topological order so that every parent
 * appears before its children.  Within each sibling group the items are
 * sorted alphabetically by identifier (natural sort).
 *
 * Requirements whose declared parent is not in the array are treated as
 * roots (orphan fallback).
 */
export function topologicalSort<
  T extends { id: string; parent_id?: string | null; identifier?: string },
>(rows: T[]): T[] {
  // Group children by parent_id
  const childrenOf = new Map<string | null, T[]>();

  for (const row of rows) {
    const parentKey = row.parent_id ?? null;
    if (!childrenOf.has(parentKey)) {
      childrenOf.set(parentKey, []);
    }
    childrenOf.get(parentKey)!.push(row);
  }

  // Sort each sibling group by identifier
  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => compareIdentifiers(a.identifier ?? '', b.identifier ?? ''));
  }

  // Walk from roots down
  const result: T[] = [];
  const visited = new Set<string>();

  const visit = (parentId: string | null) => {
    const children = childrenOf.get(parentId) || [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      result.push(child);
      visit(child.id);
    }
  };

  // Start with null-parent roots
  visit(null);

  // Orphan fallback: if a row points to a parent not in the set, it
  // was never visited.  Append those at the end with null parent_id.
  for (const row of rows) {
    if (!visited.has(row.id)) {
      visited.add(row.id);
      result.push(row);
      visit(row.id);
    }
  }

  return result;
}

/**
 * Build a nested tree from a flat array of requirement rows.
 * Children at each level are sorted alphabetically by identifier.
 */
export interface RequirementTreeNode {
  id: string;
  identifier: string;
  name: string;
  parent_id: string | null;
  description: string | null;
  open_cre: string | null;
  children: RequirementTreeNode[];
}

export function buildRequirementTree(
  requirements: Array<{
    id: string;
    identifier: string;
    name: string;
    parent_id?: string | null;
    description?: string | null;
    open_cre?: string | null;
    standard_id: string;
    created_at: Date;
    updated_at: Date;
  }>,
): RequirementTreeNode[] {
  const childrenMap = new Map<string | null, Array<(typeof requirements)[number]>>();

  for (const req of requirements) {
    const parentKey = req.parent_id ?? null;
    if (!childrenMap.has(parentKey)) {
      childrenMap.set(parentKey, []);
    }
    childrenMap.get(parentKey)!.push(req);
  }

  // Sort each sibling group by identifier
  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => compareIdentifiers(a.identifier, b.identifier));
  }

  function buildNode(parentId: string | null): RequirementTreeNode[] {
    const children = childrenMap.get(parentId) || [];
    return children.map((child) => ({
      id: child.id,
      identifier: child.identifier,
      name: child.name,
      parent_id: child.parent_id || null,
      description: child.description || null,
      open_cre: child.open_cre || null,
      children: buildNode(child.id),
    }));
  }

  return buildNode(null);
}
