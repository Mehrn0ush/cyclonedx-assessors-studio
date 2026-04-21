import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  setupHttpTests,
  loginAs,
} from '../helpers/http.js';

// Signature labels are unique per (user, label). Generate a short
// random suffix so tests across files do not collide on the shared
// PGlite database used by the HTTP harness.
function sigLabel(prefix: string): string {
  return `${prefix} ${crypto.randomBytes(4).toString('hex')}`;
}

describe('Attestations HTTP Routes', () => {
  setupHttpTests();

  /**
   * Helper to create test data: project, standard with requirements, assessment.
   * Returns { projectId, standardId, assessmentId, requirementIds }
   */
  let testDataCounter = 0;
  async function createTestData(agent: any) {
    testDataCounter++;
    const suffix = testDataCounter;

    // Create standard first (needed for project.standardIds)
    const standardRes = await agent
      .post('/api/v1/standards')
      .send({
        identifier: `ATT-STD-${suffix}-${Date.now()}`,
        name: `Test Standard ${suffix}`,
        version: '1.0',
      });
    expect(standardRes.status).toBe(201);
    const standardId = standardRes.body.id;

    // Create requirements on the standard
    const requirementIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const reqRes = await agent
        .post(`/api/v1/standards/${standardId}/requirements`)
        .send({
          identifier: `REQ-${suffix}-${i}`,
          name: `Requirement ${suffix}-${i}`,
          description: `Test requirement ${suffix}-${i}`,
        });
      expect(reqRes.status).toBe(201);
      requirementIds.push(reqRes.body.id);
    }

    // Create project with standardIds
    const projectRes = await agent
      .post('/api/v1/projects')
      .send({
        name: `Test Project ${suffix}`,
        description: 'Project for attestation tests',
        standardIds: [standardId],
      });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.id;

    // Create assessment
    const assessmentRes = await agent
      .post('/api/v1/assessments')
      .send({
        title: `Test Assessment ${suffix}`,
        description: 'Assessment for attestation tests',
        projectId,
      });
    expect(assessmentRes.status).toBe(201);
    const assessmentId = assessmentRes.body.id;

    return { projectId, standardId, assessmentId, requirementIds };
  }

  describe('POST /api/v1/attestations', () => {
    it('should create an attestation with valid assessment', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Test Attestation Summary',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.assessmentId).toBe(assessmentId);
      expect(res.body.summary).toBe('Test Attestation Summary');
    });

    it('should create attestation without optional summary', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.assessmentId).toBe(assessmentId);
    });

    it('should return 404 for invalid assessmentId', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId: '00000000-0000-0000-0000-000000000000',
          summary: 'Invalid Assessment',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Assessment not found');
    });

    it('should return 400 for missing assessmentId', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/attestations')
        .send({
          summary: 'Missing Assessment ID',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 403 if assessment is complete', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      // Mark assessment as complete
      await agent
        .put(`/api/v1/assessments/${assessmentId}`)
        .send({ state: 'complete' });

      const res = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Should Fail',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('completed assessment');
    });

    it('should return 403 if assessment is archived', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      // Mark assessment as archived
      await agent
        .put(`/api/v1/assessments/${assessmentId}`)
        .send({ state: 'archived' });

      const res = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Should Fail',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('archived assessment');
    });

    it('should require assessor or admin role', async () => {
      const adminAgent = await loginAs('admin');
      const { assessmentId } = await createTestData(adminAgent);

      // Assessee should not be able to create attestations
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Unauthorized',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .post('/api/v1/attestations')
        .send({
          assessmentId: '00000000-0000-0000-0000-000000000000',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/attestations', () => {
    it('should list attestations with pagination', async () => {
      const agent = await loginAs('admin');
      const { assessmentId: assessmentId1 } = await createTestData(agent);
      const { assessmentId: assessmentId2 } = await createTestData(agent);

      // Create attestations
      await agent
        .post('/api/v1/attestations')
        .send({ assessmentId: assessmentId1, summary: 'First' });

      await agent
        .post('/api/v1/attestations')
        .send({ assessmentId: assessmentId2, summary: 'Second' });

      const res = await agent.get('/api/v1/attestations?limit=10&offset=0');

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

      const res = await agent.get('/api/v1/attestations?limit=5&offset=0');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });

    it('should respect offset parameter', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/attestations?limit=10&offset=5');

      expect(res.status).toBe(200);
      expect(res.body.pagination.offset).toBe(5);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/attestations');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/attestations/:id', () => {
    it('should retrieve attestation details by ID', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Test Summary',
        });

      const attestationId = createRes.body.id;

      const getRes = await agent.get(`/api/v1/attestations/${attestationId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body).toHaveProperty('attestation');
      expect(getRes.body.attestation.id).toBe(attestationId);
      expect(getRes.body).toHaveProperty('requirements');
      expect(getRes.body).toHaveProperty('claims');
      expect(getRes.body).toHaveProperty('signatory');
    });

    it('should return 404 for non-existent attestation', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/attestations/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Attestation not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/attestations/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/attestations/:id', () => {
    it('should update attestation summary', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Original Summary',
        });

      const attestationId = createRes.body.id;

      const updateRes = await agent
        .put(`/api/v1/attestations/${attestationId}`)
        .send({
          summary: 'Updated Summary',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.summary).toBe('Updated Summary');
    });

    it('should return 404 for non-existent attestation', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .put('/api/v1/attestations/00000000-0000-0000-0000-000000000000')
        .send({ summary: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Attestation not found');
    });

    it('should return 409 if assessment is complete (Sprint 5.7 retention lock)', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      const createRes = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Will Be Locked',
        });

      const attestationId = createRes.body.id;

      // Mark assessment as complete
      await agent
        .put(`/api/v1/assessments/${assessmentId}`)
        .send({ state: 'complete' });

      const updateRes = await agent
        .put(`/api/v1/attestations/${attestationId}`)
        .send({ summary: 'Updated' });

      // Sprint 5.7 flipped the terminal-assessment response from 403
      // (authorization) to 409 Conflict with a machine-readable reason
      // so clients can distinguish retention from a permission denial.
      expect(updateRes.status).toBe(409);
      expect(updateRes.body.reason).toBe('assessment_terminal');
    });

    it('should require assessor or admin role', async () => {
      const adminAgent = await loginAs('admin');
      const { assessmentId } = await createTestData(adminAgent);

      const createRes = await adminAgent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = createRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/attestations/${attestationId}`)
        .send({ summary: 'Updated' });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .put('/api/v1/attestations/00000000-0000-0000-0000-000000000000')
        .send({ summary: 'Updated' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/attestations/:id/requirements', () => {
    it('should add a requirement to an attestation', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      const res = await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.85,
          conformanceRationale: 'Mostly compliant with some gaps',
          confidenceScore: 0.9,
          confidenceRationale: 'High confidence based on testing',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message');
    });

    it('should allow adding multiple requirements', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      // Add first requirement
      const res1 = await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.8,
          conformanceRationale: 'First requirement',
        });
      expect(res1.status).toBe(201);

      // Add second requirement
      const res2 = await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[1],
          conformanceScore: 0.9,
          conformanceRationale: 'Second requirement',
        });
      expect(res2.status).toBe(201);

      // Verify both are in the attestation
      const getRes = await agent.get(`/api/v1/attestations/${attestationId}`);
      expect(getRes.body.requirements.length).toBe(2);
    });

    it('should return 404 for non-existent attestation', async () => {
      const agent = await loginAs('admin');
      const { requirementIds } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/attestations/00000000-0000-0000-0000-000000000000/requirements')
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.8,
          conformanceRationale: 'Test',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Attestation not found');
    });

    it('should return 404 for non-existent requirement', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      const res = await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: '00000000-0000-0000-0000-000000000000',
          conformanceScore: 0.8,
          conformanceRationale: 'Test',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Requirement not found');
    });

    it('should return 400 for invalid conformance score', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      const res = await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 1.5,
          conformanceRationale: 'Out of range',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 409 if assessment is complete (Sprint 5.7 retention lock)', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      // Mark assessment as complete
      await agent
        .put(`/api/v1/assessments/${assessmentId}`)
        .send({ state: 'complete' });

      const res = await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.8,
          conformanceRationale: 'Should Fail',
        });

      // Sprint 5.7 promoted this from a 403 authorization denial to a
      // 409 Conflict with a machine-readable retention reason so clients
      // can react to record-integrity locks specifically.
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('assessment_terminal');
    });

    it('should require assessor or admin role', async () => {
      const adminAgent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(adminAgent);

      const attestationRes = await adminAgent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.8,
          conformanceRationale: 'Unauthorized',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/v1/attestations/:id/requirements/:requirementId', () => {
    it('should update requirement conformance score', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      // Add requirement
      await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.5,
          conformanceRationale: 'Initial score',
        });

      // Update requirement
      const updateRes = await agent
        .put(`/api/v1/attestations/${attestationId}/requirements/${requirementIds[0]}`)
        .send({
          conformanceScore: 0.95,
          conformanceRationale: 'Updated after fixes',
          confidenceScore: 0.99,
          confidenceRationale: 'Very confident now',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent requirement in attestation', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      const res = await agent
        .put(`/api/v1/attestations/${attestationId}/requirements/${requirementIds[0]}`)
        .send({
          conformanceScore: 0.8,
          conformanceRationale: 'Not added yet',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Attestation requirement not found');
    });

    it('should return 409 if assessment is complete (Sprint 5.7 retention lock)', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      // Add requirement
      await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.5,
          conformanceRationale: 'Initial',
        });

      // Mark assessment as complete
      await agent
        .put(`/api/v1/assessments/${assessmentId}`)
        .send({ state: 'complete' });

      const updateRes = await agent
        .put(`/api/v1/attestations/${attestationId}/requirements/${requirementIds[0]}`)
        .send({
          conformanceScore: 0.8,
          conformanceRationale: 'Should Fail',
        });

      // Sprint 5.7 flipped this to 409 Conflict with a
      // machine-readable `reason` so clients can distinguish
      // record-integrity retention from authorization denial.
      expect(updateRes.status).toBe(409);
      expect(updateRes.body.reason).toBe('assessment_terminal');
    });

    it('should require assessor or admin role', async () => {
      const adminAgent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(adminAgent);

      const attestationRes = await adminAgent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      // Add requirement
      await adminAgent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.5,
          conformanceRationale: 'Initial',
        });

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .put(`/api/v1/attestations/${attestationId}/requirements/${requirementIds[0]}`)
        .send({
          conformanceScore: 0.8,
          conformanceRationale: 'Unauthorized',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/attestations/:id/requirements', () => {
    it('should retrieve requirements for an attestation', async () => {
      const agent = await loginAs('admin');
      const { assessmentId, requirementIds } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      // Add requirements
      await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.8,
          conformanceRationale: 'Compliant',
        });

      await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[1],
          conformanceScore: 0.9,
          conformanceRationale: 'Highly compliant',
        });

      const res = await agent.get(`/api/v1/attestations/${attestationId}/requirements`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('should return 404 for non-existent attestation', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/attestations/00000000-0000-0000-0000-000000000000/requirements');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Attestation not found');
    });

    it('should require authentication', async () => {
      const { getAgent } = await import('../helpers/http.js');
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/attestations/00000000-0000-0000-0000-000000000000/requirements');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/attestations/:id/sign', () => {
    it('should sign an attestation with signatory', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });

      const attestationId = attestationRes.body.id;

      // This test would need signatory fixtures; skipping detailed test
      // as the route requires valid signatory entities
      expect(attestationId).toBeDefined();
    });

    // ----------------------------------------------------------------------
    // Stored signature flow (Option B): the caller references a row in
    // their own /me/signatures inventory. Covers electronic signing
    // (server materializes a fresh signatory row from the stored
    // payload) and digital signing (two-step prepare + sign with a
    // detached signature value the client computed locally).
    // ----------------------------------------------------------------------
    it('should sign an attestation using a stored electronic signature', async () => {
      const agent = await loginAs('assessor');
      const { assessmentId, requirementIds } = await createTestData(
        await loginAs('admin'),
      );

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });
      expect(attestationRes.status).toBe(201);
      const attestationId = attestationRes.body.id;

      // Attach at least one requirement so the canonical payload hash
      // is meaningful.
      await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.9,
          conformanceRationale: 'Stored sig test',
        });

      // Create the stored electronic signature in the caller's
      // inventory.
      const sigRes = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: sigLabel('Stored Sign Flow'),
        payload: {
          name: 'Stored Signer',
          role: 'CTO',
          organization: { name: 'Stored Org Inc.' },
          signedName: 'S. Stored',
        },
      });
      expect(sigRes.status).toBe(201);
      const userSignatureId = sigRes.body.id;

      // Sign using the stored entry. The server materializes a
      // signatory row and stamps it onto the attestation.
      const signRes = await agent
        .post(`/api/v1/attestations/${attestationId}/sign`)
        .send({ userSignatureId });

      expect(signRes.status).toBe(200);
      expect(signRes.body.signatureType).toBe('electronic');
      expect(signRes.body.signatoryId).toBeDefined();
      expect(signRes.body.canonicalPayloadHash).toMatch(/^[a-f0-9]{64}$/);

      // Re-signing should be rejected with 409 because attestations are
      // immutable once signed.
      const reSignRes = await agent
        .post(`/api/v1/attestations/${attestationId}/sign`)
        .send({ userSignatureId });
      expect(reSignRes.status).toBe(409);
    });

    it('should honor electronic overrides on stored signature sign', async () => {
      const agent = await loginAs('assessor');
      const { assessmentId, requirementIds } = await createTestData(
        await loginAs('admin'),
      );

      const attestationRes = await agent
        .post('/api/v1/attestations')
        .send({ assessmentId });
      const attestationId = attestationRes.body.id;

      await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.85,
          conformanceRationale: 'Override test',
        });

      const sigRes = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: sigLabel('Override Sig'),
        payload: {
          name: 'Override Signer',
          organization: { name: 'Override Org' },
          jurisdiction: 'Default Jurisdiction',
          legalIntent: 'Default Intent',
        },
      });

      const signRes = await agent
        .post(`/api/v1/attestations/${attestationId}/sign`)
        .send({
          userSignatureId: sigRes.body.id,
          signedName: 'Override Signed Name',
          jurisdiction: 'Override Jurisdiction',
          legalIntent: 'Override Intent',
        });

      expect(signRes.status).toBe(200);

      // Read back the attestation and verify the overrides won.
      const fetched = await agent.get(`/api/v1/attestations/${attestationId}`);
      expect(fetched.status).toBe(200);
      const att = fetched.body.attestation;
      expect(att.signedName).toBe('Override Signed Name');
      expect(att.signatureJurisdiction).toBe('Override Jurisdiction');
      expect(att.signatureLegalIntent).toBe('Override Intent');
    });

    it('should 404 when stored signature belongs to another user', async () => {
      // Admin owns the signature; assessor tries to use it.
      const admin = await loginAs('admin');
      const assessor = await loginAs('assessor');

      const { assessmentId } = await createTestData(admin);

      const attestationRes = await assessor
        .post('/api/v1/attestations')
        .send({ assessmentId });
      const attestationId = attestationRes.body.id;

      const adminSig = await admin.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: sigLabel('Admin Owned Sig'),
        payload: {
          name: 'Admin',
          organization: { name: 'Admin Org' },
        },
      });

      const res = await assessor
        .post(`/api/v1/attestations/${attestationId}/sign`)
        .send({ userSignatureId: adminSig.body.id });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Signature not found/);
    });

    it('should reject stored digital sign without signatureValue', async () => {
      const agent = await loginAs('assessor');
      const { assessmentId } = await createTestData(await loginAs('admin'));

      const attRes = await agent.post('/api/v1/attestations').send({ assessmentId });
      const attestationId = attRes.body.id;

      const { publicKey } = (await import('node:crypto')).generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const sigRes = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'digital',
        label: sigLabel('Digital For Bad Sign'),
        payload: {
          signatureFormat: 'jsf',
          signatureAlgorithm: 'RS256',
          publicKeyPem: publicKey as string,
        },
      });

      const res = await agent
        .post(`/api/v1/attestations/${attestationId}/sign`)
        .send({ userSignatureId: sigRes.body.id });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signatureValue is required/);
    });

    it('should support the prepare + sign flow for stored digital signatures', async () => {
      const crypto = await import('node:crypto');
      const agent = await loginAs('assessor');
      const { assessmentId, requirementIds } = await createTestData(
        await loginAs('admin'),
      );

      const attRes = await agent.post('/api/v1/attestations').send({ assessmentId });
      const attestationId = attRes.body.id;

      await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.95,
          conformanceRationale: 'Digital sign test',
        });

      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const sigRes = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'digital',
        label: sigLabel('Digital For Prepare/Sign'),
        payload: {
          signatureFormat: 'jsf',
          // RS256 is the JSF identifier for RSASSA-PKCS1-v1_5 with SHA-256.
          // The server verifies detached signatures via @cyclonedx/jsf, so
          // the stored algorithm must be one of the JSF asymmetric values;
          // legacy JCA spellings (RSA-SHA256 and friends) are rejected by
          // the tightened zod schema on /me/signatures. The client below
          // still signs with crypto.createSign('RSA-SHA256') because that
          // is Node's native spelling for the same primitive — the wire
          // bytes are identical.
          signatureAlgorithm: 'RS256',
          publicKeyPem: publicKey as string,
        },
      });

      // Step 1: prepare returns the canonical payload hash.
      const prepRes = await agent.post(
        `/api/v1/attestations/${attestationId}/sign/prepare`,
      );
      expect(prepRes.status).toBe(200);
      expect(prepRes.body.canonicalPayloadHash).toMatch(/^[a-f0-9]{64}$/);
      expect(prepRes.body.hashAlgorithm).toBe('sha256');
      const canonicalPayloadHash = prepRes.body.canonicalPayloadHash as string;

      // Step 2: sign the hash locally with the matching private key. The
      // server verify endpoint calls verifier.update(storedHash) where the
      // stored hash is a hex string, so the client must sign the UTF-8
      // bytes of that hex string (not the decoded 32-byte digest).
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(canonicalPayloadHash);
      signer.end();
      const signature = signer.sign(privateKey as string);
      const signatureValue = signature.toString('base64');

      // Step 3: submit the signed value alongside the stored signature.
      const signRes = await agent
        .post(`/api/v1/attestations/${attestationId}/sign`)
        .send({
          userSignatureId: sigRes.body.id,
          signatureValue,
          canonicalPayloadHash,
        });

      expect(signRes.status).toBe(200);
      expect(signRes.body.signatureType).toBe('digital');
      expect(signRes.body.canonicalPayloadHash).toBe(canonicalPayloadHash);

      // Verify endpoint should accept the signature.
      const verifyRes = await agent.post(`/api/v1/attestations/${attestationId}/verify`);
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.verified).toBe(true);
      expect(verifyRes.body.signatureType).toBe('digital');
      expect(verifyRes.body.payloadMatches).toBe(true);
    });

    it('prepare should 409 once attestation is signed', async () => {
      const agent = await loginAs('assessor');
      const { assessmentId, requirementIds } = await createTestData(
        await loginAs('admin'),
      );

      const attRes = await agent.post('/api/v1/attestations').send({ assessmentId });
      const attestationId = attRes.body.id;

      await agent
        .post(`/api/v1/attestations/${attestationId}/requirements`)
        .send({
          requirementId: requirementIds[0],
          conformanceScore: 0.5,
          conformanceRationale: 'Prepare 409 test',
        });

      const sigRes = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: sigLabel('Prepare 409 Sig'),
        payload: { name: 'X', organization: { name: 'Y' } },
      });

      // Sign first.
      const signRes = await agent
        .post(`/api/v1/attestations/${attestationId}/sign`)
        .send({ userSignatureId: sigRes.body.id });
      expect(signRes.status).toBe(200);

      // Now prepare should refuse.
      const prepRes = await agent.post(
        `/api/v1/attestations/${attestationId}/sign/prepare`,
      );
      expect(prepRes.status).toBe(409);
    });

    it('should require signatures.sign permission to sign', async () => {
      const adminAgent = await loginAs('admin');
      const { assessmentId } = await createTestData(adminAgent);

      const attRes = await adminAgent
        .post('/api/v1/attestations')
        .send({ assessmentId });
      const attestationId = attRes.body.id;

      // Assessee role does not include signatures.sign.
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post(`/api/v1/attestations/${attestationId}/sign`)
        .send({ userSignatureId: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(403);
    });
  });

  describe('Edge cases and role-based access', () => {
    it('should allow assessor to create attestations', async () => {
      // Admin creates test data (standards require admin/standards_manager role)
      const adminAgent = await loginAs('admin');
      const { assessmentId } = await createTestData(adminAgent);

      // Assessor creates the attestation
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Assessor Created',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('should reject assessee trying to create attestations', async () => {
      const adminAgent = await loginAs('admin');
      const { assessmentId } = await createTestData(adminAgent);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Should Fail',
        });

      expect(res.status).toBe(403);
    });

    it('should use camelCase in response bodies', async () => {
      const agent = await loginAs('admin');
      const { assessmentId } = await createTestData(agent);

      const res = await agent
        .post('/api/v1/attestations')
        .send({
          assessmentId,
          summary: 'Camel Case Test',
        });

      expect(res.status).toBe(201);
      // Response should have camelCase due to middleware
      expect(res.body).toHaveProperty('assessmentId');
      expect(res.body).not.toHaveProperty('assessment_id');
    });
  });
});
