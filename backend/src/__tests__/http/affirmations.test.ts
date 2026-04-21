/**
 * Tests for /api/v1/affirmations and the cascade signing flow.
 *
 * Covers:
 *   - permission gating (affirmations.manage, signatures.sign)
 *   - CRUD on the affirmation itself
 *   - slot add, update, delete, and sign (electronic and digital)
 *   - slot pinning via requiredUserId
 *   - seal (unsigned slots, no slots, success producing both envelopes)
 *   - three-layer verify (slots, declarations envelope, document envelope)
 *   - tamper detection at each layer
 *   - rescind (400 unsealed, 409 re-rescind, verify reflects rescinded)
 *   - platform key rotation leaves historic affirmations verifiable
 *
 * The digital sign path computes the slot canonical payload on the
 * client side using the same JSF provider the server uses, so the
 * signatureValue we submit matches what the server will canonicalize
 * and verify against.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { setupHttpTests, getAgent, loginAs, testUsers } from '../helpers/http.js';
import { getSignatureProviders } from '../../signatures/index.js';

// The supertest typings for agents returned by `loginAs` and `getAgent`
// differ subtly (TestAgent vs HttpAgent in different versions of
// @types/supertest). Using a loose type alias here keeps the helpers
// compatible with both without forcing every call site to cast.
// biome-ignore lint/suspicious/noExplicitAny: test scaffolding
type HttpAgent = any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueSuffix(): string {
  return crypto.randomBytes(4).toString('hex');
}

function uniqueLabel(prefix: string): string {
  return `${prefix} ${uniqueSuffix()}`;
}

function makeRsaKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey as string, privateKeyPem: privateKey as string };
}

function electronicPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Signer',
    role: 'CISO',
    organization: {
      name: 'Acme Inc.',
    },
    signedName: 'T. Signer',
    jurisdiction: 'California, USA',
    legalIntent: 'I intend to electronically sign this statement.',
    ...overrides,
  };
}

function digitalPayload(publicKeyPem: string, overrides: Record<string, unknown> = {}) {
  return {
    signatureFormat: 'jsf',
    signatureAlgorithm: 'RS256',
    publicKeyPem,
    name: 'Digital Signer',
    role: 'CTO',
    organization: { name: 'Acme Inc.' },
    ...overrides,
  };
}

/**
 * Create a standard with one requirement, a project linked to the
 * standard, and an assessment on that project. Returns the assessment id.
 */
async function createAssessmentFixture(agent: HttpAgent): Promise<string> {
  const suffix = uniqueSuffix();

  const standardRes = await agent.post('/api/v1/standards').send({
    identifier: `AFF-STD-${suffix}`,
    name: `Affirmation Test Standard ${suffix}`,
    version: '1.0',
  });
  expect(standardRes.status).toBe(201);
  const standardId = standardRes.body.id;

  const reqRes = await agent.post(`/api/v1/standards/${standardId}/requirements`).send({
    identifier: `AFF-REQ-${suffix}`,
    name: `Affirmation Requirement ${suffix}`,
    description: 'Requirement used by affirmation cascade tests',
  });
  expect(reqRes.status).toBe(201);

  const projectRes = await agent.post('/api/v1/projects').send({
    name: `Affirmation Project ${suffix}`,
    description: 'Project for affirmation cascade tests',
    standardIds: [standardId],
  });
  expect(projectRes.status).toBe(201);

  const assessmentRes = await agent.post('/api/v1/assessments').send({
    title: `Affirmation Assessment ${suffix}`,
    description: 'Assessment for affirmation cascade tests',
    projectId: projectRes.body.id,
  });
  expect(assessmentRes.status).toBe(201);

  return assessmentRes.body.id as string;
}

/**
 * Create a stored electronic signature for the caller and return its id.
 */
