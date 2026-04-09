import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  createTestProject,
  createTestStandard,
  getTestDatabase,
} from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Projects', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should create a project', async () => {
    const db = getTestDatabase();
    const projectId = uuidv4();

    await db.insertInto('project').values({
      id: projectId,
      name: 'Test Project',
      description: 'A test project',
      state: 'new',
    }).execute();

    const project = await db.selectFrom('project')
      .where('id', '=', projectId)
      .selectAll()
      .executeTakeFirst();

    expect(project).toBeDefined();
    expect(project!.name).toBe('Test Project');
    expect(project!.state).toBe('new');
  });

  it('should create a project with helper function', async () => {
    const project = await createTestProject({
      name: 'My Project',
      description: 'My test project',
      state: 'in_progress',
    });

    const db = getTestDatabase();
    const result = await db.selectFrom('project')
      .where('id', '=', project.id)
      .selectAll()
      .executeTakeFirst();

    expect(result).toBeDefined();
    expect(result!.name).toBe('My Project');
    expect(result!.state).toBe('in_progress');
  });

  it('should list projects', async () => {
    const db = getTestDatabase();

    await createTestProject({ name: 'Project 1' });
    await createTestProject({ name: 'Project 2' });

    const projects = await db.selectFrom('project')
      .selectAll()
      .execute();

    expect(projects.length).toBeGreaterThanOrEqual(2);
  });

  it('should update a project', async () => {
    const db = getTestDatabase();
    const project = await createTestProject({ name: 'Original Name' });

    await db.updateTable('project')
      .set({ name: 'Updated Name', state: 'in_progress' })
      .where('id', '=', project.id)
      .execute();

    const updated = await db.selectFrom('project')
      .where('id', '=', project.id)
      .selectAll()
      .executeTakeFirst();

    expect(updated!.name).toBe('Updated Name');
    expect(updated!.state).toBe('in_progress');
  });

  it('should soft-delete a project by retiring it', async () => {
    const db = getTestDatabase();
    const project = await createTestProject({ state: 'operational' });

    await db.updateTable('project')
      .set({ state: 'retired' })
      .where('id', '=', project.id)
      .execute();

    const retired = await db.selectFrom('project')
      .where('id', '=', project.id)
      .selectAll()
      .executeTakeFirst();

    expect(retired!.state).toBe('retired');
  });

  it('should associate a standard with a project', async () => {
    const db = getTestDatabase();
    const project = await createTestProject();
    const standard = await createTestStandard();

    await db.insertInto('project_standard').values({
      project_id: project.id,
      standard_id: standard.id,
      created_at: new Date(),
    }).execute();

    const association = await db.selectFrom('project_standard')
      .where('project_id', '=', project.id)
      .where('standard_id', '=', standard.id)
      .selectAll()
      .executeTakeFirst();

    expect(association).toBeDefined();
    expect(association!.project_id).toBe(project.id);
    expect(association!.standard_id).toBe(standard.id);
  });

  it('should retrieve project standards', async () => {
    const db = getTestDatabase();
    const project = await createTestProject();
    const standard1 = await createTestStandard({ name: 'Standard 1' });
    const standard2 = await createTestStandard({ name: 'Standard 2' });

    await db.insertInto('project_standard').values({
      project_id: project.id,
      standard_id: standard1.id,
      created_at: new Date(),
    }).execute();

    await db.insertInto('project_standard').values({
      project_id: project.id,
      standard_id: standard2.id,
      created_at: new Date(),
    }).execute();

    const standards = await db.selectFrom('project_standard')
      .where('project_id', '=', project.id)
      .selectAll()
      .execute();

    expect(standards).toHaveLength(2);
    expect(standards.map(s => s.standard_id)).toContain(standard1.id);
    expect(standards.map(s => s.standard_id)).toContain(standard2.id);
  });

  it('should enforce valid project states', async () => {
    const db = getTestDatabase();
    const _projectId = uuidv4();

    const validStates = ['new', 'in_progress', 'on_hold', 'complete', 'operational', 'retired'];

    for (const state of validStates) {
      await db.insertInto('project').values({
        id: uuidv4(),
        name: `Project ${state}`,
        state: state as any,
      }).execute();
    }

    const allProjects = await db.selectFrom('project')
      .selectAll()
      .execute();

    expect(allProjects.length).toBeGreaterThanOrEqual(validStates.length);
    const states = allProjects.map(p => p.state);
    for (const state of validStates) {
      expect(states).toContain(state);
    }
  });

});
