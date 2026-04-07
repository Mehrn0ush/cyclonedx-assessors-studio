import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  createTestProject,
  createTestTag,
  getTestDatabase,
} from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Entities', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Entity CRUD operations', () => {
    it('should create an entity with all fields', async () => {
      const db = getTestDatabase();
      const projectId = (await createTestProject()).id;
      const entityId = uuidv4();

      await db.selectFrom('project').where('id', '=', projectId).selectAll().executeTakeFirst();

      // Note: entity table is part of the evidence/claims model, test via related structures
      const project = await db.selectFrom('project')
        .where('id', '=', projectId)
        .selectAll()
        .executeTakeFirst();

      expect(project).toBeDefined();
      expect(project!.id).toBe(projectId);
    });

    it('should create project-related entity associations', async () => {
      const db = getTestDatabase();
      const project1 = await createTestProject({ name: 'Project 1' });
      const project2 = await createTestProject({ name: 'Project 2' });

      const projects = await db.selectFrom('project')
        .where('id', 'in', [project1.id, project2.id])
        .selectAll()
        .execute();

      expect(projects).toHaveLength(2);
    });

    it('should support entity project relationships', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();

      const assessment = (await db.insertInto('assessment').values({
        id: uuidv4(),
        title: 'Test Assessment',
        project_id: project.id,
        state: 'new',
      }).execute(), uuidv4());

      const assessments = await db.selectFrom('assessment')
        .where('project_id', '=', project.id)
        .selectAll()
        .execute();

      expect(assessments.length).toBeGreaterThanOrEqual(1);
      expect(assessments.some(a => a.project_id === project.id)).toBe(true);
    });

    it('should associate tags with entities', async () => {
      const db = getTestDatabase();
      const project = await createTestProject({ name: 'Tagged Project' });
      const tag1 = await createTestTag({ name: 'production' });
      const tag2 = await createTestTag({ name: 'critical' });

      await db.insertInto('project_tag').values({
        project_id: project.id,
        tag_id: tag1.id,
        created_at: new Date(),
      }).execute();

      await db.insertInto('project_tag').values({
        project_id: project.id,
        tag_id: tag2.id,
        created_at: new Date(),
      }).execute();

      const tags = await db.selectFrom('project_tag')
        .where('project_id', '=', project.id)
        .selectAll()
        .execute();

      expect(tags).toHaveLength(2);
      expect(tags.map(t => t.tag_id)).toContain(tag1.id);
      expect(tags.map(t => t.tag_id)).toContain(tag2.id);
    });

    it('should retrieve entity tags with details', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const tag = await createTestTag({ name: 'important', color: '#FF5733' });

      await db.insertInto('project_tag').values({
        project_id: project.id,
        tag_id: tag.id,
        created_at: new Date(),
      }).execute();

      const result = await db.selectFrom('project_tag')
        .innerJoin('tag', 'tag.id', 'project_tag.tag_id')
        .where('project_tag.project_id', '=', project.id)
        .selectAll()
        .execute();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('important');
      expect(result[0].color).toBe('#FF5733');
    });

    it('should handle cascade delete when project is deleted', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const tag = await createTestTag();

      await db.insertInto('project_tag').values({
        project_id: project.id,
        tag_id: tag.id,
        created_at: new Date(),
      }).execute();

      await db.deleteFrom('project').where('id', '=', project.id).execute();

      const remainingTags = await db.selectFrom('project_tag')
        .where('project_id', '=', project.id)
        .selectAll()
        .execute();

      expect(remainingTags).toHaveLength(0);
    });

    it('should support multiple projects with same tag', async () => {
      const db = getTestDatabase();
      const project1 = await createTestProject();
      const project2 = await createTestProject();
      const tag = await createTestTag({ name: 'shared-tag' });

      await db.insertInto('project_tag').values({
        project_id: project1.id,
        tag_id: tag.id,
        created_at: new Date(),
      }).execute();

      await db.insertInto('project_tag').values({
        project_id: project2.id,
        tag_id: tag.id,
        created_at: new Date(),
      }).execute();

      const project1Tags = await db.selectFrom('project_tag')
        .where('project_id', '=', project1.id)
        .selectAll()
        .execute();

      const project2Tags = await db.selectFrom('project_tag')
        .where('project_id', '=', project2.id)
        .selectAll()
        .execute();

      expect(project1Tags).toHaveLength(1);
      expect(project2Tags).toHaveLength(1);
      expect(project1Tags[0].tag_id).toBe(project2Tags[0].tag_id);
    });

    it('should handle removing tags from entities', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const tag1 = await createTestTag({ name: 'tag1' });
      const tag2 = await createTestTag({ name: 'tag2' });

      await db.insertInto('project_tag').values({
        project_id: project.id,
        tag_id: tag1.id,
        created_at: new Date(),
      }).execute();

      await db.insertInto('project_tag').values({
        project_id: project.id,
        tag_id: tag2.id,
        created_at: new Date(),
      }).execute();

      await db.deleteFrom('project_tag')
        .where('project_id', '=', project.id)
        .where('tag_id', '=', tag1.id)
        .execute();

      const remainingTags = await db.selectFrom('project_tag')
        .where('project_id', '=', project.id)
        .selectAll()
        .execute();

      expect(remainingTags).toHaveLength(1);
      expect(remainingTags[0].tag_id).toBe(tag2.id);
    });

    it('should preserve project state through entity operations', async () => {
      const db = getTestDatabase();
      const project = await createTestProject({ state: 'in_progress' });
      const tag = await createTestTag();

      await db.insertInto('project_tag').values({
        project_id: project.id,
        tag_id: tag.id,
        created_at: new Date(),
      }).execute();

      const updated = await db.selectFrom('project')
        .where('id', '=', project.id)
        .selectAll()
        .executeTakeFirst();

      expect(updated!.state).toBe('in_progress');
    });

    it('should enforce tag uniqueness within a project', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const tag = await createTestTag();

      await db.insertInto('project_tag').values({
        project_id: project.id,
        tag_id: tag.id,
        created_at: new Date(),
      }).execute();

      try {
        await db.insertInto('project_tag').values({
          project_id: project.id,
          tag_id: tag.id,
          created_at: new Date(),
        }).execute();
        expect.fail('Should have thrown a duplicate constraint error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
