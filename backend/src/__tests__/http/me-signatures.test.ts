/**
 * Tests for /api/v1/me/signatures.
 *
 * Covers the caller-owned signature inventory: auth + permissions,
 * CRUD of electronic and digital signatures, payload decryption on
 * read, BOLA isolation between users, rejection of private-key
 * material and malformed PEM, and the image upload/fetch/delete
 * cycle on electronic signatures.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { setupHttpTests, getAgent, loginAs } from '../helpers/http.js';

// The user_signature table has a UNIQUE (user_id, label) constraint.
// Tests that create multiple signatures for the same user must use
// distinct labels — generate a short random suffix per call to keep
// them collision-free across the whole test file.
function uniqueLabel(prefix: string): string {
  return `${prefix} ${crypto.randomBytes(4).toString('hex')}`;
}

// Valid 1x1 transparent PNG. 67 bytes. Keeps the JSON body tiny and
// the magic bytes let verifyAttachmentMimeType resolve image/png.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUeJxjYAAAAAIAAUivpHEAAAAASUVORK5CYII=';

// Generate a fresh RSA key pair for each test run. Keeps the test
// hermetic and avoids any checked-in key material.
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
      address: {
        country: 'US',
        region: 'CA',
        locality: 'San Francisco',
        streetAddress: '1 Market St',
        postalCode: '94105',
      },
      url: ['https://acme.example.com'],
    },
    signedName: 'T. Signer',
    jurisdiction: 'California, USA',
    legalIntent: 'I intend to electronically sign this document.',
    ...overrides,
  };
}

describe('My Signatures HTTP Routes', () => {
  setupHttpTests();

  // -------------------------------------------------------------------------
  // Authentication and authorization
  // -------------------------------------------------------------------------
  describe('Authentication and authorization', () => {
    it('should require authentication for list', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/me/signatures');
      expect(res.status).toBe(401);
    });

    it('should require authentication for create', async () => {
      const agent = getAgent();
      const res = await agent.post('/api/v1/me/signatures').send({});
      expect(res.status).toBe(401);
    });

    it('should reject callers without signatures.manage permission', async () => {
      // assessee role intentionally has no signatures.* permissions.
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.get('/api/v1/me/signatures');
      expect(res.status).toBe(403);
    });

    it('should allow admin (full permission set)', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/me/signatures');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should allow assessor (role seeded with signatures.manage)', async () => {
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.get('/api/v1/me/signatures');
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Create: electronic
  // -------------------------------------------------------------------------
  describe('POST /api/v1/me/signatures (electronic)', () => {
    it('should create an electronic signature', async () => {
      const agent = await loginAs('assessor');
      const label = uniqueLabel('Primary Electronic');
      const res = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label,
        payload: electronicPayload(),
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.signatureType).toBe('electronic');
      expect(res.body.label).toBe(label);
      expect(res.body.backendType).toBe('local');
      expect(res.body.signatureFormat).toBeNull();
      expect(res.body.keyFingerprint).toBeNull();
      // Payload should round-trip through encryption and come back
      // decrypted in the response body.
      expect(res.body.payload.name).toBe('Test Signer');
      expect(res.body.payload.organization.name).toBe('Acme Inc.');
      expect(res.body.image).toBeNull();
    });

    it('should reject electronic payload missing organization.name', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('Missing Org'),
        payload: {
          name: 'Test Signer',
          organization: { name: '' },
        },
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing label', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        payload: electronicPayload(),
      });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Create: digital
  // -------------------------------------------------------------------------
  describe('POST /api/v1/me/signatures (digital)', () => {
    it('should create a digital signature with valid public key', async () => {
      const agent = await loginAs('assessor');
      const { publicKeyPem } = makeRsaKeyPair();

      const res = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'digital',
        label: uniqueLabel('Primary Digital'),
        payload: {
          signatureFormat: 'jsf',
          signatureAlgorithm: 'RS256',
          publicKeyPem,
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.signatureType).toBe('digital');
      expect(res.body.signatureFormat).toBe('jsf');
      expect(res.body.keyFingerprint).toBeDefined();
      expect(res.body.keyFingerprint).toMatch(/^[a-f0-9]{64}$/);
      // Public key should be returned to the caller as-is. The stored
      // copy on the server is encrypted.
      expect(res.body.payload.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    });

    it('should reject private key material', async () => {
      const agent = await loginAs('assessor');
      const { privateKeyPem } = makeRsaKeyPair();

      const res = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'digital',
        label: uniqueLabel('Private Key Attempt'),
        payload: {
          signatureFormat: 'jsf',
          signatureAlgorithm: 'RS256',
          publicKeyPem: privateKeyPem,
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/[Pp]rivate key/);
    });

    it('should reject malformed PEM', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'digital',
        label: uniqueLabel('Malformed PEM'),
        payload: {
          signatureFormat: 'jsf',
          signatureAlgorithm: 'RS256',
          publicKeyPem: '-----BEGIN PUBLIC KEY-----\nnot-a-real-key\n-----END PUBLIC KEY-----',
        },
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid public key PEM/);
    });

    it('should reject unknown signatureFormat', async () => {
      const agent = await loginAs('assessor');
      const { publicKeyPem } = makeRsaKeyPair();

      const res = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'digital',
        label: uniqueLabel('Bad Format'),
        payload: {
          signatureFormat: 'bogus',
          signatureAlgorithm: 'RS256',
          publicKeyPem,
        },
      });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------
  describe('GET /api/v1/me/signatures', () => {
    it('should return only the caller signatures (BOLA isolation)', async () => {
      const admin = await loginAs('admin');
      const assessor = await loginAs('assessor');

      // Each user creates one signature.
      const adminSig = await admin.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('Admin Sig'),
        payload: electronicPayload({ name: 'Admin User' }),
      });
      expect(adminSig.status).toBe(201);

      const assessorSig = await assessor.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('Assessor Sig'),
        payload: electronicPayload({ name: 'Assessor User' }),
      });
      expect(assessorSig.status).toBe(201);

      // Each list call returns only that caller's rows. We match on
      // id because earlier tests in the suite may have seeded
      // additional rows for the same user.
      const adminList = await admin.get('/api/v1/me/signatures');
      expect(adminList.status).toBe(200);
      expect(adminList.body.data.some((s: { id: string }) => s.id === adminSig.body.id)).toBe(true);
      expect(adminList.body.data.some((s: { id: string }) => s.id === assessorSig.body.id)).toBe(false);

      const assessorList = await assessor.get('/api/v1/me/signatures');
      expect(assessorList.body.data.some((s: { id: string }) => s.id === assessorSig.body.id)).toBe(true);
      expect(assessorList.body.data.some((s: { id: string }) => s.id === adminSig.body.id)).toBe(false);
    });

    it('GET /:id should return 404 when row belongs to another user', async () => {
      const admin = await loginAs('admin');
      const assessor = await loginAs('assessor');

      const created = await admin.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('Admin Protected'),
        payload: electronicPayload(),
      });
      const sigId = created.body.id;

      const res = await assessor.get(`/api/v1/me/signatures/${sigId}`);
      expect(res.status).toBe(404);
    });

    it('GET /:id should return decrypted payload for owner', async () => {
      const agent = await loginAs('assessor');
      const created = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('Fetched By Id'),
        payload: electronicPayload({ name: 'Readback Signer' }),
      });

      const res = await agent.get(`/api/v1/me/signatures/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.payload.name).toBe('Readback Signer');
      expect(res.body.payload.organization.name).toBe('Acme Inc.');
    });
  });

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  describe('PUT /api/v1/me/signatures/:id', () => {
    it('should update the label', async () => {
      const agent = await loginAs('assessor');
      const newLabel = uniqueLabel('New Label');
      const created = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('Old Label'),
        payload: electronicPayload(),
      });

      const res = await agent
        .put(`/api/v1/me/signatures/${created.body.id}`)
        .send({ label: newLabel });

      expect(res.status).toBe(200);
      expect(res.body.label).toBe(newLabel);
      // Payload should be preserved when only label is sent.
      expect(res.body.payload.name).toBe('Test Signer');
    });

    it('should merge partial payload updates', async () => {
      const agent = await loginAs('assessor');
      const created = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('To Merge'),
        payload: electronicPayload(),
      });

      const res = await agent
        .put(`/api/v1/me/signatures/${created.body.id}`)
        .send({
          payload: { jurisdiction: 'New York, USA' },
        });

      expect(res.status).toBe(200);
      expect(res.body.payload.jurisdiction).toBe('New York, USA');
      // Other payload fields should survive the partial update.
      expect(res.body.payload.name).toBe('Test Signer');
      expect(res.body.payload.organization.name).toBe('Acme Inc.');
    });

    it('should reject private key on payload update of a digital signature', async () => {
      const agent = await loginAs('assessor');
      const { publicKeyPem, privateKeyPem } = makeRsaKeyPair();

      const created = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'digital',
        label: uniqueLabel('Digital For Update'),
        payload: { signatureFormat: 'jsf', signatureAlgorithm: 'RS256', publicKeyPem },
      });

      // Include signatureFormat + signatureAlgorithm so the update
      // schema routes this body through the digital partial branch of
      // its union (otherwise unknown keys get stripped before the
      // private-key check can fire).
      const res = await agent
        .put(`/api/v1/me/signatures/${created.body.id}`)
        .send({
          payload: {
            signatureFormat: 'jsf',
            signatureAlgorithm: 'RS256',
            publicKeyPem: privateKeyPem,
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/[Pp]rivate key/);
    });

    it('should 404 when updating another user signature', async () => {
      const admin = await loginAs('admin');
      const assessor = await loginAs('assessor');

      const adminSig = await admin.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('Admin Owned'),
        payload: electronicPayload(),
      });

      const res = await assessor
        .put(`/api/v1/me/signatures/${adminSig.body.id}`)
        .send({ label: 'Hijack Attempt' });

      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  describe('DELETE /api/v1/me/signatures/:id', () => {
    it('should delete own signature', async () => {
      const agent = await loginAs('assessor');
      const created = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('To Delete'),
        payload: electronicPayload(),
      });

      const delRes = await agent.delete(`/api/v1/me/signatures/${created.body.id}`);
      expect(delRes.status).toBe(204);

      const getRes = await agent.get(`/api/v1/me/signatures/${created.body.id}`);
      expect(getRes.status).toBe(404);
    });

    it('should 404 when deleting another user signature', async () => {
      const admin = await loginAs('admin');
      const assessor = await loginAs('assessor');

      const adminSig = await admin.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('Admin Owned'),
        payload: electronicPayload(),
      });

      const res = await assessor.delete(`/api/v1/me/signatures/${adminSig.body.id}`);
      expect(res.status).toBe(404);

      // Confirm the row is still reachable by the real owner.
      const stillThere = await admin.get(`/api/v1/me/signatures/${adminSig.body.id}`);
      expect(stillThere.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Image upload/fetch/delete
  // -------------------------------------------------------------------------
  describe('Signature image endpoints', () => {
    async function createElectronic(agent: Awaited<ReturnType<typeof loginAs>>) {
      const res = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'electronic',
        label: uniqueLabel('With Image'),
        payload: electronicPayload(),
      });
      expect(res.status).toBe(201);
      return res.body.id as string;
    }

    it('should upload, fetch, and delete an image on an electronic signature', async () => {
      const agent = await loginAs('assessor');
      const sigId = await createElectronic(agent);

      // Upload.
      const uploadRes = await agent.post(`/api/v1/me/signatures/${sigId}/image`).send({
        filename: 'signature.png',
        contentType: 'image/png',
        binaryContent: PNG_BASE64,
      });
      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.image.filename).toBe('signature.png');
      expect(uploadRes.body.image.contentType).toBe('image/png');
      expect(uploadRes.body.image.contentHash).toMatch(/^[a-f0-9]{64}$/);

      // Fetch bytes back.
      const fetchRes = await agent
        .get(`/api/v1/me/signatures/${sigId}/image`)
        .buffer(true)
        .parse((res: unknown, cb: (err: Error | null, body: Buffer) => void) => {
          const chunks: Buffer[] = [];
          (res as NodeJS.ReadableStream).on('data', (chunk: Buffer) => chunks.push(chunk));
          (res as NodeJS.ReadableStream).on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.headers['content-type']).toContain('image/png');
      expect(Buffer.isBuffer(fetchRes.body)).toBe(true);
      // First 8 bytes of the response should match the PNG magic.
      const magic = (fetchRes.body as Buffer).subarray(0, 8);
      expect(magic.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);

      // Metadata on the signature row should surface in list/get.
      const getRes = await agent.get(`/api/v1/me/signatures/${sigId}`);
      expect(getRes.body.image).not.toBeNull();
      expect(getRes.body.image.contentType).toBe('image/png');

      // Delete the image.
      const delRes = await agent.delete(`/api/v1/me/signatures/${sigId}/image`);
      expect(delRes.status).toBe(204);

      // Metadata should now be null.
      const afterRes = await agent.get(`/api/v1/me/signatures/${sigId}`);
      expect(afterRes.body.image).toBeNull();

      // And the image endpoint should 404.
      const missingRes = await agent.get(`/api/v1/me/signatures/${sigId}/image`);
      expect(missingRes.status).toBe(404);
    });

    it('should reject image upload on a digital signature', async () => {
      const agent = await loginAs('assessor');
      const { publicKeyPem } = makeRsaKeyPair();

      const created = await agent.post('/api/v1/me/signatures').send({
        signatureType: 'digital',
        label: uniqueLabel('No Image Here'),
        payload: { signatureFormat: 'jsf', signatureAlgorithm: 'RS256', publicKeyPem },
      });

      const res = await agent.post(`/api/v1/me/signatures/${created.body.id}/image`).send({
        filename: 'nope.png',
        contentType: 'image/png',
        binaryContent: PNG_BASE64,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/electronic/i);
    });

    it('should reject image bytes that do not match the claimed MIME type', async () => {
      const agent = await loginAs('assessor');
      const sigId = await createElectronic(agent);

      // Plain text bytes claiming to be image/png. The magic-byte
      // sniffer should reject with 415.
      const res = await agent.post(`/api/v1/me/signatures/${sigId}/image`).send({
        filename: 'not-really.png',
        contentType: 'image/png',
        binaryContent: Buffer.from('this is not a png').toString('base64'),
      });

      expect(res.status).toBe(415);
    });

    it('should isolate image access between users', async () => {
      const admin = await loginAs('admin');
      const assessor = await loginAs('assessor');

      const adminSigId = await createElectronic(admin);
      await admin.post(`/api/v1/me/signatures/${adminSigId}/image`).send({
        filename: 'admin-signature.png',
        contentType: 'image/png',
        binaryContent: PNG_BASE64,
      });

      // Assessor should see a 404 for admin's image route, not the bytes.
      const res = await assessor.get(`/api/v1/me/signatures/${adminSigId}/image`);
      expect(res.status).toBe(404);
    });
  });
});
