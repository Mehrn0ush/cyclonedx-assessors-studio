import { describe, it, expect } from 'vitest';
import {
  setupHttpTests,
  loginAs,
  getAgent,
} from '../helpers/http.js';

describe('Assessors HTTP Routes', () => {
  setupHttpTests();

  /**
   * Helper to create test data: entity and user for assessor tests.
   * Returns { entityId, userId }
   */
  let testDataCounter = 0;
  async function createTestData(agent: any) {
    testDataCounter++;
    const suffix = testDataCounter;

    // Create an entity (organization)
    const entityRes = await agent
      .post('/api/v1/entities')
      .send({
        name: `Test Entity ${suffix}-${Date.now()}`,
        entityType: 'organization',
        description: 'Test entity for assessor tests',
      });
    expect(entityRes.status).toBe(201);
    const entityId = entityRes.body.id;

    // Create a user
    const userRes = await agent
      .post('/api/v1/users')
      .send({
        username: `testuser_${suffix}_${Date.now()}`,
        email: `testuser_${suffix}_${Date.now()}@test.local`,
        password: 'Password123!',
        displayName: `Test User ${suffix}`,
        role: 'assessor',
      });
    expect(userRes.status).toBe(201);
    const userId = userRes.body.id;

    return { entityId, userId };
  }

  describe('POST /api/v1/assessors', () => {
    it('should create an assessor with thirdParty=true', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('bomRef');
      expect(res.body.message).toBe('Assessor created successfully');
      expect(res.body.bomRef).toMatch(/^assessor-/);
    });

    it('should create an assessor with thirdParty=false', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: false,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.bomRef).toMatch(/^assessor-/);
    });

    it('should create an assessor with entityId', async () => {
      const agent = await loginAs('admin');
      const { entityId } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: false,
          entityId,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('should create an assessor with userId', async () => {
      const agent = await loginAs('admin');
      const { userId } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: false,
          userId,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('should create an assessor with both entityId and userId', async () => {
      const agent = await loginAs('admin');
      const { entityId, userId } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId,
          userId,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('should return 400 for missing thirdParty field', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/assessors')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for invalid thirdParty type', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: 'yes',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for invalid entityId (not a UUID)', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId: 'not-a-uuid',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for invalid userId (not a UUID)', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          userId: 'not-a-uuid',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 403 without assessments.manage permission', async () => {
      const assesseeAgent = await loginAs('assessee');

      const res = await assesseeAgent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
        });

      expect(res.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
        });

      expect(res.status).toBe(401);
    });

    it('should use camelCase in request and response', async () => {
      const agent = await loginAs('admin');
      const { entityId } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId, // camelCase input
        });

      expect(res.status).toBe(201);
      // Response should have camelCase due to middleware
      expect(res.body).toHaveProperty('bomRef');
      expect(res.body).not.toHaveProperty('bom_ref');
    });
  });

  describe('GET /api/v1/assessors', () => {
    it('should list all assessors', async () => {
      const agent = await loginAs('admin');

      // Create a few assessors first
      const res1 = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(res1.status).toBe(201);

      const res2 = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(res2.status).toBe(201);

      // List assessors
      const listRes = await agent.get('/api/v1/assessors');

      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveProperty('data');
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);

      // Check camelCase in response
      if (listRes.body.data.length > 0) {
        const assessor = listRes.body.data[0];
        expect(assessor).toHaveProperty('id');
        expect(assessor).toHaveProperty('bomRef');
        expect(assessor).toHaveProperty('thirdParty');
        expect(assessor).not.toHaveProperty('bom_ref');
        expect(assessor).not.toHaveProperty('third_party');
      }
    });

    it('should include entity and user details in list response', async () => {
      const agent = await loginAs('admin');
      const { entityId, userId } = await createTestData(agent);

      // Create assessor with entity and user
      const createRes = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId,
          userId,
        });
      expect(createRes.status).toBe(201);

      // List assessors
      const listRes = await agent.get('/api/v1/assessors');

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);

      // Find our created assessor
      const assessor = listRes.body.data.find((a: any) => a.id === createRes.body.id);
      expect(assessor).toBeDefined();
      expect(assessor.entityName).toBeDefined();
      expect(assessor.userDisplayName).toBeDefined();
    });

    it('should return data ordered by createdAt descending', async () => {
      const agent = await loginAs('admin');

      // Create multiple assessors with slight delays to ensure ordering
      const res1 = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(res1.status).toBe(201);

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));

      const res2 = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(res2.status).toBe(201);

      // List assessors
      const listRes = await agent.get('/api/v1/assessors');

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);

      // Most recent should be first
      if (listRes.body.data.length >= 2) {
        const first = listRes.body.data[0];
        const second = listRes.body.data[1];
        const firstDate = new Date(first.createdAt).getTime();
        const secondDate = new Date(second.createdAt).getTime();
        expect(firstDate).toBeGreaterThanOrEqual(secondDate);
      }
    });

    it('should return 401 without authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/assessors');

      expect(res.status).toBe(401);
    });

    it('should allow assessor to list assessors', async () => {
      const assessorAgent = await loginAs('assessor');

      const res = await assessorAgent.get('/api/v1/assessors');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should allow assessee to list assessors', async () => {
      const assesseeAgent = await loginAs('assessee');

      const res = await assesseeAgent.get('/api/v1/assessors');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/assessors/:id', () => {
    it('should retrieve assessor details by ID', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
        });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const getRes = await agent.get(`/api/v1/assessors/${assessorId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body).toHaveProperty('id');
      expect(getRes.body.id).toBe(assessorId);
      expect(getRes.body).toHaveProperty('thirdParty');
      expect(getRes.body).toHaveProperty('bomRef');
      expect(getRes.body).toHaveProperty('createdAt');
      expect(getRes.body).toHaveProperty('updatedAt');
    });

    it('should include attestations in detail response', async () => {
      const adminAgent = await loginAs('admin');

      // Create assessor
      const assessorRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(assessorRes.status).toBe(201);
      const assessorId = assessorRes.body.id;

      // Get detail
      const detailRes = await adminAgent.get(`/api/v1/assessors/${assessorId}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body).toHaveProperty('attestations');
      expect(Array.isArray(detailRes.body.attestations)).toBe(true);
    });

    it('should include related entity and user data', async () => {
      const agent = await loginAs('admin');
      const { entityId, userId } = await createTestData(agent);

      // Create assessor with entity and user
      const createRes = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId,
          userId,
        });
      expect(createRes.status).toBe(201);

      // Get details
      const detailRes = await agent.get(`/api/v1/assessors/${createRes.body.id}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.entityName).toBeDefined();
      expect(detailRes.body.entityType).toBeDefined();
      expect(detailRes.body.userDisplayName).toBeDefined();
    });

    it('should return 404 for non-existent assessor', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/assessors/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Assessor not found');
    });

    it('should return 401 without authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/assessors/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });

    it('should allow assessor to view assessor details', async () => {
      const adminAgent = await loginAs('admin');
      const assessorAgent = await loginAs('assessor');

      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const res = await assessorAgent.get(`/api/v1/assessors/${createRes.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
    });

    it('should handle assessors without entity or user gracefully', async () => {
      const agent = await loginAs('admin');

      // Create assessor with no entityId or userId
      const createRes = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
        });
      expect(createRes.status).toBe(201);

      const detailRes = await agent.get(`/api/v1/assessors/${createRes.body.id}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body).toHaveProperty('id');
      // entityName and userDisplayName should be null or undefined
      expect(detailRes.body.entityName === null || detailRes.body.entityName === undefined).toBe(true);
      expect(detailRes.body.userDisplayName === null || detailRes.body.userDisplayName === undefined).toBe(true);
    });

    it('should use camelCase in response', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(createRes.status).toBe(201);

      const detailRes = await agent.get(`/api/v1/assessors/${createRes.body.id}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body).toHaveProperty('bomRef');
      expect(detailRes.body).toHaveProperty('thirdParty');
      expect(detailRes.body).not.toHaveProperty('bom_ref');
      expect(detailRes.body).not.toHaveProperty('third_party');
    });
  });

  describe('PUT /api/v1/assessors/:id', () => {
    it('should update assessor thirdParty flag', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ thirdParty: true });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.message).toBe('Assessor updated successfully');

      // Verify the update
      const getRes = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.body.thirdParty).toBe(true);
    });

    it('should update assessor entityId', async () => {
      const agent = await loginAs('admin');
      const { entityId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ entityId });

      expect(updateRes.status).toBe(200);

      // Verify the update
      const getRes = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.body.entityId).toBe(entityId);
      expect(getRes.body.entityName).toBeDefined();
    });

    it('should update assessor userId', async () => {
      const agent = await loginAs('admin');
      const { userId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ userId });

      expect(updateRes.status).toBe(200);

      // Verify the update
      const getRes = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.body.userId).toBe(userId);
      expect(getRes.body.userDisplayName).toBeDefined();
    });

    it('should update multiple fields at once', async () => {
      const agent = await loginAs('admin');
      const { entityId, userId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({
          thirdParty: false,
          entityId,
          userId,
        });

      expect(updateRes.status).toBe(200);

      // Verify the update
      const getRes = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.body.thirdParty).toBe(false);
      expect(getRes.body.entityId).toBe(entityId);
      expect(getRes.body.userId).toBe(userId);
    });

    it('should update only provided fields', async () => {
      const agent = await loginAs('admin');
      const { entityId: entityId1 } = await createTestData(agent);
      const { entityId: entityId2 } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId: entityId1,
        });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;

      // Update only entityId
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ entityId: entityId2 });

      expect(updateRes.status).toBe(200);

      // Verify only entityId changed, thirdParty remains true
      const getRes = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.body.thirdParty).toBe(true);
      expect(getRes.body.entityId).toBe(entityId2);
    });

    it('should update updatedAt timestamp', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const getRes1 = await agent.get(`/api/v1/assessors/${assessorId}`);
      const updatedAt1 = getRes1.body.updatedAt;

      // Small delay to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 100));

      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ thirdParty: true });

      expect(updateRes.status).toBe(200);

      const getRes2 = await agent.get(`/api/v1/assessors/${assessorId}`);
      const updatedAt2 = getRes2.body.updatedAt;

      expect(new Date(updatedAt2).getTime()).toBeGreaterThan(new Date(updatedAt1).getTime());
    });

    it('should return 400 for invalid entityId', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ entityId: 'not-a-uuid' });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error).toBe('Invalid input');
    });

    it('should return 400 for invalid userId', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ userId: 'not-a-uuid' });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error).toBe('Invalid input');
    });

    it('should return 400 for invalid thirdParty type', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ thirdParty: 'maybe' });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error).toBe('Invalid input');
    });

    it('should return 404 for non-existent assessor', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .put('/api/v1/assessors/00000000-0000-0000-0000-000000000000')
        .send({ thirdParty: true });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Assessor not found');
    });

    it('should return 403 without assessments.manage permission', async () => {
      const adminAgent = await loginAs('admin');
      const assesseeAgent = await loginAs('assessee');

      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const updateRes = await assesseeAgent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ thirdParty: false });

      expect(updateRes.status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .put('/api/v1/assessors/00000000-0000-0000-0000-000000000000')
        .send({ thirdParty: true });

      expect(res.status).toBe(401);
    });

    it('should use camelCase in request', async () => {
      const agent = await loginAs('admin');
      const { entityId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      // Update with camelCase (not snake_case)
      const updateRes = await agent
        .put(`/api/v1/assessors/${createRes.body.id}`)
        .send({
          thirdParty: false,
          entityId, // camelCase
        });

      expect(updateRes.status).toBe(200);

      // Verify the camelCase was accepted and processed
      const getRes = await agent.get(`/api/v1/assessors/${createRes.body.id}`);
      expect(getRes.body.entityId).toBe(entityId);
    });
  });

  describe('DELETE /api/v1/assessors/:id', () => {
    it('should delete an assessor', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;

      // Verify it exists
      let getRes = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.status).toBe(200);

      // Delete it
      const deleteRes = await agent.delete(`/api/v1/assessors/${assessorId}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toBe('Assessor deleted successfully');

      // Verify it's gone
      getRes = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent assessor', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .delete('/api/v1/assessors/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Assessor not found');
    });

    it('should return 403 without assessments.manage permission', async () => {
      const adminAgent = await loginAs('admin');
      const assesseeAgent = await loginAs('assessee');

      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const deleteRes = await assesseeAgent.delete(`/api/v1/assessors/${assessorId}`);

      expect(deleteRes.status).toBe(403);

      // Verify it still exists
      const getRes = await adminAgent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.status).toBe(200);
    });

    it('should return 401 without authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .delete('/api/v1/assessors/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });

    it('should allow admin to delete assessor', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const deleteRes = await agent.delete(`/api/v1/assessors/${assessorId}`);

      expect(deleteRes.status).toBe(200);
    });

    it('should handle deleting already deleted assessor gracefully', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;

      // Delete once
      const deleteRes1 = await agent.delete(`/api/v1/assessors/${assessorId}`);
      expect(deleteRes1.status).toBe(200);

      // Try to delete again
      const deleteRes2 = await agent.delete(`/api/v1/assessors/${assessorId}`);
      expect(deleteRes2.status).toBe(404);
    });

    it('should return 403 for assessee attempting to delete', async () => {
      const adminAgent = await loginAs('admin');
      const assesseeAgent = await loginAs('assessee');

      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;
      const deleteRes = await assesseeAgent.delete(`/api/v1/assessors/${assessorId}`);

      expect(deleteRes.status).toBe(403);

      // Verify it still exists
      const getRes = await adminAgent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.status).toBe(200);
    });
  });

  describe('Edge cases and integration scenarios', () => {
    it('should handle assessor lifecycle: create, retrieve, update, delete', async () => {
      const agent = await loginAs('admin');
      const { entityId, userId } = await createTestData(agent);

      // Create
      const createRes = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId,
        });
      expect(createRes.status).toBe(201);
      const assessorId = createRes.body.id;

      // Retrieve
      const getRes = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.entityId).toBe(entityId);

      // Update
      const updateRes = await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({
          thirdParty: false,
          userId,
        });
      expect(updateRes.status).toBe(200);

      // Verify update
      const getRes2 = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes2.status).toBe(200);
      expect(getRes2.body.thirdParty).toBe(false);
      expect(getRes2.body.userId).toBe(userId);

      // Delete
      const deleteRes = await agent.delete(`/api/v1/assessors/${assessorId}`);
      expect(deleteRes.status).toBe(200);

      // Verify deletion
      const getRes3 = await agent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes3.status).toBe(404);
    });

    it('should handle multiple assessors with different configurations', async () => {
      const agent = await loginAs('admin');
      const { entityId: entity1, userId: user1 } = await createTestData(agent);
      const { entityId: entity2, userId: user2 } = await createTestData(agent);

      // Create various assessors
      const res1 = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(res1.status).toBe(201);

      const res2 = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false, entityId: entity1 });
      expect(res2.status).toBe(201);

      const res3 = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true, userId: user1 });
      expect(res3.status).toBe(201);

      const res4 = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: false,
          entityId: entity2,
          userId: user2,
        });
      expect(res4.status).toBe(201);

      // List all
      const listRes = await agent.get('/api/v1/assessors');
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(4);
    });

    it('should maintain consistency between list and detail views', async () => {
      const agent = await loginAs('admin');
      const { entityId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId,
        });
      expect(createRes.status).toBe(201);
      const assessorId = createRes.body.id;

      // Get from list
      const listRes = await agent.get('/api/v1/assessors');
      const fromList = listRes.body.data.find((a: any) => a.id === assessorId);

      // Get from detail
      const detailRes = await agent.get(`/api/v1/assessors/${assessorId}`);

      // Compare key fields
      expect(fromList.id).toBe(detailRes.body.id);
      expect(fromList.bomRef).toBe(detailRes.body.bomRef);
      expect(fromList.thirdParty).toBe(detailRes.body.thirdParty);
      expect(fromList.entityId).toBe(detailRes.body.entityId);
      expect(fromList.userId).toBe(detailRes.body.userId);
    });

    it('should handle null entityId and userId gracefully', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({
          thirdParty: true,
          entityId: null,
          userId: null,
        });
      expect(createRes.status).toBe(201);

      const detailRes = await agent.get(`/api/v1/assessors/${createRes.body.id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.entityId === null || detailRes.body.entityId === undefined).toBe(true);
      expect(detailRes.body.userId === null || detailRes.body.userId === undefined).toBe(true);
    });

    it('should return consistent bomRef format across operations', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const bomRefFromCreate = createRes.body.bomRef;

      const listRes = await agent.get('/api/v1/assessors');
      const fromList = listRes.body.data.find((a: any) => a.id === createRes.body.id);

      const detailRes = await agent.get(`/api/v1/assessors/${createRes.body.id}`);
      const bomRefFromDetail = detailRes.body.bomRef;

      expect(bomRefFromCreate).toMatch(/^assessor-/);
      expect(fromList.bomRef).toBe(bomRefFromCreate);
      expect(bomRefFromDetail).toBe(bomRefFromCreate);
    });

    it('should preserve createdAt across operations', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/assessors')
        .send({ thirdParty: false });
      expect(createRes.status).toBe(201);
      const assessorId = createRes.body.id;

      const detailRes1 = await agent.get(`/api/v1/assessors/${assessorId}`);
      const createdAt1 = detailRes1.body.createdAt;

      // Update something
      await new Promise(resolve => setTimeout(resolve, 50));
      await agent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ thirdParty: true });

      const detailRes2 = await agent.get(`/api/v1/assessors/${assessorId}`);
      const createdAt2 = detailRes2.body.createdAt;

      // createdAt should not change
      expect(createdAt2).toBe(createdAt1);
    });
  });

  describe('Role-based access control', () => {
    it('should allow admin to manage assessors', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);

      const assessorId = createRes.body.id;

      const getRes = await adminAgent.get(`/api/v1/assessors/${assessorId}`);
      expect(getRes.status).toBe(200);

      const updateRes = await adminAgent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ thirdParty: false });
      expect(updateRes.status).toBe(200);

      const deleteRes = await adminAgent.delete(`/api/v1/assessors/${assessorId}`);
      expect(deleteRes.status).toBe(200);
    });

    it('should deny assessee from creating assessors', async () => {
      const assesseeAgent = await loginAs('assessee');

      const res = await assesseeAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(res.status).toBe(403);
    });

    it('should allow assessor to create assessors', async () => {
      const assessorAgent = await loginAs('assessor');

      const res = await assessorAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(res.status).toBe(201);
    });

    it('should allow any authenticated user to list assessors', async () => {
      const adminAgent = await loginAs('admin');
      const assessorAgent = await loginAs('assessor');
      const assesseeAgent = await loginAs('assessee');

      // Create an assessor first (as admin)
      await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });

      // All roles should be able to list
      const adminListRes = await adminAgent.get('/api/v1/assessors');
      expect(adminListRes.status).toBe(200);

      const assessorListRes = await assessorAgent.get('/api/v1/assessors');
      expect(assessorListRes.status).toBe(200);

      const assesseeListRes = await assesseeAgent.get('/api/v1/assessors');
      expect(assesseeListRes.status).toBe(200);
    });

    it('should allow any authenticated user to view assessor details', async () => {
      const adminAgent = await loginAs('admin');
      const assessorAgent = await loginAs('assessor');
      const assesseeAgent = await loginAs('assessee');

      // Create an assessor (as admin)
      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);
      const assessorId = createRes.body.id;

      // All roles should be able to view
      const adminGetRes = await adminAgent.get(`/api/v1/assessors/${assessorId}`);
      expect(adminGetRes.status).toBe(200);

      const assessorGetRes = await assessorAgent.get(`/api/v1/assessors/${assessorId}`);
      expect(assessorGetRes.status).toBe(200);

      const assesseeGetRes = await assesseeAgent.get(`/api/v1/assessors/${assessorId}`);
      expect(assesseeGetRes.status).toBe(200);
    });

    it('should deny assessee from updating assessors', async () => {
      const adminAgent = await loginAs('admin');
      const assesseeAgent = await loginAs('assessee');

      // Create an assessor (as admin)
      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);
      const assessorId = createRes.body.id;

      // Assessee should not be able to update
      const assesseeUpdateRes = await assesseeAgent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ thirdParty: false });
      expect(assesseeUpdateRes.status).toBe(403);
    });

    it('should allow assessor to update assessors', async () => {
      const adminAgent = await loginAs('admin');
      const assessorAgent = await loginAs('assessor');

      // Create an assessor (as admin)
      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);
      const assessorId = createRes.body.id;

      // Assessor should be able to update
      const assessorUpdateRes = await assessorAgent
        .put(`/api/v1/assessors/${assessorId}`)
        .send({ thirdParty: false });
      expect(assessorUpdateRes.status).toBe(200);
    });

    it('should deny assessee from deleting assessors', async () => {
      const adminAgent = await loginAs('admin');
      const assesseeAgent = await loginAs('assessee');

      // Create an assessor (as admin)
      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);
      const assessorId = createRes.body.id;

      // Assessee should not be able to delete
      const assesseeDeleteRes = await assesseeAgent.delete(`/api/v1/assessors/${assessorId}`);
      expect(assesseeDeleteRes.status).toBe(403);

      // Assessor should still exist
      const existRes = await adminAgent.get(`/api/v1/assessors/${assessorId}`);
      expect(existRes.status).toBe(200);
    });

    it('should allow assessor to delete assessors', async () => {
      const adminAgent = await loginAs('admin');
      const assessorAgent = await loginAs('assessor');

      // Create an assessor (as admin)
      const createRes = await adminAgent
        .post('/api/v1/assessors')
        .send({ thirdParty: true });
      expect(createRes.status).toBe(201);
      const assessorId = createRes.body.id;

      // Assessor should be able to delete
      const assessorDeleteRes = await assessorAgent.delete(`/api/v1/assessors/${assessorId}`);
      expect(assessorDeleteRes.status).toBe(200);

      // Assessor should be gone
      const existRes = await adminAgent.get(`/api/v1/assessors/${assessorId}`);
      expect(existRes.status).toBe(404);
    });
  });
});
