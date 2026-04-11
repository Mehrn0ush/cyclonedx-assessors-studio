import { describe, it, expect } from 'vitest';
import {
  setupHttpTests,
  loginAs,
  getAgent,
} from '../helpers/http.js';

describe('Projects HTTP Routes', () => {
  setupHttpTests();

  /**
   * Helper to create test data: standard(s) needed for project creation.
   * Returns { standardId, standardIds }
   */
  let testDataCounter = 0;
  async function createTestData(agent: any, standardCount: number = 1) {
    testDataCounter++;
    const suffix = testDataCounter;
    const standardIds: string[] = [];

    for (let i = 0; i < standardCount; i++) {
      const standardRes = await agent
        .post('/api/v1/standards')
        .send({
          identifier: `PRJ-STD-${suffix}-${i}-${Date.now()}`,
          name: `Test Standard ${suffix}-${i}`,
          version: '1.0',
        });
      expect(standardRes.status).toBe(201);
      standardIds.push(standardRes.body.id);
    }

    return { standardIds, standardId: standardIds[0] };
  }

  describe('POST /api/v1/projects', () => {
    it('should create a project with minimal required fields', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);
      const projectName = `Test Project ${Date.now()}`;

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: projectName,
          standardIds,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(projectName);
      expect(res.body.state).toBe('new'); // default state
    });

    it('should create a project with all optional fields', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: `Full Project ${Date.now()}`,
          description: 'Test project with all fields',
          state: 'in_progress',
          standardIds,
          tags: ['tag1', 'tag2'],
          startDate: '2026-01-01',
          dueDate: '2026-12-31',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toContain('Full Project');
      expect(res.body.description).toBe('Test project with all fields');
      expect(res.body.state).toBe('in_progress');
    });

    it('should support multiple standards in a project', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent, 3);

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: `Multi-Standard Project ${Date.now()}`,
          standardIds,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();

      // Verify standards were linked by fetching the project
      const getRes = await agent.get(`/api/v1/projects/${res.body.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.standards.length).toBe(3);
    });

    it('should accept and store tags', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: `Tagged Project ${Date.now()}`,
          standardIds,
          tags: ['security', 'compliance', 'audit'],
        });

      expect(res.status).toBe(201);

      // Verify tags are returned when fetching the project
      const getRes = await agent.get(`/api/v1/projects/${res.body.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.tags.map((t: any) => t.name)).toEqual(expect.arrayContaining(['security', 'compliance', 'audit']));
    });

    it('should accept all valid state values', async () => {
      const agent = await loginAs('admin');
      const states = ['new', 'in_progress', 'on_hold', 'complete', 'operational', 'retired'];

      for (const state of states) {
        const { standardIds } = await createTestData(agent);
        const res = await agent
          .post('/api/v1/projects')
          .send({
            name: `Project ${state} ${Date.now()}`,
            standardIds,
            state,
          });

        expect(res.status).toBe(201);
        expect(res.body.state).toBe(state);
      }
    });

    it('should return 400 for missing project name', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/projects')
        .send({
          standardIds,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for empty project name', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: '',
          standardIds,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for missing standardIds', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: 'Project without standards',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for empty standardIds array', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: 'Project without standards',
          standardIds: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for invalid state value', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: 'Invalid state project',
          standardIds,
          state: 'invalid_state',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should require projects.create permission', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      // Assessee should not have projects.create permission
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post('/api/v1/projects')
        .send({
          name: 'Unauthorized project',
          standardIds,
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/projects')
        .send({
          name: 'Unauthorized project',
          standardIds: ['00000000-0000-0000-0000-000000000000'],
        });

      expect(res.status).toBe(401);
    });

    it('should support null values for startDate and dueDate', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: `Null dates project ${Date.now()}`,
          standardIds,
          startDate: null,
          dueDate: null,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('should use camelCase in response', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/projects')
        .send({
          name: `CamelCase project ${Date.now()}`,
          standardIds,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).not.toHaveProperty('standard_ids');
    });
  });

  describe('GET /api/v1/projects', () => {
    it('should list all projects with pagination', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      // Create a few projects
      await agent.post('/api/v1/projects').send({
        name: `List Test 1 ${Date.now()}`,
        standardIds,
      });
      await agent.post('/api/v1/projects').send({
        name: `List Test 2 ${Date.now()}`,
        standardIds,
      });

      const res = await agent.get('/api/v1/projects?limit=10&offset=0');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('offset');
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.offset).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/projects?limit=5&offset=0');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });

    it('should respect offset parameter', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/projects?limit=10&offset=5');

      expect(res.status).toBe(200);
      expect(res.body.pagination.offset).toBe(5);
    });

    it('should filter by state parameter', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      // Create projects with different states
      await agent.post('/api/v1/projects').send({
        name: `In Progress ${Date.now()}`,
        standardIds,
        state: 'in_progress',
      });

      const res = await agent.get('/api/v1/projects?state=in_progress&limit=50');

      expect(res.status).toBe(200);
      const inProgressProjects = res.body.data.filter((p: any) => p.state === 'in_progress');
      expect(inProgressProjects.length).toBeGreaterThan(0);
      inProgressProjects.forEach((p: any) => {
        expect(p.state).toBe('in_progress');
      });
    });

    it('should include standards and tags in list response', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `With Standards ${Date.now()}`,
        standardIds,
        tags: ['important', 'review'],
      });

      const listRes = await agent.get('/api/v1/projects?limit=50');

      expect(listRes.status).toBe(200);
      const created = listRes.body.data.find((p: any) => p.id === createRes.body.id);
      expect(created).toBeDefined();
      expect(created.standards).toBeDefined();
      expect(Array.isArray(created.standards)).toBe(true);
      expect(created.tags).toBeDefined();
      expect(Array.isArray(created.tags)).toBe(true);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();
      const res = await unauthAgent.get('/api/v1/projects');

      expect(res.status).toBe(401);
    });

    it('should use camelCase in response', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/projects?limit=10');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const project = res.body.data[0];
        expect(project).toHaveProperty('state');
        expect(project).toHaveProperty('standards');
        expect(project).toHaveProperty('tags');
        expect(project).not.toHaveProperty('start_date');
      }
    });
  });

  describe('GET /api/v1/projects/:id', () => {
    it('should retrieve a project by ID', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Get Test ${Date.now()}`,
        description: 'Test get project',
        standardIds,
        tags: ['test-tag'],
      });

      const projectId = createRes.body.id;
      const getRes = await agent.get(`/api/v1/projects/${projectId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body).toHaveProperty('project');
      expect(getRes.body).toHaveProperty('standards');
      expect(getRes.body).toHaveProperty('tags');
      expect(getRes.body.project.id).toBe(projectId);
      expect(getRes.body.project.name).toContain('Get Test');
      expect(getRes.body.project.description).toBe('Test get project');
    });

    it('should include all standards linked to the project', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent, 3);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Multi Standards ${Date.now()}`,
        standardIds,
      });

      const getRes = await agent.get(`/api/v1/projects/${createRes.body.id}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.standards.length).toBe(3);
      getRes.body.standards.forEach((std: any) => {
        expect(std).toHaveProperty('id');
        expect(std).toHaveProperty('name');
        expect(std).toHaveProperty('version');
        expect(std).toHaveProperty('description');
      });
    });

    it('should include tags in the response', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Tagged ${Date.now()}`,
        standardIds,
        tags: ['security', 'critical'],
      });

      const getRes = await agent.get(`/api/v1/projects/${createRes.body.id}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.tags.map((t: any) => t.name)).toEqual(expect.arrayContaining(['security', 'critical']));
    });

    it('should return 404 for non-existent project', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/projects/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/projects/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });

    it('should use camelCase in response', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `CamelCase Get ${Date.now()}`,
        standardIds,
      });

      const getRes = await agent.get(`/api/v1/projects/${createRes.body.id}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body).not.toHaveProperty('standard_ids');
      expect(getRes.body.project).not.toHaveProperty('start_date');
    });
  });

  describe('PUT /api/v1/projects/:id', () => {
    it('should update project name', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Original Name ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        name: 'Updated Name',
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('Updated Name');
    });

    it('should update project description', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Update Desc ${Date.now()}`,
        description: 'Original description',
        standardIds,
      });

      const projectId = createRes.body.id;
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        description: 'Updated description',
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.description).toBe('Updated description');
    });

    it('should update project state', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `State Change ${Date.now()}`,
        standardIds,
        state: 'new',
      });

      const projectId = createRes.body.id;
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        state: 'in_progress',
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.state).toBe('in_progress');
    });

    it('should update dates', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Update Dates ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        startDate: '2026-03-01',
        dueDate: '2026-09-01',
      });

      expect(updateRes.status).toBe(200);
      // Dates are returned in ISO format, check they start with the input date
      expect(updateRes.body.startDate).toContain('2026-03-01');
      expect(updateRes.body.dueDate).toContain('2026-09-01');
    });

    it('should update standards linked to project', async () => {
      const agent = await loginAs('admin');
      const { standardIds: original } = await createTestData(agent, 1);
      const { standardIds: newStds } = await createTestData(agent, 2);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Update Standards ${Date.now()}`,
        standardIds: original,
      });

      const projectId = createRes.body.id;

      // Verify original standards
      let getRes = await agent.get(`/api/v1/projects/${projectId}`);
      expect(getRes.body.standards.length).toBe(1);

      // Update to different standards
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        standardIds: newStds,
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.standards.length).toBe(2);

      // Verify persisted
      getRes = await agent.get(`/api/v1/projects/${projectId}`);
      expect(getRes.body.standards.length).toBe(2);
    });

    it('should update tags', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Update Tags ${Date.now()}`,
        standardIds,
        tags: ['old-tag'],
      });

      const projectId = createRes.body.id;
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        tags: ['new-tag', 'another-tag'],
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.tags.map((t: any) => t.name)).toEqual(expect.arrayContaining(['new-tag', 'another-tag']));
    });

    it('should support partial updates', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Original ${Date.now()}`,
        description: 'Original description',
        standardIds,
      });

      const projectId = createRes.body.id;

      // Update only name
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        name: 'Updated name',
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('Updated name');
      expect(updateRes.body.description).toBe('Original description'); // unchanged
    });

    it('should return 404 for non-existent project', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .put('/api/v1/projects/00000000-0000-0000-0000-000000000000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should return 400 for invalid state', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Invalid State ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        state: 'invalid_state',
      });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error).toBe('Invalid input');
    });

    it('should return 400 for empty standardIds array when updating', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Update Standards ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;
      const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({
        standardIds: [],
      });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error).toBe('Invalid input');
    });

    it('should require projects.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      const createRes = await adminAgent.post('/api/v1/projects').send({
        name: `Perm Test ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      // Assessee should not have projects.edit permission
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.put(`/api/v1/projects/${projectId}`).send({
        name: 'Unauthorized update',
      });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .put('/api/v1/projects/00000000-0000-0000-0000-000000000000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(401);
    });

    it('should use camelCase in response', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `CamelCase Update ${Date.now()}`,
        standardIds,
      });

      const updateRes = await agent.put(`/api/v1/projects/${createRes.body.id}`).send({
        name: 'Updated',
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body).not.toHaveProperty('standard_ids');
      expect(updateRes.body).toHaveProperty('standards');
    });
  });

  describe('DELETE /api/v1/projects/:id', () => {
    it('should mark project as retired (soft delete)', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Delete Test ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      // Verify it exists
      let getRes = await agent.get(`/api/v1/projects/${projectId}`);
      expect(getRes.status).toBe(200);

      // Delete it
      const deleteRes = await agent.delete(`/api/v1/projects/${projectId}`);
      expect(deleteRes.status).toBe(204);

      // Verify it's retired
      getRes = await agent.get(`/api/v1/projects/${projectId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.project.state).toBe('retired');
    });

    it('should be idempotent - deleting non-existent returns 204', async () => {
      const agent = await loginAs('admin');

      const res = await agent.delete('/api/v1/projects/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(204);
    });

    it('should be idempotent - deleting already retired returns 204', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Idempotent Delete ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      // First delete
      let deleteRes = await agent.delete(`/api/v1/projects/${projectId}`);
      expect(deleteRes.status).toBe(204);

      // Second delete (should also be 204)
      deleteRes = await agent.delete(`/api/v1/projects/${projectId}`);
      expect(deleteRes.status).toBe(204);
    });

    it('should require projects.delete permission', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      const createRes = await adminAgent.post('/api/v1/projects').send({
        name: `Delete Perm ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      // Assessee should not have projects.delete permission
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.delete(`/api/v1/projects/${projectId}`);

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.delete('/api/v1/projects/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/projects/:id/archive', () => {
    it('should archive a project and set archived_at timestamp', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Archive Test ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const archiveRes = await agent.post(`/api/v1/projects/${projectId}/archive`).send({});

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body).toHaveProperty('message');
      expect(archiveRes.body.message).toContain('archived');

      // Verify state is retired and timestamp is set
      const getRes = await agent.get(`/api/v1/projects/${projectId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.project.state).toBe('retired');
      expect(getRes.body.project.archivedAt).toBeDefined();
    });

    it('should return 404 for non-existent project', async () => {
      const agent = await loginAs('admin');

      const res = await agent.post('/api/v1/projects/00000000-0000-0000-0000-000000000000/archive').send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should require projects.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      const createRes = await adminAgent.post('/api/v1/projects').send({
        name: `Archive Perm ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      // Assessee should not have projects.edit permission
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.post(`/api/v1/projects/${projectId}/archive`).send({});

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000000/archive')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/projects/:id/export/summary', () => {
    it('should return project summary data for export', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Export Test ${Date.now()}`,
        description: 'Project for export',
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/export/summary`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('project');
      expect(res.body).toHaveProperty('standards');
      expect(res.body).toHaveProperty('assessments');
      expect(res.body).toHaveProperty('evidence');
      expect(res.body).toHaveProperty('claims');
      expect(res.body).toHaveProperty('attestations');
      expect(res.body).toHaveProperty('summary');

      expect(res.body.project.id).toBe(projectId);
      expect(res.body.project.name).toContain('Export Test');

      expect(Array.isArray(res.body.standards)).toBe(true);
      expect(res.body.standards.length).toBe(standardIds.length);

      expect(res.body.assessments).toHaveProperty('total');
      expect(res.body.assessments).toHaveProperty('complete');
      expect(res.body.assessments).toHaveProperty('inProgress');

      expect(res.body.summary).toHaveProperty('conformanceRate');
      expect(res.body.summary).toHaveProperty('generatedAt');
    });

    it('should return 404 for non-existent project', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/projects/00000000-0000-0000-0000-000000000000/export/summary');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should include evidence and claims counts', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Summary Counts ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/export/summary`);

      expect(res.status).toBe(200);
      expect(res.body.evidence).toHaveProperty('total');
      expect(res.body.claims).toHaveProperty('total');
      expect(res.body.attestations).toHaveProperty('total');
      expect(typeof res.body.evidence.total).toBe('number');
      expect(typeof res.body.claims.total).toBe('number');
      expect(typeof res.body.attestations.total).toBe('number');
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/projects/00000000-0000-0000-0000-000000000000/export/summary');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/projects/:id/stats', () => {
    it('should return project statistics', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Stats Test ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('assessmentCompletion');
      expect(res.body).toHaveProperty('timeline');
      expect(res.body).toHaveProperty('evidenceCoverage');
      expect(res.body).toHaveProperty('conformance');
      expect(res.body).toHaveProperty('warnings');
      expect(res.body).toHaveProperty('assessmentBreakdown');
    });

    it('should include assessment completion metrics', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Completion Stats ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.assessmentCompletion).toHaveProperty('total');
      expect(res.body.assessmentCompletion).toHaveProperty('completed');
      expect(res.body.assessmentCompletion).toHaveProperty('inProgress');
      expect(res.body.assessmentCompletion).toHaveProperty('percent');
    });

    it('should include timeline information', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Timeline Stats ${Date.now()}`,
        standardIds,
        startDate: '2026-01-01',
        dueDate: '2026-12-31',
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.timeline).toHaveProperty('projectStartDate');
      expect(res.body.timeline).toHaveProperty('projectDueDate');
      expect(res.body.timeline).toHaveProperty('overdue');
      expect(res.body.timeline).toHaveProperty('upcomingDueDates');
      expect(Array.isArray(res.body.timeline.upcomingDueDates)).toBe(true);
    });

    it('should include evidence coverage metrics', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Evidence Stats ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.evidenceCoverage).toHaveProperty('totalRequirements');
      expect(res.body.evidenceCoverage).toHaveProperty('requirementsWithEvidence');
      expect(res.body.evidenceCoverage).toHaveProperty('totalEvidenceItems');
      expect(res.body.evidenceCoverage).toHaveProperty('percent');
    });

    it('should include conformance metrics', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Conformance Stats ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/stats`);

      expect(res.status).toBe(200);
      expect(res.body.conformance).toHaveProperty('averageScore');
      expect(res.body.conformance).toHaveProperty('assessments');
      expect(Array.isArray(res.body.conformance.assessments)).toBe(true);
    });

    it('should include warnings array', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Warnings Stats ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/stats`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.warnings)).toBe(true);
      res.body.warnings.forEach((warning: any) => {
        expect(warning).toHaveProperty('type');
        expect(warning).toHaveProperty('severity');
        expect(warning).toHaveProperty('message');
      });
    });

    it('should include assessment breakdown', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `Breakdown Stats ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/stats`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.assessmentBreakdown)).toBe(true);
      res.body.assessmentBreakdown.forEach((assessment: any) => {
        expect(assessment).toHaveProperty('id');
        expect(assessment).toHaveProperty('title');
        expect(assessment).toHaveProperty('state');
      });
    });

    it('should return 404 for non-existent project', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/projects/00000000-0000-0000-0000-000000000000/stats');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/projects/00000000-0000-0000-0000-000000000000/stats');

      expect(res.status).toBe(401);
    });

    it('should use camelCase in response', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const createRes = await agent.post('/api/v1/projects').send({
        name: `CamelCase Stats ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const res = await agent.get(`/api/v1/projects/${projectId}/stats`);

      expect(res.status).toBe(200);
      // Check camelCase properties
      expect(res.body).toHaveProperty('assessmentCompletion');
      expect(res.body).not.toHaveProperty('assessment_completion');
      expect(res.body).toHaveProperty('evidenceCoverage');
      expect(res.body).not.toHaveProperty('evidence_coverage');
    });
  });

  describe('Edge cases and role-based access', () => {
    it('should allow assessor to list projects', async () => {
      const assessorAgent = await loginAs('assessor');

      const res = await assessorAgent.get('/api/v1/projects?limit=10');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('should allow assessor to view project details', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      const createRes = await adminAgent.post('/api/v1/projects').send({
        name: `Assessor View ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.get(`/api/v1/projects/${projectId}`);

      expect(res.status).toBe(200);
      expect(res.body.project.id).toBe(projectId);
    });

    it('should reject assessee from creating projects', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.post('/api/v1/projects').send({
        name: 'Assessee Project',
        standardIds,
      });

      expect(res.status).toBe(403);
    });

    it('should reject assessee from editing projects', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      const createRes = await adminAgent.post('/api/v1/projects').send({
        name: `Edit Perm ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.put(`/api/v1/projects/${projectId}`).send({
        name: 'Edited',
      });

      expect(res.status).toBe(403);
    });

    it('should reject assessee from deleting projects', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      const createRes = await adminAgent.post('/api/v1/projects').send({
        name: `Delete Perm ${Date.now()}`,
        standardIds,
      });

      const projectId = createRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.delete(`/api/v1/projects/${projectId}`);

      expect(res.status).toBe(403);
    });

    it('should not allow assessor to create projects', async () => {
      const adminAgent = await loginAs('admin');
      const { standardIds } = await createTestData(adminAgent);

      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.post('/api/v1/projects').send({
        name: `Assessor Create ${Date.now()}`,
        standardIds,
      });

      // Assessor does not have projects.create permission
      expect(res.status).toBe(403);
    });

    it('should handle unicode and special characters in project names', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent.post('/api/v1/projects').send({
        name: '项目 Project Проект 🚀',
        standardIds,
      });

      expect(res.status).toBe(201);

      const getRes = await agent.get(`/api/v1/projects/${res.body.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.project.name).toBe('项目 Project Проект 🚀');
    });

    it('should handle empty description and tags', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const res = await agent.post('/api/v1/projects').send({
        name: `Minimal ${Date.now()}`,
        standardIds,
        description: '',
        tags: [],
      });

      expect(res.status).toBe(201);

      const getRes = await agent.get(`/api/v1/projects/${res.body.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.tags).toEqual([]);
    });

    it('should preserve state transitions', async () => {
      const agent = await loginAs('admin');
      const { standardIds } = await createTestData(agent);

      const states = ['new', 'in_progress', 'on_hold', 'complete', 'operational'];

      const createRes = await agent.post('/api/v1/projects').send({
        name: `State Transitions ${Date.now()}`,
        standardIds,
        state: 'new',
      });

      let projectId = createRes.body.id;

      for (const state of states) {
        const updateRes = await agent.put(`/api/v1/projects/${projectId}`).send({ state });
        expect(updateRes.status).toBe(200);
        expect(updateRes.body.state).toBe(state);
      }
    });
  });
});
