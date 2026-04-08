import { describe, it, expect } from 'vitest';
import {
  setupHttpTests,
  loginAs,
  testUsers,
} from '../helpers/http.js';

describe('Claims HTTP Routes', () => {
  setupHttpTests();

  /**
   * Helper to create test data: project, standard, assessment, attestation.
   * Returns { projectId, standardId, assessmentId, attestationId }
   */
  let claimTestCounter = 0;
  async function createTestData(agent: any) {
    claimTestCounter++;
    const suffix = claimTestCounter;

    // Create standard first (needed for project.standardIds)
    const standardRes = await agent
      .post('/api/v1/standards')
      .send({
        identifier: `CLM-STD-${suffix}-${Date.now()}`,
        name: `Claim Test Standard ${suffix}`,
        version: '1.0',
      });
    expect(standardRes.status).toBe(201);
    const standardId = standardRes.body.id;

    // Create project with standardIds
    const projectRes = await agent
      .post('/api/v1/projects')
      .send({
        name: `Claim Test Project ${suffix}`,
        description: 'Project for claim tests',
        standardIds: [standardId],
      });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.id;

    // Create assessment
    const assessmentRes = await agent
      .post('/api/v1/assessments')
      .send({
        title: `Claim Test Assessment ${suffix}`,
        description: 'Assessment for claim tests',
        projectId,
      });
    expect(assessmentRes.status).toBe(201);
    const assessmentId = assessmentRes.body.id;

    // Create attestation
    const attestationRes = await agent
      .post('/api/v1/attestations')
      .send({
        assessmentId,
        summary: 'Test Attestation',
      });
    expect(attestationRes.status).toBe(201);
    const attestationId = attestationRes.body.id;

    return { projectId, standardId, assessmentId, attestationId };
  }

  describe('POST /api/v1/claims', () => {
    it('should create a claim without attestation link', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Security Claim',
          target: 'Authentication System',
          predicate: 'is_secure',
          reasoning: 'Uses OAuth 2.0',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Security Claim');
      expect(res.body.target).toBe('Authentication System');
      expect(res.body.predicate).toBe('is_secure');
      expect(res.body.reasoning).toBe('Uses OAuth 2.0');
    });

    it('should create a claim with attestationId link', async () => {
      const agent = await loginAs('admin');
      const { attestationId } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Compliance Claim',
          target: 'Data Processing',
          predicate: 'compliant_with_gdpr',
          reasoning: 'Anonymized data handling',
          attestationId,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Compliance Claim');
      expect(res.body.attestationId).toBe(attestationId);
    });

    it('should create a counter claim', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Performance Counter Claim',
          target: 'Response Time',
          predicate: 'exceeds_threshold',
          isCounterClaim: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.isCounterClaim).toBe(true);
    });

    it('should return 404 if attestationId does not exist', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Invalid Claim',
          target: 'Something',
          predicate: 'exists',
          attestationId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Attestation not found');
    });

    it('should return 400 for missing required fields', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Incomplete Claim',
          // missing target, predicate
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 403 if attestation assessment is complete', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, attestationId } = await createTestData(agent);

      // Mark assessment as complete
      await agent
        .put(`/api/v1/assessments/${assessmentId}`)
        .send({ state: 'complete' });

      const res = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Blocked Claim',
          target: 'Sealed Assessment',
          predicate: 'forbidden',
          attestationId,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('completed assessment');
    });

    it('should require authentication', async () => {
      const agent = await loginAs('admin');
      const { closeDatabase } = await import('../../db/connection.js');

      // Make a fresh unauthenticated request
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/claims')
        .send({
          name: 'Unauthorized Claim',
          target: 'System',
          predicate: 'exists',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/claims/:id', () => {
    it('should retrieve a claim by ID', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Retrievable Claim',
          target: 'Target',
          predicate: 'test_predicate',
          reasoning: 'Test reasoning',
        });

      const claimId = createRes.body.id;

      const getRes = await agent.get(`/api/v1/claims/${claimId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.claim.id).toBe(claimId);
      expect(getRes.body.claim.name).toBe('Retrievable Claim');
      expect(getRes.body).toHaveProperty('evidence');
      expect(getRes.body).toHaveProperty('counterEvidence');
      expect(getRes.body).toHaveProperty('externalReferences');
    });

    it('should return 404 for non-existent claim', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/claims/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Claim not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/claims/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/claims/:id', () => {
    it('should update a claim', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Original Name',
          target: 'Original Target',
          predicate: 'original_predicate',
        });

      const claimId = createRes.body.id;

      const updateRes = await agent
        .put(`/api/v1/claims/${claimId}`)
        .send({
          name: 'Updated Name',
          reasoning: 'Added reasoning',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('Updated Name');
      expect(updateRes.body.reasoning).toBe('Added reasoning');
      expect(updateRes.body.target).toBe('Original Target');
    });

    it('should allow partial updates', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Partial Update Test',
          target: 'Target',
          predicate: 'test',
          isCounterClaim: false,
        });

      const claimId = createRes.body.id;

      const updateRes = await agent
        .put(`/api/v1/claims/${claimId}`)
        .send({
          isCounterClaim: true,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.isCounterClaim).toBe(true);
      expect(updateRes.body.name).toBe('Partial Update Test');
    });

    it('should return 404 for non-existent claim', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .put('/api/v1/claims/00000000-0000-0000-0000-000000000000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Claim not found');
    });

    it('should return 403 if parent assessment is complete', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, attestationId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Will Be Locked',
          target: 'Target',
          predicate: 'test',
          attestationId,
        });

      const claimId = createRes.body.id;

      // Mark assessment as complete
      await agent
        .put(`/api/v1/assessments/${assessmentId}`)
        .send({ state: 'complete' });

      const updateRes = await agent
        .put(`/api/v1/claims/${claimId}`)
        .send({ name: 'Updated Name' });

      expect(updateRes.status).toBe(403);
      expect(updateRes.body.error).toContain('completed assessment');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .put('/api/v1/claims/00000000-0000-0000-0000-000000000000')
        .send({ name: 'Updated' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/claims/:id', () => {
    it('should delete a claim', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Deletable Claim',
          target: 'Target',
          predicate: 'test',
        });

      const claimId = createRes.body.id;

      const deleteRes = await agent.delete(`/api/v1/claims/${claimId}`);

      expect(deleteRes.status).toBe(204);

      // Verify claim is gone
      const getRes = await agent.get(`/api/v1/claims/${claimId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 when deleting non-existent claim', async () => {
      const agent = await loginAs('admin');

      const res = await agent.delete('/api/v1/claims/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Claim not found');
    });

    it('should return 403 if parent assessment is complete', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, attestationId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/claims')
        .send({
          name: 'Protected Claim',
          target: 'Target',
          predicate: 'test',
          attestationId,
        });

      const claimId = createRes.body.id;

      // Mark assessment as complete
      await agent
        .put(`/api/v1/assessments/${assessmentId}`)
        .send({ state: 'complete' });

      const deleteRes = await agent.delete(`/api/v1/claims/${claimId}`);

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error).toContain('completed assessment');
    });

    it('should require admin or assessor role', async () => {
      const adminAgent = await loginAs('admin');

      const createRes = await adminAgent
        .post('/api/v1/claims')
        .send({
          name: 'Role Test Claim',
          target: 'Target',
          predicate: 'test',
        });

      const claimId = createRes.body.id;

      // Try to delete with assessor role (should succeed)
      const assessorAgent = await loginAs('assessor');
      const assessorDeleteRes = await assessorAgent.delete(`/api/v1/claims/${claimId}`);
      expect(assessorDeleteRes.status).toBe(204);

      // Try to delete with assessee role - create a new one first
      const createRes2 = await adminAgent
        .post('/api/v1/claims')
        .send({
          name: 'Assessee Role Test',
          target: 'Target',
          predicate: 'test',
        });

      const claimId2 = createRes2.body.id;

      const assesseeAgent = await loginAs('assessee');
      const assesseeDeleteRes = await assesseeAgent.delete(`/api/v1/claims/${claimId2}`);
      expect(assesseeDeleteRes.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.delete('/api/v1/claims/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });
});
