import { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Resolve an array of tag name strings into tag IDs, creating any that
 * do not already exist. Names are forced to lowercase and trimmed.
 */
export async function resolveTagIds(db: Kysely<Database>, tagNames: string[]): Promise<string[]> {
  const tagIds: string[] = [];
  for (const raw of tagNames) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;

    let tag = await db.selectFrom('tag').where('name', '=', name).selectAll().executeTakeFirst();
    if (!tag) {
      const tagId = uuidv4();
      const color = tagNameToHex(name);
      await db.insertInto('tag').values({
        id: tagId,
        name,
        color,
        created_at: new Date(),
      }).execute();
      tagIds.push(tagId);
    } else {
      tagIds.push(tag.id);
    }
  }
  return tagIds;
}

/**
 * Sync tags for a given entity. Deletes old associations and inserts new ones.
 */
export async function syncEntityTags(
  db: Kysely<Database>,
  junctionTable: string,
  entityColumn: string,
  entityId: string,
  tagNames: string[]
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.deleteFrom(junctionTable as any) as any).where(entityColumn, '=', entityId).execute();

  if (tagNames.length > 0) {
    const tagIds = await resolveTagIds(db, tagNames);
    if (tagIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db
        .insertInto(junctionTable as any) as any)
        .values(
          tagIds.map(tagId => ({
            [entityColumn]: entityId,
            tag_id: tagId,
            created_at: new Date(),
          }))
        )
        .execute();
    }
  }
}

/**
 * Fetch tags for a set of entity IDs from a junction table.
 * Returns a map of entityId -> tag name array.
 */
export async function fetchTagsForEntities(
  db: Kysely<Database>,
  junctionTable: string,
  entityColumn: string,
  entityIds: string[]
): Promise<Record<string, { name: string; color: string }[]>> {
  if (entityIds.length === 0) return {};

  const rows = await (db
    .selectFrom(junctionTable as any) as any)
    .innerJoin('tag', (join: any) => join.onRef('tag.id', '=', `${junctionTable}.tag_id`))
    .where(`${junctionTable}.${entityColumn}`, 'in', entityIds)
    .selectAll()
    .execute();

  const result: Record<string, { name: string; color: string }[]> = {};
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    // eslint-disable-next-line security/detect-object-injection
    const eid = record[entityColumn] as string;
    // eslint-disable-next-line security/detect-object-injection
    if (!result[eid]) result[eid] = [];
    // eslint-disable-next-line security/detect-object-injection
    result[eid].push({ name: record.name as string, color: record.color as string });
  }
  return result;
}

/** Deterministic color from tag name */
function tagNameToHex(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 50, 35);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
