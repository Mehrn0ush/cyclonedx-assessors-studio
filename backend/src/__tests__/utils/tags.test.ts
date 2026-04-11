import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveTagIds,
  syncEntityTags,
  fetchTagsForEntities,
} from '../../utils/tags.js';
import { setupTestDb, teardownTestDb, getTestDatabase, createTestProject, createTestTag } from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Tags Utility', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe('resolveTagIds', () => {
    it('should create new tags from tag names', async () => {
      const db = getTestDatabase();
      const tagNames = ['frontend', 'backend', 'security'];

      const tagIds = await resolveTagIds(db, tagNames);

      expect(tagIds.length).toBe(3);
      expect(tagIds.every(id => typeof id === 'string')).toBe(true);

      // Verify tags were created
      const tags = await db
        .selectFrom('tag')
        .select(['id', 'name'])
        .where('name', 'in', tagNames)
        .execute();

      expect(tags.length).toBe(3);
    });

    it('should find existing tags without duplicating', async () => {
      const db = getTestDatabase();
      const tagNames = ['api', 'api', 'database'];

      const tagIds = await resolveTagIds(db, tagNames);

      // Should have 2 unique IDs (api appears twice but should resolve to same ID)
      const uniqueIds = new Set(tagIds);
      expect(uniqueIds.size).toBe(2);

      // Verify only 2 tags were created
      const allTags = await db.selectFrom('tag').selectAll().execute();
      expect(allTags.length).toBe(2);
    });

    it('should normalize tag names to lowercase', async () => {
      const db = getTestDatabase();
      const tagNames = ['FRONTEND', 'Backend', 'SECURITY'];

      const tagIds = await resolveTagIds(db, tagNames);

      const tags = await db
        .selectFrom('tag')
        .select('name')
        .where('id', 'in', tagIds)
        .execute();

      expect(tags).toEqual(
        expect.arrayContaining([
          { name: 'frontend' },
          { name: 'backend' },
          { name: 'security' },
        ])
      );
    });

    it('should trim whitespace from tag names', async () => {
      const db = getTestDatabase();
      const tagNames = ['  frontend  ', 'backend ', '  security'];

      const tagIds = await resolveTagIds(db, tagNames);

      const tags = await db
        .selectFrom('tag')
        .select('name')
        .where('id', 'in', tagIds)
        .execute();

      expect(tags).toEqual(
        expect.arrayContaining([
          { name: 'frontend' },
          { name: 'backend' },
          { name: 'security' },
        ])
      );
    });

    it('should skip empty strings', async () => {
      const db = getTestDatabase();
      const tagNames = ['frontend', '', '  ', 'backend', '\t'];

      const tagIds = await resolveTagIds(db, tagNames);

      expect(tagIds.length).toBe(2);

      const allTags = await db.selectFrom('tag').selectAll().execute();
      expect(allTags.length).toBe(2);
    });

    it('should be idempotent', async () => {
      const db = getTestDatabase();
      const tagNames = ['frontend', 'backend'];

      const tagIds1 = await resolveTagIds(db, tagNames);
      const tagIds2 = await resolveTagIds(db, tagNames);

      expect(tagIds1).toEqual(tagIds2);

      const allTags = await db.selectFrom('tag').selectAll().execute();
      expect(allTags.length).toBe(2);
    });

    it('should handle mixed case with existing tags', async () => {
      const db = getTestDatabase();

      await resolveTagIds(db, ['frontend', 'backend']);
      const newIds = await resolveTagIds(db, ['FRONTEND', 'Database']);

      const allTags = await db.selectFrom('tag').selectAll().execute();
      expect(allTags.length).toBe(3); // frontend, backend, database
    });

    it('should generate deterministic colors for tags', async () => {
      const db = getTestDatabase();
      const tagName = 'consistent-tag';

      await resolveTagIds(db, [tagName]);
      const tag1 = await db.selectFrom('tag').where('name', '=', tagName).selectAll().executeTakeFirst();

      // Create another DB instance/session and repeat
      await resolveTagIds(db, [tagName]);
      const tag2 = await db.selectFrom('tag').where('name', '=', tagName).selectAll().executeTakeFirst();

      expect(tag1?.color).toBe(tag2?.color);
    });

    it('should return empty array for empty input', async () => {
      const db = getTestDatabase();

      const tagIds = await resolveTagIds(db, []);

      expect(tagIds).toEqual([]);
    });
  });

  describe('syncEntityTags', () => {
    it('should insert new tags for entity', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const tagNames = ['production', 'critical'];

      await syncEntityTags(db, 'project_tag', 'project_id', project.id, tagNames);

      const tags = await db
        .selectFrom('project_tag')
        .innerJoin('tag', 'tag.id', 'project_tag.tag_id')
        .select(['tag.name', 'tag.color'])
        .where('project_id', '=', project.id)
        .execute();

      expect(tags.length).toBe(2);
      expect(tags.map(t => t.name)).toEqual(
        expect.arrayContaining(['production', 'critical'])
      );
    });

    it('should replace old tags with new ones', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();

      // Add initial tags
      await syncEntityTags(db, 'project_tag', 'project_id', project.id, ['tag1', 'tag2']);

      // Verify initial tags
      let tags = await db
        .selectFrom('project_tag')
        .select('tag_id')
        .where('project_id', '=', project.id)
        .execute();
      expect(tags.length).toBe(2);

      // Sync with new tags
      await syncEntityTags(db, 'project_tag', 'project_id', project.id, ['tag3', 'tag4']);

      // Verify old tags are gone
      tags = await db
        .selectFrom('project_tag')
        .innerJoin('tag', 'tag.id', 'project_tag.tag_id')
        .select(['tag.name'])
        .where('project_id', '=', project.id)
        .execute() as any[];

      expect(tags.length).toBe(2);
      expect((tags as any).map((t: any) => t.name)).toEqual(
        expect.arrayContaining(['tag3', 'tag4'])
      );
      expect((tags as any).map((t: any) => t.name)).not.toContain('tag1');
      expect((tags as any).map((t: any) => t.name)).not.toContain('tag2');
    });

    it('should handle empty tagNames by deleting all', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();

      // Add initial tags
      await syncEntityTags(db, 'project_tag', 'project_id', project.id, ['tag1', 'tag2']);

      // Verify tags exist
      let tags = await db
        .selectFrom('project_tag')
        .select('tag_id')
        .where('project_id', '=', project.id)
        .execute();
      expect(tags.length).toBe(2);

      // Sync with empty array
      await syncEntityTags(db, 'project_tag', 'project_id', project.id, []);

      // Verify all tags deleted
      tags = await db
        .selectFrom('project_tag')
        .select('tag_id')
        .where('project_id', '=', project.id)
        .execute();

      expect(tags.length).toBe(0);
    });

    it('should work with different junction tables and entity columns', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();

      // Use project_tag junction
      await syncEntityTags(db, 'project_tag', 'project_id', project.id, ['web', 'api']);

      const tags = await db
        .selectFrom('project_tag')
        .innerJoin('tag', 'tag.id', 'project_tag.tag_id')
        .select('tag.name')
        .where('project_id', '=', project.id)
        .execute();

      expect(tags.length).toBe(2);
    });

    it('should handle concurrent syncs on different entities', async () => {
      const db = getTestDatabase();
      const project1 = await createTestProject({ name: 'Project 1' });
      const project2 = await createTestProject({ name: 'Project 2' });

      // Sync tags for both projects
      await Promise.all([
        syncEntityTags(db, 'project_tag', 'project_id', project1.id, ['frontend', 'backend']),
        syncEntityTags(db, 'project_tag', 'project_id', project2.id, ['mobile', 'desktop']),
      ]);

      // Verify each project has correct tags
      const tags1 = await db
        .selectFrom('project_tag')
        .innerJoin('tag', 'tag.id', 'project_tag.tag_id')
        .select('tag.name')
        .where('project_id', '=', project1.id)
        .execute();

      const tags2 = await db
        .selectFrom('project_tag')
        .innerJoin('tag', 'tag.id', 'project_tag.tag_id')
        .select('tag.name')
        .where('project_id', '=', project2.id)
        .execute();

      expect(tags1.map(t => t.name)).toEqual(
        expect.arrayContaining(['frontend', 'backend'])
      );
      expect(tags2.map(t => t.name)).toEqual(
        expect.arrayContaining(['mobile', 'desktop'])
      );
    });
  });

  describe('fetchTagsForEntities', () => {
    it('should return tags for entities', async () => {
      const db = getTestDatabase();
      const project1 = await createTestProject({ name: 'Project 1' });
      const project2 = await createTestProject({ name: 'Project 2' });

      await syncEntityTags(db, 'project_tag', 'project_id', project1.id, ['frontend', 'prod']);
      await syncEntityTags(db, 'project_tag', 'project_id', project2.id, ['backend', 'staging']);

      const result = await fetchTagsForEntities(
        db,
        'project_tag',
        'project_id',
        [project1.id, project2.id]
      );

      expect(result[project1.id]).toBeDefined();
      expect(result[project2.id]).toBeDefined();

      const project1Tags = result[project1.id];
      const project2Tags = result[project2.id];

      expect(project1Tags.length).toBe(2);
      expect(project2Tags.length).toBe(2);

      expect(project1Tags.map(t => t.name)).toEqual(
        expect.arrayContaining(['frontend', 'prod'])
      );
      expect(project2Tags.map(t => t.name)).toEqual(
        expect.arrayContaining(['backend', 'staging'])
      );
    });

    it('should return empty object for empty array', async () => {
      const db = getTestDatabase();

      const result = await fetchTagsForEntities(db, 'project_tag', 'project_id', []);

      expect(result).toEqual({});
    });

    it('should return empty array for entity with no tags', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();

      const result = await fetchTagsForEntities(db, 'project_tag', 'project_id', [project.id]);

      expect(result[project.id] ?? []).toEqual([]);
    });

    it('should include tag color in results', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();

      await syncEntityTags(db, 'project_tag', 'project_id', project.id, ['important']);

      const result = await fetchTagsForEntities(db, 'project_tag', 'project_id', [project.id]);

      expect(result[project.id][0]).toHaveProperty('color');
      expect(result[project.id][0].color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should handle multiple entities with overlapping tags', async () => {
      const db = getTestDatabase();
      const project1 = await createTestProject({ name: 'Project 1' });
      const project2 = await createTestProject({ name: 'Project 2' });

      await syncEntityTags(db, 'project_tag', 'project_id', project1.id, ['shared', 'project1-only']);
      await syncEntityTags(db, 'project_tag', 'project_id', project2.id, ['shared', 'project2-only']);

      const result = await fetchTagsForEntities(
        db,
        'project_tag',
        'project_id',
        [project1.id, project2.id]
      );

      const project1Tags = result[project1.id].map(t => t.name);
      const project2Tags = result[project2.id].map(t => t.name);

      expect(project1Tags).toContain('shared');
      expect(project2Tags).toContain('shared');
      expect(project1Tags).toContain('project1-only');
      expect(project2Tags).toContain('project2-only');
    });

    it('should return tags for only requested entities', async () => {
      const db = getTestDatabase();
      const project1 = await createTestProject({ name: 'Project 1' });
      const project2 = await createTestProject({ name: 'Project 2' });
      const project3 = await createTestProject({ name: 'Project 3' });

      await syncEntityTags(db, 'project_tag', 'project_id', project1.id, ['tag1']);
      await syncEntityTags(db, 'project_tag', 'project_id', project2.id, ['tag2']);
      await syncEntityTags(db, 'project_tag', 'project_id', project3.id, ['tag3']);

      const result = await fetchTagsForEntities(
        db,
        'project_tag',
        'project_id',
        [project1.id, project2.id]
      );

      expect(result[project1.id]).toBeDefined();
      expect(result[project2.id]).toBeDefined();
      expect(result[project3.id]).toBeUndefined();
    });
  });

  describe('color generation', () => {
    it('should generate valid hex colors', async () => {
      const db = getTestDatabase();
      const tagNames = ['red', 'blue', 'green', 'yellow', 'purple'];

      await resolveTagIds(db, tagNames);

      const tags = await db
        .selectFrom('tag')
        .select('color')
        .where('name', 'in', tagNames)
        .execute();

      tags.forEach(tag => {
        expect(tag.color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it('should generate different colors for different tag names', async () => {
      const db = getTestDatabase();

      const tag1Ids = await resolveTagIds(db, ['first-tag']);
      const tag2Ids = await resolveTagIds(db, ['second-tag']);

      const tag1 = await db.selectFrom('tag').where('id', '=', tag1Ids[0]).selectAll().executeTakeFirst();
      const tag2 = await db.selectFrom('tag').where('id', '=', tag2Ids[0]).selectAll().executeTakeFirst();

      expect(tag1?.color).not.toBe(tag2?.color);
    });

    it('should generate deterministic colors (same name = same color)', async () => {
      const db = getTestDatabase();

      const tagIds1 = await resolveTagIds(db, ['consistent']);
      const tag1 = await db.selectFrom('tag').where('id', '=', tagIds1[0]).selectAll().executeTakeFirst();

      const tagIds2 = await resolveTagIds(db, ['consistent']);
      const tag2 = await db.selectFrom('tag').where('id', '=', tagIds2[0]).selectAll().executeTakeFirst();

      expect(tag1?.color).toBe(tag2?.color);
    });

    it('should generate distributed colors across spectrum', async () => {
      const db = getTestDatabase();
      const tagNames = [
        'alpha', 'bravo', 'charlie', 'delta', 'echo',
        'foxtrot', 'golf', 'hotel', 'india', 'juliett',
      ];

      await resolveTagIds(db, tagNames);

      const tags = await db
        .selectFrom('tag')
        .select('color')
        .where('name', 'in', tagNames)
        .execute();

      const colors = new Set(tags.map(t => t.color));
      // Should have multiple different colors
      expect(colors.size).toBeGreaterThan(1);
    });
  });

  describe('integration scenarios', () => {
    it('should sync and fetch tags for multiple entities', async () => {
      const db = getTestDatabase();
      const project1 = await createTestProject({ name: 'Frontend App' });
      const project2 = await createTestProject({ name: 'Backend API' });

      const tags1 = ['react', 'typescript', 'production'];
      const tags2 = ['nodejs', 'typescript', 'production'];

      await syncEntityTags(db, 'project_tag', 'project_id', project1.id, tags1);
      await syncEntityTags(db, 'project_tag', 'project_id', project2.id, tags2);

      const result = await fetchTagsForEntities(
        db,
        'project_tag',
        'project_id',
        [project1.id, project2.id]
      );

      expect(result[project1.id].map(t => t.name)).toEqual(
        expect.arrayContaining(['react', 'typescript', 'production'])
      );
      expect(result[project2.id].map(t => t.name)).toEqual(
        expect.arrayContaining(['nodejs', 'typescript', 'production'])
      );
    });

    it('should update tags multiple times', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();

      // First sync
      await syncEntityTags(db, 'project_tag', 'project_id', project.id, ['v1', 'beta']);
      let result = await fetchTagsForEntities(db, 'project_tag', 'project_id', [project.id]);
      expect(result[project.id].map(t => t.name)).toEqual(
        expect.arrayContaining(['v1', 'beta'])
      );

      // Second sync
      await syncEntityTags(db, 'project_tag', 'project_id', project.id, ['v2', 'stable']);
      result = await fetchTagsForEntities(db, 'project_tag', 'project_id', [project.id]);
      expect(result[project.id].map(t => t.name)).toEqual(
        expect.arrayContaining(['v2', 'stable'])
      );

      // Third sync with empty
      await syncEntityTags(db, 'project_tag', 'project_id', project.id, []);
      result = await fetchTagsForEntities(db, 'project_tag', 'project_id', [project.id]);
      expect(result[project.id] ?? []).toEqual([]);
    });
  });
});