async function createElectronicSignature(agent: HttpAgent, name = 'Test Signer'): Promise<string> {
  const res = await agent.post('/api/v1/me/signatures').send({
    signatureType: 'electronic',
    label: uniqueLabel('Electronic'),
    payload: electronicPayload({ name }),
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

interface DigitalSignatureFixture {
  id: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

async function createDigitalSignature(
  agent: HttpAgent,
  name = 'Digital Signer',
): Promise<DigitalSignatureFixture> {
  const { publicKeyPem, privateKeyPem } = makeRsaKeyPair();
  const res = await agent.post('/api/v1/me/signatures').send({
    signatureType: 'digital',
    label: uniqueLabel('Digital'),
    payload: digitalPayload(publicKeyPem, { name }),
  });
  expect(res.status).toBe(201);
  return { id: res.body.id as string, publicKeyPem, privateKeyPem };
}

/**
 * Build the exact canonical payload the server will compute for a slot
 * and sign it locally with the caller's private key. Returns the base64url
 * signatureValue plus the sha256 canonical hash ready to submit to
 * /sign.
 */
function signSlotLocally(args: {
  affirmationId: string;
  assessmentId: string;
  statement: string;
  slotId: string;
  requiredTitle: string;
  identity: { name: string; role?: string; organizationName: string };
  privateKeyPem: string;
  publicKeyPem: string;
  algorithm: string;
}): { signatureValue: string; canonicalPayloadHash: string } {
  const canonicalPayload = {
    affirmationId: args.affirmationId,
    assessmentId: args.assessmentId,
    statement: args.statement,
    slot: {
      id: args.slotId,
      requiredTitle: args.requiredTitle,
    },
    signatory: {
      name: args.identity.name,
      role: args.identity.role ?? null,
      organization: { name: args.identity.organizationName },
    },
  };

  const provider = getSignatureProviders().getDefault();
  const result = provider.sign(canonicalPayload, {
    algorithm: args.algorithm,
    privateKey: args.privateKeyPem,
    publicKey: args.publicKeyPem,
  });

  return {
    signatureValue: result.signatureValue,
    canonicalPayloadHash: result.canonicalHashSha256,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Affirmations HTTP Routes', () => {
  setupHttpTests();

  // -----------------------------------------------------------------------
  // Authentication and authorization
  // -----------------------------------------------------------------------
  describe('Authentication and authorization', () => {
    it('rejects unauthenticated create', async () => {
      const agent = getAgent();
      const res = await agent.post('/api/v1/affirmations').send({});
      expect(res.status).toBe(401);
    });

    it('rejects assessee from creating an affirmation (no affirmations.manage)', async () => {
      const adminAgent = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(adminAgent);

      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Not allowed',
      });
      expect(res.status).toBe(403);
    });

    it('rejects assessor from creating an affirmation (has signatures.sign but not affirmations.manage)', async () => {
      const adminAgent = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(adminAgent);

      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Assessor attempt',
      });
      expect(res.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // Create affirmation
  // -----------------------------------------------------------------------
  describe('POST /api/v1/affirmations', () => {
    it('creates an affirmation for an existing assessment', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);

      const res = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'We attest that the above controls are in place.',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.assessmentId).toBe(assessmentId);
      expect(res.body.data.statement).toBe('We attest that the above controls are in place.');
      expect(res.body.data.sealedAt).toBeNull();
      expect(res.body.data.rescindedAt).toBeNull();
      expect(res.body.data.signatories).toEqual([]);
    });

    it('returns 409 already_exists on a second create for the same assessment', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);

      const first = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'First affirmation.',
      });
      expect(first.status).toBe(201);

      const second = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Second affirmation.',
      });
      expect(second.status).toBe(409);
      expect(second.body.reason).toBe('already_exists');
      expect(second.body.affirmationId).toBe(first.body.data.id);
    });

    it('returns 404 when the assessment does not exist', async () => {
      const admin = await loginAs('admin');
      const res = await admin.post('/api/v1/affirmations').send({
        assessmentId: '00000000-0000-0000-0000-000000000000',
        statement: 'Unknown assessment.',
      });
      expect(res.status).toBe(404);
    });

    it('rejects invalid statement with 400', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const res = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: '',
      });
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------
  describe('GET /api/v1/affirmations', () => {
    it('reads an affirmation by id', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const created = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Readable affirmation.',
      });
      const affirmationId = created.body.data.id;

      const res = await admin.get(`/api/v1/affirmations/${affirmationId}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(affirmationId);
    });

    it('reads by assessment id and returns 404 when none exists', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);

      const missing = await admin.get(`/api/v1/affirmations/by-assessment/${assessmentId}`);
      expect(missing.status).toBe(404);

      await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Findable by assessment.',
      });

      const found = await admin.get(`/api/v1/affirmations/by-assessment/${assessmentId}`);
      expect(found.status).toBe(200);
      expect(found.body.data.assessmentId).toBe(assessmentId);
    });
  });

  // -----------------------------------------------------------------------
  // Update statement and delete
  // -----------------------------------------------------------------------
  describe('PUT /api/v1/affirmations/:id', () => {
    it('updates the statement on an unsealed affirmation', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const created = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Original statement.',
      });

      const res = await admin.put(`/api/v1/affirmations/${created.body.data.id}`).send({
        statement: 'Updated statement.',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.statement).toBe('Updated statement.');
    });

    it('rejects empty statement', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const created = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Original statement.',
      });

      const res = await admin.put(`/api/v1/affirmations/${created.body.data.id}`).send({
        statement: '',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/affirmations/:id', () => {
    it('deletes an unsealed affirmation with its slots', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const created = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'To delete.',
      });

      // Add a slot so the delete cascades through the signatory table.
      await admin.post(`/api/v1/affirmations/${created.body.data.id}/signatories`).send({
        requiredTitle: 'Approver',
      });

      const res = await admin.delete(`/api/v1/affirmations/${created.body.data.id}`);
      expect(res.status).toBe(204);

      const after = await admin.get(`/api/v1/affirmations/${created.body.data.id}`);
      expect(after.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Slot management
  // -----------------------------------------------------------------------
  describe('POST /api/v1/affirmations/:id/signatories', () => {
    async function seedAffirmation(admin: HttpAgent): Promise<string> {
      const assessmentId = await createAssessmentFixture(admin);
      const res = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Statement for slot tests.',
      });
      return res.body.data.id as string;
    }

    it('adds an unpinned slot', async () => {
      const admin = await loginAs('admin');
      const affirmationId = await seedAffirmation(admin);

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Chief Information Security Officer',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.requiredTitle).toBe('Chief Information Security Officer');
      expect(res.body.data.requiredUserId).toBeNull();
      expect(res.body.data.signedAt).toBeNull();
    });

    it('adds a pinned slot when requiredUserId references a real user', async () => {
      const admin = await loginAs('admin');
      const affirmationId = await seedAffirmation(admin);

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'CISO',
        requiredUserId: testUsers.assessor.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.requiredUserId).toBe(testUsers.assessor.id);
    });

    it('rejects a pinned slot whose requiredUserId does not exist', async () => {
      const admin = await loginAs('admin');
      const affirmationId = await seedAffirmation(admin);

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'CISO',
        requiredUserId: '00000000-0000-0000-0000-000000000000',
      });
      expect(res.status).toBe(400);
    });

    it('updates a slot title and pinning on an unsigned slot', async () => {
      const admin = await loginAs('admin');
      const affirmationId = await seedAffirmation(admin);

      const add = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Original Title',
      });
      const slotId = add.body.data.id;

      const upd = await admin.put(`/api/v1/affirmations/${affirmationId}/signatories/${slotId}`).send({
        requiredTitle: 'New Title',
        requiredUserId: testUsers.admin.id,
      });
      expect(upd.status).toBe(200);
      expect(upd.body.data.requiredTitle).toBe('New Title');
      expect(upd.body.data.requiredUserId).toBe(testUsers.admin.id);
    });

    it('deletes an unsigned slot', async () => {
      const admin = await loginAs('admin');
      const affirmationId = await seedAffirmation(admin);

      const add = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Doomed',
      });
      const slotId = add.body.data.id;

      const del = await admin.delete(`/api/v1/affirmations/${affirmationId}/signatories/${slotId}`);
      expect(del.status).toBe(204);
    });
  });

  // -----------------------------------------------------------------------
  // Sign slot: electronic
  // -----------------------------------------------------------------------
  describe('POST /api/v1/affirmations/:id/signatories/:slotId/sign (electronic)', () => {
    it('signs with a stored electronic signature', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Electronic sign flow.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });

      const sigId = await createElectronicSignature(admin, 'Alice Admin');

      const res = await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });

      expect(res.status).toBe(200);
      expect(res.body.data.signedAt).not.toBeNull();
      expect(res.body.data.signatoryId).not.toBeNull();
      expect(res.body.data.canonicalHash).toMatch(/^[0-9a-f]{64}$/);
      const envelope = res.body.data.signature as Record<string, unknown>;
      expect(envelope).toBeTruthy();
      const sigBlock = envelope.signature as Record<string, unknown>;
      expect(sigBlock.type).toBe('electronic');
      expect(sigBlock.signedName).toBeDefined();
    });

    it('rejects signing the same slot twice', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Electronic double sign.',
      });
      const slot = await admin.post(`/api/v1/affirmations/${aff.body.data.id}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);

      const first = await admin
        .post(`/api/v1/affirmations/${aff.body.data.id}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      expect(first.status).toBe(200);

      const second = await admin
        .post(`/api/v1/affirmations/${aff.body.data.id}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      expect(second.status).toBe(409);
    });

    it('returns 403 slot_pinned when a non-matching user attempts to sign a pinned slot', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Pinned slot statement.',
      });
      const slot = await admin.post(`/api/v1/affirmations/${aff.body.data.id}/signatories`).send({
        requiredTitle: 'CISO',
        requiredUserId: testUsers.admin.id,
      });

      // Assessor has signatures.sign but the slot is pinned to admin.
      const assessor = await loginAs('assessor');
      const sigId = await createElectronicSignature(assessor, 'Bob Assessor');

      const res = await assessor
        .post(`/api/v1/affirmations/${aff.body.data.id}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('slot_pinned');
    });

    it('returns 404 when signing with someone else signature inventory id', async () => {
      const admin = await loginAs('admin');
      const assessor = await loginAs('assessor');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Cross-user sig attempt.',
      });
      const slot = await admin.post(`/api/v1/affirmations/${aff.body.data.id}/signatories`).send({
        requiredTitle: 'Approver',
      });

      const adminSigId = await createElectronicSignature(admin);

      // Assessor logs in and tries to reference the admin's signature row.
      const res = await assessor
        .post(`/api/v1/affirmations/${aff.body.data.id}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: adminSigId });
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Sign slot: digital
  // -----------------------------------------------------------------------
  describe('POST /api/v1/affirmations/:id/signatories/:slotId/sign (digital)', () => {
    it('requires signatureValue for digital signatures', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Digital missing value.',
      });
      const slot = await admin.post(`/api/v1/affirmations/${aff.body.data.id}/signatories`).send({
        requiredTitle: 'CISO',
      });
      const digital = await createDigitalSignature(admin);

      const res = await admin
        .post(`/api/v1/affirmations/${aff.body.data.id}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: digital.id });
      expect(res.status).toBe(400);
    });

    it('prepare returns a canonical payload hash', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Prepare hash.',
      });
      const slot = await admin.post(`/api/v1/affirmations/${aff.body.data.id}/signatories`).send({
        requiredTitle: 'CISO',
      });
      const digital = await createDigitalSignature(admin);

      const res = await admin
        .post(`/api/v1/affirmations/${aff.body.data.id}/signatories/${slot.body.data.id}/sign/prepare`)
        .send({ userSignatureId: digital.id });

      expect(res.status).toBe(200);
      expect(res.body.canonicalPayloadHash).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.hashAlgorithm).toBe('sha256');
      expect(res.body.affirmationId).toBe(aff.body.data.id);
      expect(res.body.slotId).toBe(slot.body.data.id);
    });

    it('signs the slot with a locally computed signatureValue and the value verifies later', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Digital end-to-end.',
      });
      const affirmationId = aff.body.data.id;
      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'CTO',
      });
      const digital = await createDigitalSignature(admin, 'Dana Digital');

      const { signatureValue, canonicalPayloadHash } = signSlotLocally({
        affirmationId,
        assessmentId,
        statement: 'Digital end-to-end.',
        slotId: slot.body.data.id,
        requiredTitle: 'CTO',
        identity: { name: 'Dana Digital', role: 'CTO', organizationName: 'Acme Inc.' },
        privateKeyPem: digital.privateKeyPem,
        publicKeyPem: digital.publicKeyPem,
        algorithm: 'RS256',
      });

      const signRes = await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({
          userSignatureId: digital.id,
          signatureValue,
          canonicalPayloadHash,
        });

      expect(signRes.status).toBe(200);
      expect(signRes.body.data.signedAt).not.toBeNull();
      const sigBlock = (signRes.body.data.signature as { signature: Record<string, unknown> }).signature;
      expect(sigBlock.type).toBe('digital');
      expect(sigBlock.algorithm).toBe('RS256');
      expect(sigBlock.value).toBe(signatureValue);
    });
  });

  // -----------------------------------------------------------------------
  // Seal
  // -----------------------------------------------------------------------
  describe('POST /api/v1/affirmations/:id/seal', () => {
    it('returns 409 no_slots when no signatories have been added', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Empty seal.',
      });

      const res = await admin.post(`/api/v1/affirmations/${aff.body.data.id}/seal`).send({});
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('no_slots');
    });

    it('returns 409 unsigned_slots when at least one slot is unsigned', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Partial seal.',
      });
      const affirmationId = aff.body.data.id;

      const slot1 = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Second Approver',
      });

      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot1.body.data.id}/sign`)
        .send({ userSignatureId: sigId });

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('unsigned_slots');
      expect(Array.isArray(res.body.unsignedSlotIds)).toBe(true);
      expect(res.body.unsignedSlotIds.length).toBe(1);
    });

    it('seals successfully and produces both envelopes', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Full seal.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});
      expect(res.status).toBe(200);
      expect(res.body.data.sealedAt).not.toBeNull();
      expect(res.body.data.canonicalHash).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.data.platformKeyFingerprint).toMatch(/^[0-9a-f]+$/);
      expect(res.body.data.declarationsSignature).toBeTruthy();
      expect(res.body.data.documentSignature).toBeTruthy();
    });

    it('blocks mutations to a sealed affirmation', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Sealed immutability.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      const seal = await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});
      expect(seal.status).toBe(200);

      const putRes = await admin.put(`/api/v1/affirmations/${affirmationId}`).send({
        statement: 'Should not be editable.',
      });
      expect(putRes.status).toBe(409);
      expect(putRes.body.reason).toBe('sealed');

      const delRes = await admin.delete(`/api/v1/affirmations/${affirmationId}`);
      expect(delRes.status).toBe(409);
      expect(delRes.body.reason).toBe('sealed');

      const reseal = await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});
      expect(reseal.status).toBe(409);
    });
  });

  // -----------------------------------------------------------------------
  // Verify: three layers
  // -----------------------------------------------------------------------
  describe('POST /api/v1/affirmations/:id/verify', () => {
    it('returns 400 when the affirmation is not sealed', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Not yet sealed.',
      });
      const res = await admin.post(`/api/v1/affirmations/${aff.body.data.id}/verify`).send({});
      expect(res.status).toBe(400);
    });

    it('returns a three-layer valid report after sealing an electronic slot', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Electronic verify.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/verify`).send({});
      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
      expect(res.body.rescinded).toBe(false);
      expect(res.body.declarations.valid).toBe(true);
      expect(res.body.document.valid).toBe(true);
      expect(Array.isArray(res.body.slots)).toBe(true);
      expect(res.body.slots[0].valid).toBe(true);
      expect(res.body.issues).toEqual([]);
    });

    it('verifies cleanly with a digital slot signed out-of-band', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Digital verify.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'CTO',
      });
      const digital = await createDigitalSignature(admin, 'Dana Digital');
      const { signatureValue, canonicalPayloadHash } = signSlotLocally({
        affirmationId,
        assessmentId,
        statement: 'Digital verify.',
        slotId: slot.body.data.id,
        requiredTitle: 'CTO',
        identity: { name: 'Dana Digital', role: 'CTO', organizationName: 'Acme Inc.' },
        privateKeyPem: digital.privateKeyPem,
        publicKeyPem: digital.publicKeyPem,
        algorithm: 'RS256',
      });
      const signRes = await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({
          userSignatureId: digital.id,
          signatureValue,
          canonicalPayloadHash,
        });
      expect(signRes.status).toBe(200);

      await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/verify`).send({});
      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
      expect(res.body.slots[0].signatureType).toBe('digital');
      expect(res.body.slots[0].valid).toBe(true);
    });

    it('detects declarations envelope tampering', async () => {
      // Build a sealed affirmation, then mutate the stored declarations
      // envelope's publicly visible statement field in the DB. The
      // declarations signature should no longer verify.
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Tamper declarations.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});

      // Pull the stored declarations envelope and mutate the statement
      // inside it. The signature value was computed over the original
      // statement, so mutating the envelope payload should invalidate it.
      const { getDatabase } = await import('../../db/connection.js');
      const db = getDatabase();
      const row = (await db
        .selectFrom('affirmation')
        .where('id', '=', affirmationId)
        .select(['declarations_signature_json'])
        .executeTakeFirstOrThrow()) as { declarations_signature_json: unknown };
      const envelope = row.declarations_signature_json as Record<string, unknown>;
      envelope.statement = 'Tampered after seal.';
      await db
        .updateTable('affirmation')
        .set({ declarations_signature_json: JSON.stringify(envelope) })
        .where('id', '=', affirmationId)
        .execute();

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/verify`).send({});
      expect(res.status).toBe(200);
      expect(res.body.declarations.valid).toBe(false);
      expect(res.body.verified).toBe(false);
      expect(res.body.issues.join(' ')).toMatch(/Declarations signature did not verify/i);
    });

    it('detects document envelope tampering', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Tamper document.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});

      const { getDatabase } = await import('../../db/connection.js');
      const db = getDatabase();
      const row = (await db
        .selectFrom('affirmation')
        .where('id', '=', affirmationId)
        .select(['document_signature_json'])
        .executeTakeFirstOrThrow()) as { document_signature_json: unknown };
      const envelope = row.document_signature_json as Record<string, unknown>;
      envelope.sealedAt = new Date('2000-01-01').toISOString();
      await db
        .updateTable('affirmation')
        .set({ document_signature_json: JSON.stringify(envelope) })
        .where('id', '=', affirmationId)
        .execute();

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/verify`).send({});
      expect(res.body.document.valid).toBe(false);
      expect(res.body.verified).toBe(false);
      expect(res.body.issues.join(' ')).toMatch(/Document signature did not verify/i);
    });

    it('detects slot canonical payload drift via the statement column', async () => {
      // Mutating the statement column after sealing simulates a drift
      // between the stored affirmation and what the slot was signed
      // against. The slot's canonicalHash was pinned at sign time.
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Drift detection.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});

      const { getDatabase } = await import('../../db/connection.js');
      const db = getDatabase();
      await db
        .updateTable('affirmation')
        .set({ statement: 'Statement drifted after seal.' })
        .where('id', '=', affirmationId)
        .execute();

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/verify`).send({});
      expect(res.body.slots[0].drifted).toBe(true);
      expect(res.body.slots[0].valid).toBe(false);
      expect(res.body.verified).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Rescind
  // -----------------------------------------------------------------------
  describe('POST /api/v1/affirmations/:id/rescind', () => {
    it('returns 400 when the affirmation is not sealed', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Rescind unsealed.',
      });
      const res = await admin.post(`/api/v1/affirmations/${aff.body.data.id}/rescind`).send({
        reason: 'Any reason.',
      });
      expect(res.status).toBe(400);
    });

    it('rescinds a sealed affirmation and returns 409 on re-rescind', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Rescind sealed.',
      });
      const affirmationId = aff.body.data.id;
      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});

      const first = await admin.post(`/api/v1/affirmations/${affirmationId}/rescind`).send({
        reason: 'Data withdrawn by assessor.',
      });
      expect(first.status).toBe(200);

      const second = await admin.post(`/api/v1/affirmations/${affirmationId}/rescind`).send({
        reason: 'Trying again.',
      });
      expect(second.status).toBe(409);

      const verify = await admin.post(`/api/v1/affirmations/${affirmationId}/verify`).send({});
      expect(verify.status).toBe(200);
      expect(verify.body.rescinded).toBe(true);
      expect(verify.body.verified).toBe(false);
      expect(verify.body.issues.join(' ')).toMatch(/rescinded/i);
    });

    it('requires a reason', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Reason required.',
      });
      const affirmationId = aff.body.data.id;
      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});

      const res = await admin.post(`/api/v1/affirmations/${affirmationId}/rescind`).send({});
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // Platform key rotation and historic verification
  // -----------------------------------------------------------------------
  describe('Platform key rotation', () => {
    it('verifies an affirmation sealed with the previous key after rotation', async () => {
      const admin = await loginAs('admin');
      const assessmentId = await createAssessmentFixture(admin);
      const aff = await admin.post('/api/v1/affirmations').send({
        assessmentId,
        statement: 'Key rotation survives.',
      });
      const affirmationId = aff.body.data.id;

      const slot = await admin.post(`/api/v1/affirmations/${affirmationId}/signatories`).send({
        requiredTitle: 'Approver',
      });
      const sigId = await createElectronicSignature(admin);
      await admin
        .post(`/api/v1/affirmations/${affirmationId}/signatories/${slot.body.data.id}/sign`)
        .send({ userSignatureId: sigId });
      const sealRes = await admin.post(`/api/v1/affirmations/${affirmationId}/seal`).send({});
      expect(sealRes.status).toBe(200);
      const oldFingerprint = sealRes.body.data.platformKeyFingerprint as string;

      const rotate = await admin.post('/api/v1/admin/platform-keys/rotate').send({});
      expect(rotate.status).toBe(201);
      expect(rotate.body.data.fingerprint).not.toBe(oldFingerprint);

      const verify = await admin.post(`/api/v1/affirmations/${affirmationId}/verify`).send({});
      expect(verify.status).toBe(200);
      expect(verify.body.verified).toBe(true);
      expect(verify.body.platformKeyFingerprint).toBe(oldFingerprint);
      expect(verify.body.declarations.valid).toBe(true);
      expect(verify.body.document.valid).toBe(true);
    });
  });
});
