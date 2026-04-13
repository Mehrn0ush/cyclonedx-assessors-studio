/**
 * Shared project query helper functions.
 * Extracted from projects.ts to reduce duplication.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * Fetch standards for a project by ID.
 */
export async function fetchProjectStandards(
  db: Kysely<Database>,
  projectId: string
): Promise<{ id: string; name: string; version: string | null; description: string | null }[]> {
  return db
    .selectFrom('project_standard')
    .innerJoin('standard', (join) =>
      join.onRef('standard.id', '=', 'project_standard.standard_id')
    )
    .where('project_standard.project_id', '=', projectId)
    .select([
      'standard.id as id',
      'standard.name as name',
      'standard.version as version',
      'standard.description as description',
    ])
    .execute() as Promise<{
    id: string;
    name: string;
    version: string | null;
    description: string | null;
  }[]>;
}

/**
 * Fetch standards for multiple projects in a single query.
 * Returns a map of project_id -> standards array.
 */
export async function fetchStandardsByProjects(
  db: Kysely<Database>,
  projectIds: string[]
): Promise<Record<string, { id: string; name: string; version: string | null }[]>> {
  if (projectIds.length === 0) return {};

  const projectStandards = (await db
    .selectFrom('project_standard')
    .innerJoin('standard', (join) =>
      join.onRef('standard.id', '=', 'project_standard.standard_id')
    )
    .where('project_standard.project_id', 'in', projectIds)
    .select([
      'project_standard.project_id as project_id',
      'standard.id as id',
      'standard.name as name',
      'standard.version as version',
    ])
    .execute()) as {
    project_id: string;
    id: string;
    name: string;
    version: string | null;
  }[];

  const standardsByProject: Record<string, { id: string; name: string; version: string | null }[]> = {};
  for (const ps of projectStandards) {
    if (!standardsByProject[ps.project_id]) standardsByProject[ps.project_id] = [];
    standardsByProject[ps.project_id].push({ id: ps.id, name: ps.name, version: ps.version });
  }

  return standardsByProject;
}

/**
 * Sync project standards for a project.
 * Deletes old standards and inserts new ones.
 */
export async function syncProjectStandards(
  db: Kysely<Database>,
  projectId: string,
  standardIds: string[]
): Promise<void> {
  await db
    .deleteFrom('project_standard')
    .where('project_id', '=', projectId)
    .execute();

  if (standardIds.length > 0) {
    await db
      .insertInto('project_standard')
      .values(
        standardIds.map((standardId) => ({
          project_id: projectId,
          standard_id: standardId,
          created_at: new Date(),
        }))
      )
      .execute();
  }
}
