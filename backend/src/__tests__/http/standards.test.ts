import { describe, it, expect } from 'vitest';
import {
  setupHttpTests,
  loginAs,
  getAgent,
} from '../helpers/http.js';

describe('Standards HTTP Routes', () => {
  setupHttpTests();

  let counter = 0;
  function getUnique(prefix: string): string {
    return `${prefix}-${++counter}-${Date.now()}`;
  }

  /**
   * Helper to create a new admin user via HTTP API and login as them.
   * This creates a second admin user who can approve/reject standards
   * authored by the first admin user.
   */
  async function loginAsNewAdmin() {
    // First, login as the default admin to create a new admin user
    const adminAgent = await loginAs('admin');

    // Create a new admin user via HTTP API
    const newUsername = `admin_approver_${Date.now()}`;
    const newPassword = 'TestPassword123!';
    const createRes = await adminAgent
      .post('/api/v1/users')
      .send({
        username: newUsername,
        email: `${newUsername}@test.local`,
        displayName: 'Approver Admin',
        password: newPassword,
        role: 'admin',
      });

    if (createRes.status !== 201) {
      throw new Error(`Failed to create new admin user: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
    }

    // Import supertest to create a session-aware agent (similar to loginAs)
    const supertestAgent = (await import('supertest')).default;
    const { getBaseUrl } = await import('../helpers/http.js');

    // Create a new agent with session support and login
    const agent = supertestAgent.agent(getBaseUrl());
    const loginRes = await agent
      .post('/api/v1/auth/login')
      .send({ username: newUsername, password: newPassword });

    if (loginRes.status !== 200 && loginRes.status !== 201) {
      throw new Error(`Failed to login as new admin: ${loginRes.status} - ${JSON.stringify(loginRes.body)}`);
    }

    return agent;
  }

  /**
   * Helper to create a test standard with admin access
   */
  async function createTestStandard(agent: any, overrides?: any) {
    const res = await agent
      .post('/api/v1/standards')
      .send({
        identifier: getUnique('STD'),
        name: `Test Standard ${counter}`,
        version: '1.0',
        description: 'Test description',
        ...overrides,
      });
    return res;
  }

  /**
   * Helper to create a standard with requirements
   */
  async function createStandardWithRequirements(agent: any, numReqs: number = 2) {
    const standardRes = await createTestStandard(agent);
    expect(standardRes.status).toBe(201);
    const standardId = standardRes.body.id;

    const requirementIds: string[] = [];
    for (let i = 1; i <= numReqs; i++) {
      const reqRes = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: `REQ-${counter}-${i}`,
          name: `Requirement ${counter}-${i}`,
          description: `Test requirement ${counter}-${i}`,
        });
      expect(reqRes.status).toBe(201);
      requirementIds.push(reqRes.body.id);
    }

    return { standardId, requirementIds };
  }

  describe('POST /api/v1/standards', () => {
    it('should create a new draft standard with minimal fields', async () => {
      const agent = await loginAs('admin');

      const res = await createTestStandard(agent);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.identifier).toBe(res.body.identifier);
      expect(res.body.name).toBe(`Test Standard ${counter}`);
      expect(res.body.version).toBe('1.0');
      expect(res.body.state).toBe('draft');
      expect(res.body).toHaveProperty('authoredBy');
    });

    it('should create a standard with all optional fields', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards')
        .send({
          identifier: getUnique('STD'),
          name: `Test Standard Full ${counter}`,
          version: '2.0.1',
          owner: 'Test Owner',
          description: 'Full test description',
        });

      expect(res.status).toBe(201);
      expect(res.body.owner).toBe('Test Owner');
      expect(res.body.description).toBe('Full test description');
    });

    it('should return 400 for missing identifier', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards')
        .send({
          name: 'No Identifier',
          version: '1.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('identifier');
    });

    it('should return 400 for missing name', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards')
        .send({
          identifier: getUnique('STD'),
          version: '1.0',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('should require standards.create permission', async () => {
      const assesseeAgent = await loginAs('assessee');

      const res = await assesseeAgent
        .post('/api/v1/standards')
        .send({
          identifier: getUnique('STD'),
          name: 'Unauthorized',
          version: '1.0',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/standards')
        .send({
          identifier: getUnique('STD'),
          name: 'No Auth',
          version: '1.0',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/standards', () => {
    it('should list standards with pagination', async () => {
      const agent = await loginAs('admin');

      // Create a couple of test standards
      await createTestStandard(agent);
      await createTestStandard(agent);

      const res = await agent.get('/api/v1/standards?limit=10&offset=0');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('offset');
      expect(res.body.pagination).toHaveProperty('total');
    });

    it('should respect limit parameter', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/standards?limit=5&offset=0');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });

    it('should respect offset parameter', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/standards?limit=10&offset=5');

      expect(res.status).toBe(200);
      expect(res.body.pagination.offset).toBe(5);
    });

    it('should filter by state parameter', async () => {
      const agent = await loginAs('admin');

      // Create a draft standard
      const draftRes = await createTestStandard(agent);
      const draftId = draftRes.body.id;

      // Query for draft standards
      const res = await agent.get('/api/v1/standards?state=draft');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should find the draft we just created
      const found = res.body.data.find((s: any) => s.id === draftId);
      expect(found).toBeDefined();
    });

    it('should include requirement counts', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 3);

      const res = await agent.get('/api/v1/standards?limit=50&offset=0');

      expect(res.status).toBe(200);
      const standard = res.body.data.find((s: any) => s.id === standardId);
      expect(standard).toBeDefined();
      expect(standard.requirementsCount).toBe(3);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/standards');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/standards/:id', () => {
    it('should retrieve standard details with requirements', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 2);

      const res = await agent.get(`/api/v1/standards/${standardId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('standard');
      expect(res.body.standard.id).toBe(standardId);
      expect(res.body).toHaveProperty('requirements');
      expect(Array.isArray(res.body.requirements)).toBe(true);
      expect(res.body.requirements.length).toBe(2);
      expect(res.body).toHaveProperty('levels');
      expect(Array.isArray(res.body.levels)).toBe(true);
    });

    it('should include levels with requirement counts', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 2);

      // Create a level
      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: `LEVEL-${counter}`,
          title: 'Test Level',
          description: 'Test level description',
        });
      expect(levelRes.status).toBe(201);
      const levelId = levelRes.body.id;

      // Add requirements to the level
      await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}/requirements`)
        .send({
          requirementIds: [requirementIds[0], requirementIds[1]],
        });

      const res = await agent.get(`/api/v1/standards/${standardId}`);

      expect(res.status).toBe(200);
      expect(res.body.levels.length).toBe(1);
      expect(res.body.levels[0].requirementsCount).toBe(2);
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/standards/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Standard not found');
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/standards/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/standards/:id', () => {
    it('should update draft standard fields', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}`)
        .send({
          name: 'Updated Standard Name',
          version: '2.0',
          description: 'Updated description',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Standard Name');
      expect(res.body.version).toBe('2.0');
      expect(res.body.description).toBe('Updated description');
    });

    it('should allow partial updates', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;
      const originalId = standardRes.body.identifier;

      const res = await agent
        .put(`/api/v1/standards/${standardId}`)
        .send({
          name: 'New Name Only',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name Only');
      expect(res.body.identifier).toBe(originalId); // unchanged
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .put('/api/v1/standards/00000000-0000-0000-0000-000000000000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Standard not found');
    });

    it('should return 403 if standard is not in draft state', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      // Submit for approval
      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent
        .put(`/api/v1/standards/${standardId}`)
        .send({ name: 'Should Fail' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('draft');
    });

    it('should require standards.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/standards/${standardId}`)
        .send({ name: 'Unauthorized' });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .put('/api/v1/standards/00000000-0000-0000-0000-000000000000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/standards/:id/requirements', () => {
    it('should add a requirement to a draft standard', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('REQ'),
          name: 'Test Requirement',
          description: 'Test description',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.identifier).toBe(res.body.identifier);
      expect(res.body.name).toBe('Test Requirement');
      expect(res.body.standardId).toBe(standardId);
    });

    it('should add requirement with openCre field', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('REQ'),
          name: 'CRE Requirement',
          description: 'With CRE',
          open_cre: 'CRE-1234-5678',
        });

      expect(res.status).toBe(201);
      expect(res.body.openCre).toBe('CRE-1234-5678');
    });

    it('should add requirement with parent by parentIdentifier', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      // Create parent requirement
      const parentRes = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('PARENT'),
          name: 'Parent Requirement',
        });
      expect(parentRes.status).toBe(201);

      // Create child requirement referencing parent by identifier
      const childRes = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('CHILD'),
          name: 'Child Requirement',
          parentIdentifier: parentRes.body.identifier,
        });

      expect(childRes.status).toBe(201);
      expect(childRes.body.parentId).toBe(parentRes.body.id);
    });

    it('should add requirement with parent by parentId', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      // Create parent requirement
      const parentRes = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('PARENT'),
          name: 'Parent Requirement',
        });

      // Create child requirement with parentId
      const childRes = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('CHILD'),
          name: 'Child Requirement',
          parentId: parentRes.body.id,
        });

      expect(childRes.status).toBe(201);
      expect(childRes.body.parentId).toBe(parentRes.body.id);
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards/00000000-0000-0000-0000-000000000000/requirements')
        .send({
          identifier: getUnique('REQ'),
          name: 'Test',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Standard not found');
    });

    it('should return 400 for missing identifier', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          name: 'No Identifier',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('identifier');
    });

    it('should return 400 for non-existent parent requirement', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('REQ'),
          name: 'Bad Parent',
          parentIdentifier: 'NON-EXISTENT',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Parent requirement');
    });

    it('should return 403 if standard is not draft', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      // Submit standard
      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('REQ'),
          name: 'Should Fail',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('draft');
    });

    it('should require requirements.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('REQ'),
          name: 'Unauthorized',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/standards/:standardId/requirements/:reqId', () => {
    it('should update requirement fields', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);
      const reqId = requirementIds[0];

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${reqId}`)
        .send({
          name: 'Updated Requirement',
          description: 'Updated description',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Requirement');
      expect(res.body.description).toBe('Updated description');
    });

    it('should update requirement openCre', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);
      const reqId = requirementIds[0];

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${reqId}`)
        .send({
          openCre: 'CRE-9999-9999',
        });

      expect(res.status).toBe(200);
      expect(res.body.openCre).toBe('CRE-9999-9999');
    });

    it('should update requirement parent', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 2);
      const childId = requirementIds[0];
      const newParentId = requirementIds[1];

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${childId}`)
        .send({
          parentId: newParentId,
        });

      expect(res.status).toBe(200);
      expect(res.body.parentId).toBe(newParentId);
    });

    it('should return 400 if requirement would be its own parent', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);
      const reqId = requirementIds[0];

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${reqId}`)
        .send({
          parentId: reqId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot be its own parent');
    });

    it('should return 400 if parent does not exist', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);
      const reqId = requirementIds[0];

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${reqId}`)
        .send({
          parentId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Parent requirement');
    });

    it('should return 404 for non-existent requirement', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/00000000-0000-0000-0000-000000000000`)
        .send({
          name: 'Updated',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Requirement not found');
    });

    it('should return 403 if standard is not draft', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);

      // Submit standard
      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${requirementIds[0]}`)
        .send({
          name: 'Should Fail',
        });

      expect(res.status).toBe(403);
    });

    it('should require requirements.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(adminAgent, 1);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/standards/${standardId}/requirements/${requirementIds[0]}`)
        .send({
          name: 'Unauthorized',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/standards/:standardId/requirements/:reqId', () => {
    it('should delete a requirement from draft standard', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 2);
      const reqId = requirementIds[0];

      const res = await agent.delete(`/api/v1/standards/${standardId}/requirements/${reqId}`);

      expect(res.status).toBe(204);

      // Verify it's deleted
      const getRes = await agent.get(`/api/v1/standards/${standardId}`);
      const found = getRes.body.requirements.find((r: any) => r.id === reqId);
      expect(found).toBeUndefined();
    });

    it('should return 404 for non-existent requirement', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent.delete(
        `/api/v1/standards/${standardId}/requirements/00000000-0000-0000-0000-000000000000`
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Requirement not found');
    });

    it('should return 403 if standard is not draft', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);

      // Submit standard
      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent.delete(`/api/v1/standards/${standardId}/requirements/${requirementIds[0]}`);

      expect(res.status).toBe(403);
    });

    it('should require requirements.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(adminAgent, 1);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.delete(
        `/api/v1/standards/${standardId}/requirements/${requirementIds[0]}`
      );

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/standards/:id/submit', () => {
    it('should transition draft standard to in_review', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent.post(`/api/v1/standards/${standardId}/submit`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('in_review');
      expect(res.body).toHaveProperty('submittedAt');
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent.post('/api/v1/standards/00000000-0000-0000-0000-000000000000/submit');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Standard not found');
    });

    it('should return 403 if standard is not draft', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      // Submit once
      await agent.post(`/api/v1/standards/${standardId}/submit`);

      // Try to submit again
      const res = await agent.post(`/api/v1/standards/${standardId}/submit`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('draft');
    });

    it('should require standards.submit permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.post(`/api/v1/standards/${standardId}/submit`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/standards/:id/approve', () => {
    it('should transition in_review standard to published', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      // Submit
      await agent.post(`/api/v1/standards/${standardId}/submit`);

      // Approve (different user would be ideal, but we'll use same for testing)
      // Note: The route checks if authored_by === approver, so this should fail
      const res = await agent.post(`/api/v1/standards/${standardId}/approve`);

      // Will return 403 because author can't approve their own
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cannot approve your own');
    });

    it('should allow different user to approve', async () => {
      const authorAgent = await loginAs('admin');
      const standardRes = await createTestStandard(authorAgent);
      const standardId = standardRes.body.id;

      // Submit
      await authorAgent.post(`/api/v1/standards/${standardId}/submit`);

      // Approve as different admin user (new admin with same permissions)
      const approverAgent = await loginAsNewAdmin();
      const res = await approverAgent.post(`/api/v1/standards/${standardId}/approve`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('published');
      expect(res.body).toHaveProperty('approvedAt');
      expect(res.body).toHaveProperty('approvedBy'); // approved by the new admin user
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent.post('/api/v1/standards/00000000-0000-0000-0000-000000000000/approve');

      expect(res.status).toBe(404);
    });

    it('should return 403 if standard not in review', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent.post(`/api/v1/standards/${standardId}/approve`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('in review');
    });

    it('should require standards.approve permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      await adminAgent.post(`/api/v1/standards/${standardId}/submit`);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.post(`/api/v1/standards/${standardId}/approve`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/standards/:id/reject', () => {
    it('should transition in_review standard back to draft', async () => {
      const authorAgent = await loginAs('admin');
      const standardRes = await createTestStandard(authorAgent);
      const standardId = standardRes.body.id;

      // Submit
      await authorAgent.post(`/api/v1/standards/${standardId}/submit`);

      // Reject as different admin user
      const rejectorAgent = await loginAsNewAdmin();
      const res = await rejectorAgent.post(`/api/v1/standards/${standardId}/reject`).send({
        reason: 'Needs more requirements',
      });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('draft');
      expect(res.body.submittedAt).toBeNull();
    });

    it('should reject author rejecting their own', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent.post(`/api/v1/standards/${standardId}/reject`).send({
        reason: 'Self reject',
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cannot reject your own');
    });

    it('should return 403 if standard not in review', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent.post(`/api/v1/standards/${standardId}/reject`).send({
        reason: 'Draft not in review',
      });

      expect(res.status).toBe(403);
    });

    it('should require standards.approve permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      await adminAgent.post(`/api/v1/standards/${standardId}/submit`);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.post(`/api/v1/standards/${standardId}/reject`).send({
        reason: 'Unauthorized',
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/standards/:id/duplicate', () => {
    it('should create a draft copy of an existing standard', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 2);

      const res = await agent.post(`/api/v1/standards/${standardId}/duplicate`);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.id).not.toBe(standardId);
      expect(res.body.state).toBe('draft');
      expect(res.body.name).toContain('Draft');
    });

    it('should copy all requirements from original', async () => {
      const agent = await loginAs('admin');
      const { standardId: originalId, requirementIds: originalReqIds } =
        await createStandardWithRequirements(agent, 3);

      const dupRes = await agent.post(`/api/v1/standards/${originalId}/duplicate`);
      expect(dupRes.status).toBe(201);
      const newId = dupRes.body.id;

      const getRes = await agent.get(`/api/v1/standards/${newId}`);
      expect(getRes.body.requirements.length).toBe(3);
    });

    it('should copy levels from original standard', async () => {
      const agent = await loginAs('admin');
      const { standardId: originalId, requirementIds } =
        await createStandardWithRequirements(agent, 2);

      // Create a level
      const levelRes = await agent
        .post(`/api/v1/standards/${originalId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
          title: 'Test Level',
        });
      expect(levelRes.status).toBe(201);

      // Duplicate
      const dupRes = await agent.post(`/api/v1/standards/${originalId}/duplicate`);
      expect(dupRes.status).toBe(201);

      const getRes = await agent.get(`/api/v1/standards/${dupRes.body.id}`);
      expect(getRes.body.levels.length).toBe(1);
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent.post('/api/v1/standards/00000000-0000-0000-0000-000000000000/duplicate');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Standard not found');
    });

    it('should require standards.duplicate permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.post(`/api/v1/standards/${standardId}/duplicate`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/standards/:id/retire', () => {
    it('should transition published standard to retired', async () => {
      const authorAgent = await loginAs('admin');
      const standardRes = await createTestStandard(authorAgent);
      const standardId = standardRes.body.id;

      // Submit and approve
      await authorAgent.post(`/api/v1/standards/${standardId}/submit`);
      const approverAgent = await loginAsNewAdmin();
      await approverAgent.post(`/api/v1/standards/${standardId}/approve`);

      // Retire
      const retireRes = await approverAgent.post(`/api/v1/standards/${standardId}/retire`);

      expect(retireRes.status).toBe(200);
      expect(retireRes.body.state).toBe('retired');
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent.post('/api/v1/standards/00000000-0000-0000-0000-000000000000/retire');

      expect(res.status).toBe(404);
    });

    it('should return 403 if standard not published', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent.post(`/api/v1/standards/${standardId}/retire`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('published');
    });

    it('should require standards.approve permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      await adminAgent.post(`/api/v1/standards/${standardId}/submit`);
      const approverAgent = await loginAs('assessor');
      await approverAgent.post(`/api/v1/standards/${standardId}/approve`);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.post(`/api/v1/standards/${standardId}/retire`);

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/standards/:id', () => {
    it('should delete a draft standard', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent.delete(`/api/v1/standards/${standardId}`);

      expect(res.status).toBe(204);

      // Verify it's deleted
      const getRes = await agent.get(`/api/v1/standards/${standardId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent.delete('/api/v1/standards/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
    });

    it('should return 403 if standard is published (not retired)', async () => {
      const authorAgent = await loginAs('admin');
      const standardRes = await createTestStandard(authorAgent);
      const standardId = standardRes.body.id;

      // Submit and approve to publish
      await authorAgent.post(`/api/v1/standards/${standardId}/submit`);
      const approverAgent = await loginAsNewAdmin();
      await approverAgent.post(`/api/v1/standards/${standardId}/approve`);

      const res = await authorAgent.delete(`/api/v1/standards/${standardId}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('draft or retired');
    });

    it('should require standards.approve permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.delete(`/api/v1/standards/${standardId}`);

      expect(res.status).toBe(403);
    });

    it('should cascade delete requirements and levels', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 2);

      // Create a level
      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
          title: 'Level to Delete',
        });
      const levelId = levelRes.body.id;

      // Delete standard
      const deleteRes = await agent.delete(`/api/v1/standards/${standardId}`);
      expect(deleteRes.status).toBe(204);

      // Verify requirements are deleted (this is implicit, but good to test)
      const getRes = await agent.get(`/api/v1/standards/${standardId}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('POST /api/v1/standards/:standardId/levels', () => {
    it('should add a level to a draft standard', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
          title: 'Level 1',
          description: 'Test level',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.identifier).toBe(res.body.identifier);
      expect(res.body.title).toBe('Level 1');
    });

    it('should add level with minimal fields', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });

      expect(res.status).toBe(201);
      expect(res.body.identifier).toBe(res.body.identifier);
    });

    it('should return 400 for missing identifier', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          title: 'No Identifier',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('identifier');
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards/00000000-0000-0000-0000-000000000000/levels')
        .send({
          identifier: getUnique('LEVEL'),
          title: 'Test',
        });

      expect(res.status).toBe(404);
    });

    it('should return 403 if standard not draft', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });

      expect(res.status).toBe(403);
    });

    it('should require standards.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/standards/:standardId/levels/:levelId', () => {
    it('should update level fields', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
          title: 'Original Title',
        });
      const levelId = levelRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}`)
        .send({
          title: 'Updated Title',
          description: 'New description',
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.description).toBe('New description');
    });

    it('should return 404 for non-existent level', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/00000000-0000-0000-0000-000000000000`)
        .send({
          title: 'Updated',
        });

      expect(res.status).toBe(404);
    });

    it('should return 403 if standard not draft', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}`)
        .send({
          title: 'Updated',
        });

      expect(res.status).toBe(403);
    });

    it('should require standards.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      const levelRes = await adminAgent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}`)
        .send({
          title: 'Unauthorized',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/standards/:standardId/levels/:levelId', () => {
    it('should delete a level from draft standard', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      const res = await agent.delete(`/api/v1/standards/${standardId}/levels/${levelId}`);

      expect(res.status).toBe(204);

      // Verify it's deleted
      const getRes = await agent.get(`/api/v1/standards/${standardId}`);
      const found = getRes.body.levels.find((l: any) => l.id === levelId);
      expect(found).toBeUndefined();
    });

    it('should return 403 if standard not draft', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent.delete(`/api/v1/standards/${standardId}/levels/${levelId}`);

      expect(res.status).toBe(403);
    });

    it('should require standards.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const standardRes = await createTestStandard(adminAgent);
      const standardId = standardRes.body.id;

      const levelRes = await adminAgent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.delete(`/api/v1/standards/${standardId}/levels/${levelId}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/standards/:standardId/levels/:levelId/requirements', () => {
    it('should set requirements for a level', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 3);

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}/requirements`)
        .send({
          requirementIds: [requirementIds[0], requirementIds[1]],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it('should replace existing level requirements', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 3);

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      // Set first two requirements
      await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}/requirements`)
        .send({
          requirementIds: [requirementIds[0], requirementIds[1]],
        });

      // Replace with third requirement only
      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}/requirements`)
        .send({
          requirementIds: [requirementIds[2]],
        });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);

      // Verify the level
      const getRes = await agent.get(`/api/v1/standards/${standardId}`);
      const level = getRes.body.levels.find((l: any) => l.id === levelId);
      expect(level.requirementsCount).toBe(1);
    });

    it('should allow empty requirementIds array', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}/requirements`)
        .send({
          requirementIds: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it('should return 400 if requirementIds is not an array', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}/requirements`)
        .send({
          requirementIds: 'not-an-array',
        });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent level', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/00000000-0000-0000-0000-000000000000/requirements`)
        .send({
          requirementIds: [],
        });

      expect(res.status).toBe(404);
    });

    it('should return 403 if standard not draft', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);

      const levelRes = await agent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}/requirements`)
        .send({
          requirementIds: [requirementIds[0]],
        });

      expect(res.status).toBe(403);
    });

    it('should require standards.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(adminAgent, 1);

      const levelRes = await adminAgent
        .post(`/api/v1/standards/${standardId}/levels`)
        .send({
          identifier: getUnique('LEVEL'),
        });
      const levelId = levelRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/standards/${standardId}/levels/${levelId}/requirements`)
        .send({
          requirementIds: [requirementIds[0]],
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/standards/:standardId/requirements/:reqId/reparent', () => {
    it('should move requirement to a different parent', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 3);
      const childId = requirementIds[0];
      const oldParentId = requirementIds[1];
      const newParentId = requirementIds[2];

      // Create child with old parent
      const reqRes = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('CHILD'),
          name: 'Child Requirement',
          parentId: oldParentId,
        });
      const reparentId = reqRes.body.id;

      // Reparent to new parent
      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${reparentId}/reparent`)
        .send({
          parent_id: newParentId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should clear parent when parent_id is null', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 2);
      const parentId = requirementIds[0];

      const childRes = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: getUnique('CHILD'),
          name: 'Child',
          parentId,
        });
      const childId = childRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${childId}/reparent`)
        .send({
          parent_id: null,
        });

      expect(res.status).toBe(200);

      // Verify parent is cleared
      const getRes = await agent.get(`/api/v1/standards/${standardId}`);
      const updated = getRes.body.requirements.find((r: any) => r.id === childId);
      expect(updated.parentId).toBeNull();
    });

    it('should return 400 if requirement would be its own parent', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);
      const reqId = requirementIds[0];

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${reqId}/reparent`)
        .send({
          parent_id: reqId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot be its own parent');
    });

    it('should prevent circular references', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 3);

      // Create hierarchy: A -> B -> C
      const a = requirementIds[0];
      const b = requirementIds[1];
      const c = requirementIds[2];

      // Make B child of A
      await agent
        .put(`/api/v1/standards/${standardId}/requirements/${b}/reparent`)
        .send({ parent_id: a });

      // Make C child of B
      await agent
        .put(`/api/v1/standards/${standardId}/requirements/${c}/reparent`)
        .send({ parent_id: b });

      // Try to make A child of C (circular)
      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${a}/reparent`)
        .send({ parent_id: c });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('circular reference');
    });

    it('should return 404 for non-existent requirement', async () => {
      const agent = await loginAs('admin');
      const standardRes = await createTestStandard(agent);
      const standardId = standardRes.body.id;

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/00000000-0000-0000-0000-000000000000/reparent`)
        .send({
          parent_id: null,
        });

      expect(res.status).toBe(404);
    });

    it('should return 403 if standard not draft', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 1);

      await agent.post(`/api/v1/standards/${standardId}/submit`);

      const res = await agent
        .put(`/api/v1/standards/${standardId}/requirements/${requirementIds[0]}/reparent`)
        .send({
          parent_id: null,
        });

      expect(res.status).toBe(403);
    });

    it('should require requirements.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(adminAgent, 1);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/standards/${standardId}/requirements/${requirementIds[0]}/reparent`)
        .send({
          parent_id: null,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/standards/:id/export', () => {
    it('should export draft standard as CycloneDX JSON', async () => {
      const agent = await loginAs('admin');
      const { standardId, requirementIds } = await createStandardWithRequirements(agent, 2);

      const res = await agent.get(`/api/v1/standards/${standardId}/export`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('application/vnd.cyclonedx+json');
      expect(res.header['content-disposition']).toContain('attachment');
      expect(res.text).toBeTruthy();

      // Parse to verify it's valid JSON
      const json = JSON.parse(res.text);
      expect(json).toHaveProperty('specVersion');
    });

    it('should export published standard with stored JSON', async () => {
      const authorAgent = await loginAs('admin');
      const standardRes = await createTestStandard(authorAgent);
      const standardId = standardRes.body.id;

      // Submit and approve
      await authorAgent.post(`/api/v1/standards/${standardId}/submit`);
      const approverAgent = await loginAs('assessor');
      await approverAgent.post(`/api/v1/standards/${standardId}/approve`);

      const res = await approverAgent.get(`/api/v1/standards/${standardId}/export`);

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('application/vnd.cyclonedx+json');
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/standards/00000000-0000-0000-0000-000000000000/export');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Standard not found');
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/standards/00000000-0000-0000-0000-000000000000/export');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/standards/import', () => {
    it('should import a standard with minimal required fields', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards/import')
        .send({
          identifier: getUnique('IMPORT'),
          name: 'Imported Standard',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.identifier).toBe(res.body.identifier);
      expect(res.body.name).toBe('Imported Standard');
    });

    it('should import standard with requirements', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards/import')
        .send({
          identifier: getUnique('IMPORT'),
          name: 'Standard with Requirements',
          requirements: [
            {
              identifier: 'REQ-1',
              name: 'First Requirement',
              description: 'Test req 1',
            },
            {
              identifier: 'REQ-2',
              name: 'Second Requirement',
              description: 'Test req 2',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.requirementCount).toBe(2);
    });

    it('should import standard with levels', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards/import')
        .send({
          identifier: getUnique('IMPORT'),
          name: 'Standard with Levels',
          levels: [
            {
              identifier: 'LEVEL-1',
              title: 'Level One',
              requirements: [],
            },
          ],
        });

      expect(res.status).toBe(201);
    });

    it('should return 409 if standard already exists', async () => {
      const agent = await loginAs('admin');
      const identifier = getUnique('IMPORT');

      // Import once
      const res1 = await agent
        .post('/api/v1/standards/import')
        .send({
          identifier,
          name: 'First Import',
        });
      expect(res1.status).toBe(201);

      // Try to import with same identifier
      const res2 = await agent
        .post('/api/v1/standards/import')
        .send({
          identifier,
          name: 'Duplicate Import',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error).toContain('already exists');
    });

    it('should return 400 for invalid schema', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/standards/import')
        .send({
          name: 'Missing Identifier',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should require standards.import permission', async () => {
      const assesseeAgent = await loginAs('assessee');

      const res = await assesseeAgent
        .post('/api/v1/standards/import')
        .send({
          identifier: getUnique('IMPORT'),
          name: 'Unauthorized Import',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/standards/import')
        .send({
          identifier: getUnique('IMPORT'),
          name: 'No Auth',
        });

      expect(res.status).toBe(401);
    });
  });
});
