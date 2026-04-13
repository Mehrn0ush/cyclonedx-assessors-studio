/**
 * Resource Checking Utilities
 *
 * Shared utilities for common resource validation patterns in route handlers.
 * Reduces duplication of existence checks, 404 handling, and ownership verification.
 */

import type { Response } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * Generic resource existence check.
 * Returns the resource if found, sends 404 and returns null if not.
 *
 * Usage:
 *   const assessment = await checkResourceExists(db, res, 'assessment', assessmentId);
 *   if (!assessment) return;
 */
export async function checkResourceExists(
  db: Kysely<Database>,
  res: Response,
  table: string,
  id: string,
  resourceName?: string,
): Promise<any | null> {
  const resource = await (db
    .selectFrom(table as any)
    .where('id' as any, '=', id)
    .selectAll() as any)
    .executeTakeFirst();

  if (!resource) {
    const name = resourceName || table;
    res.status(404).json({ error: `${name} not found` });
    return null;
  }

  return resource;
}

/**
 * Ownership check for owned resources (dashboard, project, etc.).
 * Returns true if the user owns the resource, sends 404/403 and returns false if not.
 *
 * Usage:
 *   const isOwner = await checkResourceOwnership(db, res, 'dashboard', dashboardId, userId);
 *   if (!isOwner) return;
 */
export async function checkResourceOwnership(
  db: Kysely<Database>,
  res: Response,
  table: string,
  id: string,
  userId: string,
): Promise<boolean> {
  const resource = await checkResourceExists(db, res, table, id);
  if (!resource) return false;

  const ownerField = 'owner_id';
  if ((resource as Record<string, unknown>)[ownerField] !== userId) {
    res.status(403).json({
      error: 'You do not have permission to access this resource',
    });
    return false;
  }

  return true;
}

/**
 * Check that a resource and a related parent resource exist.
 * Useful for nested routes like /assessments/:id/requirements/:reqId
 *
 * Usage:
 *   const [assessment, requirement] = await checkNestedResourceExists(
 *     db, res, 'assessment', assessmentId, 'assessment_requirement', reqId
 *   );
 *   if (!assessment || !requirement) return;
 */
export async function checkNestedResourceExists(
  db: Kysely<Database>,
  res: Response,
  parentTable: string,
  parentId: string,
  childTable: string,
  childId: string,
): Promise<[any | null, any | null]> {
  const parent = await checkResourceExists(db, res, parentTable, parentId);
  if (!parent) return [null, null];

  const child = await checkResourceExists(db, res, childTable, childId);
  if (!child) return [parent, null];

  return [parent, child];
}

/**
 * Check if a resource can be modified (not in read-only state).
 * Common read-only states: 'complete', 'archived', 'closed', 'cancelled'.
 *
 * Usage:
 *   const canModify = await checkResourceMutable(
 *     db, res, 'assessment', assessmentId,
 *     ['complete', 'archived']
 *   );
 *   if (!canModify) return;
 */
export async function checkResourceMutable(
  db: Kysely<Database>,
  res: Response,
  table: string,
  id: string,
  readOnlyStates: string[] = ['complete', 'archived', 'closed'],
): Promise<boolean> {
  const resource = await checkResourceExists(db, res, table, id);
  if (!resource) return false;

  const state = (resource as Record<string, unknown>).state as string | undefined;
  if (state && readOnlyStates.includes(state)) {
    res.status(403).json({
      error: `Cannot modify ${table} in ${state} state`,
    });
    return false;
  }

  return true;
}

/**
 * Check that a referenced entity exists (foreign key validation).
 * Does NOT send a response - returns true/false for use in custom validation.
 *
 * Usage:
 *   const projectExists = await checkForeignKeyExists(db, 'project', projectId);
 *   if (!projectExists) {
 *     res.status(400).json({ error: 'Project does not exist' });
 *     return;
 *   }
 */
export async function checkForeignKeyExists(
  db: Kysely<Database>,
  table: string,
  id: string,
): Promise<boolean> {
  const resource = await (db
    .selectFrom(table as any)
    .where('id' as any, '=', id)
    .select('id' as any) as any)
    .executeTakeFirst();

  return !!resource;
}

/**
 * Check multiple foreign keys at once.
 * Returns an object with which keys exist.
 *
 * Usage:
 *   const fks = await checkForeignKeysExist(db, {
 *     project: projectId,
 *     assessment: assessmentId
 *   });
 *   if (!fks.project) throw new Error('Project not found');
 */
export async function checkForeignKeysExist(
  db: Kysely<Database>,
  fks: Record<string, string>,
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  await Promise.all(
    Object.entries(fks).map(async ([table, id]) => {
      results[table] = await checkForeignKeyExists(db, table, id);
    })
  );

  return results;
}
