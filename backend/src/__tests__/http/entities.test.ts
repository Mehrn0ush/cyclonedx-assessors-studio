import { describe, it, expect } from 'vitest';
import { setupHttpTests, loginAs } from '../helpers/http.js';

describe('Entities HTTP Routes', () => {
  setupHttpTests();

  let testDataCounter = 0;

  /**
   * Helper to create a standard (needed for policies)
   */
  async function createStandard(agent: any): Promise<string> {
    testDataCounter++;
    const res = await agent
      .post('/api/v1/standards')
      .send({
        identifier: `STD-${testDataCounter}-${Date.now()}`,
        name: `Test Standard ${testDataCounter}`,
        version: '1.0',
      });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  /**
   * Helper to create an entity
   */
  async function createEntity(
    agent: any,
    overrides: Record<string, any> = {}
  ): Promise<string> {
    testDataCounter++;
    const suffix = testDataCounter;
    const res = await agent
      .post('/api/v1/entities')
      .send({
        name: `Test Entity ${suffix}`,
        description: `Test entity description ${suffix}`,
        entityType: 'product',
        tags: [],
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  /**
   * Helper to create an assessment for an entity
   */
  async function createAssessment(agent: any, entityId: string): Promise<string> {
    testDataCounter++;
    const suffix = testDataCounter;
    const res = await agent
      .post('/api/v1/assessments')
      .send({
        title: `Test Assessment ${suffix}`,
        description: `Test assessment for entity`,
        entityId,
      });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  describe('GET /api/v1/entities', () => {
    it('should list entities with pagination', async () => {
      const agent = await loginAs('admin');
      await createEntity(agent);

      const res = await agent.get('/api/v1/entities?limit=10&offset=0');

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

      const res = await agent.get('/api/v1/entities?limit=5&offset=0');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });

    it('should respect offset parameter', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities?limit=10&offset=2');

      expect(res.status).toBe(200);
      expect(res.body.pagination.offset).toBe(2);
    });

    it('should filter entities by entity_type', async () => {
      const agent = await loginAs('admin');
      await createEntity(agent, { entityType: 'organization' });
      await createEntity(agent, { entityType: 'team' });

      const res = await agent.get('/api/v1/entities?entity_type=organization');

      expect(res.status).toBe(200);
      expect(res.body.data.every((e: any) => e.entityType === 'organization')).toBe(true);
    });

    it('should filter entities by state', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      // Archive one entity
      await agent
        .delete(`/api/v1/entities/${entityId}`)

      const res = await agent.get('/api/v1/entities?state=archived');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((e: any) => e.state === 'archived')).toBe(true);
    });

    it('should exclude archived entities by default', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities');

      expect(res.status).toBe(200);
      expect(res.body.data.every((e: any) => e.state !== 'archived')).toBe(true);
    });

    it('should search entities by name', async () => {
      const agent = await loginAs('admin');
      testDataCounter++;
      const uniqueName = `UniqueSearchEntity${testDataCounter}`;
      await createEntity(agent, { name: uniqueName });

      const res = await agent.get(`/api/v1/entities?search=${uniqueName}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.some((e: any) => e.name === uniqueName)).toBe(true);
    });

    it('should search entities by description', async () => {
      const agent = await loginAs('admin');
      testDataCounter++;
      const uniqueDesc = `UniqueDescription${testDataCounter}`;
      await createEntity(agent, { description: uniqueDesc });

      const res = await agent.get(`/api/v1/entities?search=${uniqueDesc}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should include tags in response', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent, {
        name: `EntityWithTags${testDataCounter}`,
        tags: ['tag1', 'tag2'],
      });

      const res = await agent.get('/api/v1/entities');

      expect(res.status).toBe(200);
      const entity = res.body.data.find((e: any) => e.id === entityId);
      expect(entity).toBeDefined();
      expect(Array.isArray(entity.tags)).toBe(true);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/entities/relationship-graph', () => {
    it('should return global relationship graph', async () => {
      const agent = await loginAs('admin');
      const entity1 = await createEntity(agent);
      const entity2 = await createEntity(agent);

      // Create relationship
      await agent
        .post(`/api/v1/entities/${entity1}/relationships`)
        .send({
          targetEntityId: entity2,
          relationshipType: 'owns',
        });

      const res = await agent.get('/api/v1/entities/relationship-graph');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entities');
      expect(res.body).toHaveProperty('edges');
      expect(Array.isArray(res.body.entities)).toBe(true);
      expect(Array.isArray(res.body.edges)).toBe(true);
    });

    it('should filter by producer perspective', async () => {
      const agent = await loginAs('admin');
      const entity1 = await createEntity(agent);
      const entity2 = await createEntity(agent);

      await agent
        .post(`/api/v1/entities/${entity1}/relationships`)
        .send({
          targetEntityId: entity2,
          relationshipType: 'owns',
        });

      const res = await agent.get('/api/v1/entities/relationship-graph?perspective=producer');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entities');
      expect(res.body).toHaveProperty('edges');
      expect(res.body.edges.every((e: any) => ['owns', 'contains', 'governs'].includes(e.relationshipType))).toBe(true);
    });

    it('should filter by consumer perspective', async () => {
      const agent = await loginAs('admin');
      const entity1 = await createEntity(agent);
      const entity2 = await createEntity(agent);

      await agent
        .post(`/api/v1/entities/${entity1}/relationships`)
        .send({
          targetEntityId: entity2,
          relationshipType: 'supplies',
        });

      const res = await agent.get('/api/v1/entities/relationship-graph?perspective=consumer');

      expect(res.status).toBe(200);
      expect(res.body.edges.every((e: any) => ['supplies', 'depends_on', 'consumes'].includes(e.relationshipType))).toBe(true);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities/relationship-graph');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/entities/:id', () => {
    it('should retrieve entity with full details', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent.get(`/api/v1/entities/${entityId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('entity');
      expect(res.body.entity.id).toBe(entityId);
      expect(res.body).toHaveProperty('parents');
      expect(res.body).toHaveProperty('children');
      expect(res.body).toHaveProperty('standards');
      expect(res.body).toHaveProperty('tags');
      expect(res.body).toHaveProperty('policies');
    });

    it('should include parent relationships', async () => {
      const agent = await loginAs('admin');
      const parentId = await createEntity(agent);
      const childId = await createEntity(agent);

      await agent
        .post(`/api/v1/entities/${parentId}/relationships`)
        .send({
          targetEntityId: childId,
          relationshipType: 'owns',
        });

      const res = await agent.get(`/api/v1/entities/${childId}`);

      expect(res.status).toBe(200);
      expect(res.body.parents.length).toBeGreaterThan(0);
      expect(res.body.parents[0].sourceEntityId).toBe(parentId);
    });

    it('should include child relationships', async () => {
      const agent = await loginAs('admin');
      const parentId = await createEntity(agent);
      const childId = await createEntity(agent);

      await agent
        .post(`/api/v1/entities/${parentId}/relationships`)
        .send({
          targetEntityId: childId,
          relationshipType: 'owns',
        });

      const res = await agent.get(`/api/v1/entities/${parentId}`);

      expect(res.status).toBe(200);
      expect(res.body.children.length).toBeGreaterThan(0);
      expect(res.body.children[0].targetEntityId).toBe(childId);
    });

    it('should include associated standards', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId = await createStandard(agent);

      // Create a policy to associate standard with entity
      await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
          description: 'Test policy',
        });

      const res = await agent.get(`/api/v1/entities/${entityId}`);

      expect(res.status).toBe(200);
      expect(res.body.policies.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/entities', () => {
    it('should create an entity with required fields', async () => {
      const agent = await loginAs('admin');
      testDataCounter++;
      const suffix = testDataCounter;

      const res = await agent
        .post('/api/v1/entities')
        .send({
          name: `New Entity ${suffix}`,
          entityType: 'product',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(`New Entity ${suffix}`);
      expect(res.body.entityType).toBe('product');
      expect(res.body.state).toBe('active');
    });

    it('should create an entity with optional description', async () => {
      const agent = await loginAs('admin');
      testDataCounter++;
      const suffix = testDataCounter;

      const res = await agent
        .post('/api/v1/entities')
        .send({
          name: `Entity with Desc ${suffix}`,
          description: 'Detailed description',
          entityType: 'team',
        });

      expect(res.status).toBe(201);
      expect(res.body.description).toBe('Detailed description');
    });

    it('should create an entity with tags', async () => {
      const agent = await loginAs('admin');
      testDataCounter++;
      const suffix = testDataCounter;

      const res = await agent
        .post('/api/v1/entities')
        .send({
          name: `Entity with Tags ${suffix}`,
          entityType: 'product',
          tags: ['backend', 'critical'],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('should accept all valid entityType values', async () => {
      const agent = await loginAs('admin');
      const types = ['organization', 'business_unit', 'team', 'product', 'product_version', 'component', 'service', 'project'];

      for (const type of types) {
        testDataCounter++;
        const res = await agent
          .post('/api/v1/entities')
          .send({
            name: `Entity ${type}`,
            entityType: type,
          });
        expect(res.status).toBe(201);
        expect(res.body.entityType).toBe(type);
      }
    });

    it('should return 400 for missing name', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/entities')
        .send({
          entityType: 'product',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for invalid entityType', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/entities')
        .send({
          name: 'Test Entity',
          entityType: 'invalid_type',
        });

      expect(res.status).toBe(400);
    });

    it('should require entities.create permission', async () => {
      const assesseeAgent = await loginAs('assessee');

      const res = await assesseeAgent
        .post('/api/v1/entities')
        .send({
          name: 'Unauthorized Entity',
          entityType: 'product',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/entities')
        .send({
          name: 'Test Entity',
          entityType: 'product',
        });

      expect(res.status).toBe(401);
    });

    it('should use camelCase in response', async () => {
      const agent = await loginAs('admin');
      testDataCounter++;

      const res = await agent
        .post('/api/v1/entities')
        .send({
          name: `Entity ${testDataCounter}`,
          entityType: 'product',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('entityType');
      expect(res.body).not.toHaveProperty('entity_type');
    });
  });

  describe('PUT /api/v1/entities/:id', () => {
    it('should update entity name', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent
        .put(`/api/v1/entities/${entityId}`)
        .send({
          name: 'Updated Entity Name',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Entity Name');
    });

    it('should update entity description', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent
        .put(`/api/v1/entities/${entityId}`)
        .send({
          description: 'Updated description',
        });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Updated description');
    });

    it('should update entity state', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent
        .put(`/api/v1/entities/${entityId}`)
        .send({
          state: 'inactive',
        });

      expect(res.status).toBe(200);
      expect(res.body.state).toBe('inactive');
    });

    it('should update multiple fields at once', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent
        .put(`/api/v1/entities/${entityId}`)
        .send({
          name: 'New Name',
          description: 'New Desc',
          state: 'inactive',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
      expect(res.body.description).toBe('New Desc');
      expect(res.body.state).toBe('inactive');
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .put('/api/v1/entities/00000000-0000-0000-0000-000000000000')
        .send({
          name: 'Updated',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require entities.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = await createEntity(adminAgent);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/entities/${entityId}`)
        .send({
          name: 'Unauthorized Update',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .put('/api/v1/entities/00000000-0000-0000-0000-000000000000')
        .send({
          name: 'Updated',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/entities/:id', () => {
    it('should soft delete entity by setting state to archived', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent.delete(`/api/v1/entities/${entityId}`);

      expect(res.status).toBe(204);

      // Verify entity is archived
      const getRes = await agent.get(`/api/v1/entities/${entityId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.entity.state).toBe('archived');
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent.delete('/api/v1/entities/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require entities.delete permission', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = await createEntity(adminAgent);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.delete(`/api/v1/entities/${entityId}`);

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.delete('/api/v1/entities/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/entities/:id/children', () => {
    it('should retrieve child entities', async () => {
      const agent = await loginAs('admin');
      const parentId = await createEntity(agent);
      const childId = await createEntity(agent);

      await agent
        .post(`/api/v1/entities/${parentId}/relationships`)
        .send({
          targetEntityId: childId,
          relationshipType: 'owns',
        });

      const res = await agent.get(`/api/v1/entities/${parentId}/children`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].id).toBe(childId);
    });

    it('should return empty data when no children', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent.get(`/api/v1/entities/${entityId}/children`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/children');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/children');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/entities/:id/assessments', () => {
    it('should retrieve assessments for an entity', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const assessmentId = await createAssessment(agent, entityId);

      const res = await agent.get(`/api/v1/entities/${entityId}/assessments`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].id).toBe(assessmentId);
    });

    it('should return empty data when no assessments', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent.get(`/api/v1/entities/${entityId}/assessments`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/assessments');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/assessments');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/entities/:id/history', () => {
    it('should retrieve assessment history for an entity', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const assessmentId = await createAssessment(agent, entityId);

      const res = await agent.get(`/api/v1/entities/${entityId}/history`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/history');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/history');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/entities/:id/relationship-graph', () => {
    it('should retrieve transitive relationship graph', async () => {
      const agent = await loginAs('admin');
      const entity1 = await createEntity(agent);
      const entity2 = await createEntity(agent);
      const entity3 = await createEntity(agent);

      // Create chain: entity1 -> entity2 -> entity3
      await agent
        .post(`/api/v1/entities/${entity1}/relationships`)
        .send({
          targetEntityId: entity2,
          relationshipType: 'owns',
        });

      await agent
        .post(`/api/v1/entities/${entity2}/relationships`)
        .send({
          targetEntityId: entity3,
          relationshipType: 'owns',
        });

      const res = await agent.get(`/api/v1/entities/${entity1}/relationship-graph`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('rootEntityId');
      expect(res.body).toHaveProperty('entities');
      expect(res.body).toHaveProperty('edges');
      expect(res.body.rootEntityId).toBe(entity1);
      expect(Array.isArray(res.body.entities)).toBe(true);
      expect(Array.isArray(res.body.edges)).toBe(true);
    });

    it('should respect depth parameter', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent.get(`/api/v1/entities/${entityId}/relationship-graph?depth=3`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/relationship-graph');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/relationship-graph');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/entities/:id/relationships', () => {
    it('should create a relationship between two entities', async () => {
      const agent = await loginAs('admin');
      const sourceId = await createEntity(agent);
      const targetId = await createEntity(agent);

      const res = await agent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: targetId,
          relationshipType: 'owns',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.sourceEntityId).toBe(sourceId);
      expect(res.body.targetEntityId).toBe(targetId);
      expect(res.body.relationshipType).toBe('owns');
    });

    it('should accept all valid relationship types', async () => {
      const agent = await loginAs('admin');
      const types = ['owns', 'supplies', 'depends_on', 'governs', 'contains', 'consumes', 'assesses', 'produces'];

      for (const type of types) {
        const sourceId = await createEntity(agent);
        const targetId = await createEntity(agent);

        const res = await agent
          .post(`/api/v1/entities/${sourceId}/relationships`)
          .send({
            targetEntityId: targetId,
            relationshipType: type,
          });
        expect(res.status).toBe(201);
        expect(res.body.relationshipType).toBe(type);
      }
    });

    it('should return 404 for non-existent source entity', async () => {
      const agent = await loginAs('admin');
      const targetId = await createEntity(agent);

      const res = await agent
        .post('/api/v1/entities/00000000-0000-0000-0000-000000000000/relationships')
        .send({
          targetEntityId: targetId,
          relationshipType: 'owns',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Source entity not found');
    });

    it('should return 404 for non-existent target entity', async () => {
      const agent = await loginAs('admin');
      const sourceId = await createEntity(agent);

      const res = await agent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: '00000000-0000-0000-0000-000000000000',
          relationshipType: 'owns',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Target entity not found');
    });

    it('should return 409 for duplicate relationship', async () => {
      const agent = await loginAs('admin');
      const sourceId = await createEntity(agent);
      const targetId = await createEntity(agent);

      // Create first relationship
      await agent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: targetId,
          relationshipType: 'owns',
        });

      // Try to create duplicate
      const res = await agent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: targetId,
          relationshipType: 'owns',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('should return 400 for invalid relationship type', async () => {
      const agent = await loginAs('admin');
      const sourceId = await createEntity(agent);
      const targetId = await createEntity(agent);

      const res = await agent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: targetId,
          relationshipType: 'invalid',
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid target entity ID', async () => {
      const agent = await loginAs('admin');
      const sourceId = await createEntity(agent);

      const res = await agent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: 'not-a-uuid',
          relationshipType: 'owns',
        });

      expect(res.status).toBe(400);
    });

    it('should require entities.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const sourceId = await createEntity(adminAgent);
      const targetId = await createEntity(adminAgent);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: targetId,
          relationshipType: 'owns',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/entities/00000000-0000-0000-0000-000000000000/relationships')
        .send({
          targetEntityId: '00000000-0000-0000-0000-000000000001',
          relationshipType: 'owns',
        });

      expect(res.status).toBe(401);
    });

    it('should use camelCase in response', async () => {
      const agent = await loginAs('admin');
      const sourceId = await createEntity(agent);
      const targetId = await createEntity(agent);

      const res = await agent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: targetId,
          relationshipType: 'owns',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('sourceEntityId');
      expect(res.body).toHaveProperty('targetEntityId');
      expect(res.body).not.toHaveProperty('source_entity_id');
      expect(res.body).not.toHaveProperty('target_entity_id');
    });
  });

  describe('DELETE /api/v1/entities/:id/relationships/:relId', () => {
    it('should delete a relationship', async () => {
      const agent = await loginAs('admin');
      const sourceId = await createEntity(agent);
      const targetId = await createEntity(agent);

      const createRes = await agent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: targetId,
          relationshipType: 'owns',
        });

      const relId = createRes.body.id;

      const res = await agent.delete(`/api/v1/entities/${sourceId}/relationships/${relId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Relationship deleted successfully');
    });

    it('should return 404 for non-existent relationship', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent.delete(`/api/v1/entities/${entityId}/relationships/00000000-0000-0000-0000-000000000000`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Relationship not found');
    });

    it('should require entities.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const sourceId = await createEntity(adminAgent);
      const targetId = await createEntity(adminAgent);

      const createRes = await adminAgent
        .post(`/api/v1/entities/${sourceId}/relationships`)
        .send({
          targetEntityId: targetId,
          relationshipType: 'owns',
        });

      const relId = createRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.delete(`/api/v1/entities/${sourceId}/relationships/${relId}`);

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.delete(
        '/api/v1/entities/00000000-0000-0000-0000-000000000000/relationships/00000000-0000-0000-0000-000000000001'
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/entities/:id/policies', () => {
    it('should retrieve compliance policies for an entity', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId = await createStandard(agent);

      await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
          description: 'Test policy',
        });

      const res = await agent.get(`/api/v1/entities/${entityId}/policies`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should include inherited policies from parent entities', async () => {
      const agent = await loginAs('admin');
      const parentId = await createEntity(agent);
      const childId = await createEntity(agent);
      const standardId = await createStandard(agent);

      // Create parent -> child relationship
      await agent
        .post(`/api/v1/entities/${parentId}/relationships`)
        .send({
          targetEntityId: childId,
          relationshipType: 'owns',
        });

      // Add policy to parent
      await agent
        .post(`/api/v1/entities/${parentId}/policies`)
        .send({
          standardId,
          description: 'Parent policy',
        });

      const res = await agent.get(`/api/v1/entities/${childId}/policies`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/policies');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/policies');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/entities/:id/policies', () => {
    it('should create a compliance policy for an entity', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId = await createStandard(agent);

      const res = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
          description: 'Security compliance policy',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.entityId).toBe(entityId);
      expect(res.body.standardId).toBe(standardId);
      expect(res.body.description).toBe('Security compliance policy');
      expect(res.body.isInherited).toBe(false);
    });

    it('should create a policy without description', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId = await createStandard(agent);

      const res = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');
      const standardId = await createStandard(agent);

      const res = await agent
        .post('/api/v1/entities/00000000-0000-0000-0000-000000000000/policies')
        .send({
          standardId,
          description: 'Test',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should return 404 for non-existent standard', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId: '00000000-0000-0000-0000-000000000000',
          description: 'Test',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Standard not found');
    });

    it('should require entities.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = await createEntity(adminAgent);
      const standardId = await createStandard(adminAgent);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
          description: 'Unauthorized policy',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/entities/00000000-0000-0000-0000-000000000000/policies')
        .send({
          standardId: '00000000-0000-0000-0000-000000000001',
          description: 'Test',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/entities/:id/policies/:policyId', () => {
    it('should update policy description', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId = await createStandard(agent);

      const createRes = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
          description: 'Original description',
        });

      const policyId = createRes.body.id;

      const res = await agent
        .put(`/api/v1/entities/${entityId}/policies/${policyId}`)
        .send({
          description: 'Updated description',
        });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Updated description');
    });

    it('should update policy standard', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId1 = await createStandard(agent);
      const standardId2 = await createStandard(agent);

      const createRes = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId: standardId1,
          description: 'Test',
        });

      const policyId = createRes.body.id;

      const res = await agent
        .put(`/api/v1/entities/${entityId}/policies/${policyId}`)
        .send({
          standardId: standardId2,
        });

      expect(res.status).toBe(200);
      expect(res.body.standardId).toBe(standardId2);
    });

    it('should return 404 for non-existent policy', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent
        .put(`/api/v1/entities/${entityId}/policies/00000000-0000-0000-0000-000000000000`)
        .send({
          description: 'Updated',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Compliance policy not found');
    });

    it('should return 404 for non-existent standard during update', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId = await createStandard(agent);

      const createRes = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
        });

      const policyId = createRes.body.id;

      const res = await agent
        .put(`/api/v1/entities/${entityId}/policies/${policyId}`)
        .send({
          standardId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Standard not found');
    });

    it('should return 409 when updating to duplicate standard', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId1 = await createStandard(agent);
      const standardId2 = await createStandard(agent);

      // Create two policies
      const policy1Res = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId: standardId1,
        });

      await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId: standardId2,
        });

      // Try to update policy1 to standardId2 (which already exists)
      const res = await agent
        .put(`/api/v1/entities/${entityId}/policies/${policy1Res.body.id}`)
        .send({
          standardId: standardId2,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('should require entities.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = await createEntity(adminAgent);
      const standardId = await createStandard(adminAgent);

      const createRes = await adminAgent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
        });

      const policyId = createRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/entities/${entityId}/policies/${policyId}`)
        .send({
          description: 'Unauthorized update',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .put('/api/v1/entities/00000000-0000-0000-0000-000000000000/policies/00000000-0000-0000-0000-000000000001')
        .send({
          description: 'Updated',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/entities/:id/policies/:policyId', () => {
    it('should delete a compliance policy', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId = await createStandard(agent);

      const createRes = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
          description: 'Policy to delete',
        });

      const policyId = createRes.body.id;

      const res = await agent.delete(`/api/v1/entities/${entityId}/policies/${policyId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Compliance policy deleted successfully');
    });

    it('should return 404 for non-existent policy', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent.delete(`/api/v1/entities/${entityId}/policies/00000000-0000-0000-0000-000000000000`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Compliance policy not found');
    });

    it('should require entities.edit permission', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = await createEntity(adminAgent);
      const standardId = await createStandard(adminAgent);

      const createRes = await adminAgent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
        });

      const policyId = createRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.delete(`/api/v1/entities/${entityId}/policies/${policyId}`);

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.delete(
        '/api/v1/entities/00000000-0000-0000-0000-000000000000/policies/00000000-0000-0000-0000-000000000001'
      );

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/entities/:id/progress', () => {
    it('should retrieve progress tracking data for an entity', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      const res = await agent.get(`/api/v1/entities/${entityId}/progress`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 404 for non-existent entity', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/progress');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Entity not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/entities/00000000-0000-0000-0000-000000000000/progress');

      expect(res.status).toBe(401);
    });
  });

  describe('Role-based access control', () => {
    it('should allow admin to create, read, update, delete entities', async () => {
      const agent = await loginAs('admin');

      // Create
      const createRes = await agent
        .post('/api/v1/entities')
        .send({
          name: 'Admin Entity',
          entityType: 'product',
        });
      expect(createRes.status).toBe(201);
      const entityId = createRes.body.id;

      // Read
      const getRes = await agent.get(`/api/v1/entities/${entityId}`);
      expect(getRes.status).toBe(200);

      // Update
      const updateRes = await agent
        .put(`/api/v1/entities/${entityId}`)
        .send({ name: 'Updated Name' });
      expect(updateRes.status).toBe(200);

      // Delete
      const deleteRes = await agent.delete(`/api/v1/entities/${entityId}`);
      expect(deleteRes.status).toBe(204);
    });

    it('should allow assessor to read entities but not write', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = await createEntity(adminAgent);

      const assessorAgent = await loginAs('assessor');

      // Read should work
      const getRes = await assessorAgent.get(`/api/v1/entities/${entityId}`);
      expect(getRes.status).toBe(200);

      // Write should fail
      const updateRes = await assessorAgent
        .put(`/api/v1/entities/${entityId}`)
        .send({ name: 'Unauthorized' });
      expect(updateRes.status).toBe(403);
    });

    it('should allow assessee to read entities only', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = await createEntity(adminAgent);

      const assesseeAgent = await loginAs('assessee');

      // Read should work
      const getRes = await assesseeAgent.get(`/api/v1/entities/${entityId}`);
      expect(getRes.status).toBe(200);

      // Write should fail
      const updateRes = await assesseeAgent
        .put(`/api/v1/entities/${entityId}`)
        .send({ name: 'Unauthorized' });
      expect(updateRes.status).toBe(403);
    });
  });

  describe('Edge cases and data consistency', () => {
    it('should handle empty search results', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/entities?search=nonexistent_entity_abc123xyz');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it('should handle relationships to self', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);

      // This is an edge case - allowing self-relationships depends on business logic
      // The test just verifies the route handles it
      const res = await agent
        .post(`/api/v1/entities/${entityId}/relationships`)
        .send({
          targetEntityId: entityId,
          relationshipType: 'owns',
        });

      // Should either succeed or fail gracefully
      expect([201, 409, 400]).toContain(res.status);
    });

    it('should properly handle null descriptions', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/entities')
        .send({
          name: `Entity ${testDataCounter}`,
          description: null,
          entityType: 'product',
        });

      expect(res.status).toBe(201);
    });

    it('should return consistent camelCase across all responses', async () => {
      const agent = await loginAs('admin');
      const entityId = await createEntity(agent);
      const standardId = await createStandard(agent);

      // Create policy
      const policyRes = await agent
        .post(`/api/v1/entities/${entityId}/policies`)
        .send({
          standardId,
        });

      expect(policyRes.body).toHaveProperty('isInherited');
      expect(policyRes.body).not.toHaveProperty('is_inherited');
    });
  });
});
