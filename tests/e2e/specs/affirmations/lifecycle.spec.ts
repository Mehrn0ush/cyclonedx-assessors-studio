import { test, expect } from '../../fixtures/index.js';
import type { APIRequestContext } from '@playwright/test';
import { buildCompletedAssessment } from '../../helpers/assessment-builder.js';

/**
 * Affirmation lifecycle, signing, sealing, verification, and rescind.
 *
 * Reference (backend/src/routes/affirmations.ts and the memory
 * notes project_pr3_affirmation_design /
 * project_attestation_signature_wire_format /
 * project_jsf_canonical_hash_algo):
 *
 * Flow:
 *   1. POST /affirmations (admin) — one affirmation per assessment.
 *      A second create on the same assessment returns 409 with
 *      reason: 'already_exists'.
 *   2. POST /:id/signatories — add a slot. Pinned to a specific
 *      user (requiredUserId) or unpinned (any signatures.sign holder).
 *   3. Each signing user uploads an electronic or digital signature
 *      to their personal inventory via POST /api/v1/me/signatures
 *      (signatures.manage permission).
 *   4. POST /:id/signatories/:slotId/sign — the slot owner signs
 *      using a stored signature.
 *   5. POST /:id/seal — platform key signs the declarations and
 *      document envelopes (one configured platform key per build).
 *   6. POST /:id/verify — 3-layer report: per-slot, declarations,
 *      document. Drift is detected by re-canonicalizing each slot
 *      and comparing against the stored canonical_hash.
 *   7. POST /:id/rescind — flips the rescinded flag on a sealed
 *      affirmation; unsealed affirmations cannot be rescinded.
 *
 * Permissions (backend/src/db/seed.ts):
 *   affirmations.manage  : admin only (lifecycle ops)
 *   signatures.manage    : admin, assessor
 *   signatures.sign      : admin, assessor
 *
 * Tests here drive signing with **electronic** signatures because
 * the digital flow requires the caller to compute a SHA-256 over
 * the JSF-canonical payload bytes and sign it with a private key
 * before posting back the value. That coverage belongs in a
 * dedicated cryptography test and is out of scope for the
 * Phase 2 E2E pass.
 *
 * Drift detection is exercised at the API contract level (verify
 * surface and shape) but not by mutating the slot canonical bytes
 * to flip drifted=true — the only public-API way to do that is to
 * mutate a signed slot's required_title, which the route correctly
 * rejects with 409 once the slot is signed. The test for drifted=
 * true via direct DB mutation belongs in the backend unit suite,
 * not E2E.
 */

interface AffirmationDto {
  id: string;
  assessmentId: string;
  statement: string;
  sealedAt?: string | null;
  rescindedAt?: string | null;
  slots?: SlotDto[];
}

interface SlotDto {
  id: string;
  requiredTitle: string;
  requiredUserId?: string | null;
  signedAt?: string | null;
}

async function createElectronicSignature(api: APIRequestContext, opts: { label: string; name: string; signedName: string; role?: string; organization: string }) {
  const r = await api.post('/api/v1/me/signatures', {
    data: {
      signatureType: 'electronic',
      label: opts.label,
      payload: {
        name: opts.name,
        role: opts.role,
        organization: { name: opts.organization },
        signedName: opts.signedName,
        jurisdiction: 'CA, USA',
        legalIntent: 'I attest that the foregoing is true and correct.',
      },
    },
  });
  expect(r.status(), `create electronic signature: ${await r.text()}`).toBe(201);
  return await r.json();
}

async function buildAffirmation(api: APIRequestContext): Promise<{ assessmentId: string; affirmationId: string }> {
  const { assessmentId } = await buildCompletedAssessment(api);
  const r = await api.post('/api/v1/affirmations', {
    data: {
      assessmentId,
      statement:
        'We attest that the controls described in this assessment have been implemented and reviewed.',
    },
  });
  expect(r.status(), `create affirmation: ${await r.text()}`).toBe(201);
  const body = await r.json();
  return { assessmentId, affirmationId: (body.data as AffirmationDto).id };
}

async function addSlot(api: APIRequestContext, affirmationId: string, opts: { title: string; requiredUserId?: string }) {
  const r = await api.post(`/api/v1/affirmations/${affirmationId}/signatories`, {
    data: { requiredTitle: opts.title, requiredUserId: opts.requiredUserId },
  });
  expect(r.status(), `add slot: ${await r.text()}`).toBe(201);
  const body = await r.json();
  // The route returns the full affirmation; find the new slot by title.
  const slots = (body.data as AffirmationDto).slots ?? [];
  const slot = slots.find((s) => s.requiredTitle === opts.title);
  if (!slot) throw new Error(`slot with title ${opts.title} not found in response`);
  return slot;
}

async function signSlot(api: APIRequestContext, affirmationId: string, slotId: string, userSignatureId: string) {
  const r = await api.post(
    `/api/v1/affirmations/${affirmationId}/signatories/${slotId}/sign`,
    { data: { userSignatureId } },
  );
  expect(r.status(), `sign slot: ${await r.text()}`).toBe(200);
  return await r.json();
}

test.describe('Affirmation lifecycle @regression', () => {
  test.describe('create / edit / delete (unsealed)', () => {
    test('admin can create one affirmation per assessment', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      expect(affirmationId).toBeTruthy();
    });

    test('creating a second affirmation on the same assessment returns 409', async ({
      apiAs,
    }) => {
      const api = await apiAs('admin');
      const { assessmentId } = await buildAffirmation(api);

      const r = await api.post('/api/v1/affirmations', {
        data: { assessmentId, statement: 'duplicate' },
      });
      expect(r.status()).toBe(409);
      const body = await r.json();
      expect(body.reason).toBe('already_exists');
    });

    test('returns 404 when assessment does not exist', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const r = await api.post('/api/v1/affirmations', {
        data: {
          assessmentId: '00000000-0000-0000-0000-000000000000',
          statement: 'no assessment',
        },
      });
      expect(r.status()).toBe(404);
    });

    test('rejects missing statement with 400', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { assessmentId } = await buildCompletedAssessment(api);
      const r = await api.post('/api/v1/affirmations', {
        data: { assessmentId },
      });
      expect(r.status()).toBe(400);
    });

    test('can edit statement while unsealed', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);

      const r = await api.put(`/api/v1/affirmations/${affirmationId}`, {
        data: { statement: 'Edited attestation statement for E2E.' },
      });
      expect(r.ok()).toBeTruthy();
      const detail = await api.get(`/api/v1/affirmations/${affirmationId}`).then((r) => r.json());
      expect(detail.data.statement).toBe('Edited attestation statement for E2E.');
    });

    test('can delete an unsealed affirmation', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);

      const r = await api.delete(`/api/v1/affirmations/${affirmationId}`);
      expect(r.status()).toBe(204);
      const after = await api.get(`/api/v1/affirmations/${affirmationId}`);
      expect(after.status()).toBe(404);
    });

    test('by-assessment lookup returns 404 when no affirmation exists', async ({
      apiAs,
    }) => {
      const api = await apiAs('admin');
      const { assessmentId } = await buildCompletedAssessment(api);
      const r = await api.get(`/api/v1/affirmations/by-assessment/${assessmentId}`);
      expect(r.status()).toBe(404);
    });
  });

  test.describe('signatory slots', () => {
    test('admin can add a slot to an unsealed affirmation', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      const slot = await addSlot(api, affirmationId, { title: 'CISO' });
      expect(slot.id).toBeTruthy();
      expect(slot.signedAt).toBeFalsy();
    });

    test('can delete an unsigned slot', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      const slot = await addSlot(api, affirmationId, { title: 'Doomed slot' });

      const del = await api.delete(
        `/api/v1/affirmations/${affirmationId}/signatories/${slot.id}`,
      );
      expect([200, 204]).toContain(del.status());
    });

    test('pinning a slot to a user that does not exist returns 404', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);

      const r = await api.post(`/api/v1/affirmations/${affirmationId}/signatories`, {
        data: {
          requiredTitle: 'CFO',
          requiredUserId: '00000000-0000-0000-0000-000000000000',
        },
      });
      expect(r.status()).toBe(404);
    });
  });

  test.describe('sign → seal → verify happy path', () => {
    test('full path: add slot, sign electronically, seal, verify succeeds', async ({
      apiAs,
    }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      const slot = await addSlot(api, affirmationId, { title: 'Chief Compliance Officer' });

      // Admin (e2e_admin) uploads an electronic signature to their
      // inventory, then signs the slot with it.
      const sig = await createElectronicSignature(api, {
        label: 'E2E Admin (electronic)',
        name: 'E2E Admin',
        signedName: 'E. Admin',
        role: 'Chief Compliance Officer',
        organization: 'Acme Corporation',
      });
      await signSlot(api, affirmationId, slot.id, sig.id);

      const sealRes = await api.post(`/api/v1/affirmations/${affirmationId}/seal`);
      expect(sealRes.ok(), `seal: ${await sealRes.text()}`).toBeTruthy();

      const sealed = (await sealRes.json()).data as AffirmationDto;
      expect(sealed.sealedAt).toBeTruthy();

      const verifyRes = await api.post(`/api/v1/affirmations/${affirmationId}/verify`);
      expect(verifyRes.ok()).toBeTruthy();
      const verifyBody = await verifyRes.json();
      expect(verifyBody.verified).toBe(true);
      expect(verifyBody.declarations.valid).toBe(true);
      expect(verifyBody.document.valid).toBe(true);
      expect(verifyBody.slots).toHaveLength(1);
      expect(verifyBody.slots[0].drifted).toBe(false);
    });

    test('verify on unsealed affirmation returns 400', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      const r = await api.post(`/api/v1/affirmations/${affirmationId}/verify`);
      expect(r.status()).toBe(400);
    });

    test('signing a slot twice returns 409', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      const slot = await addSlot(api, affirmationId, { title: 'Witness' });
      const sig = await createElectronicSignature(api, {
        label: 'E2E witness sig',
        name: 'E2E Admin',
        signedName: 'E. Admin',
        organization: 'Acme Corporation',
      });
      await signSlot(api, affirmationId, slot.id, sig.id);

      const second = await api.post(
        `/api/v1/affirmations/${affirmationId}/signatories/${slot.id}/sign`,
        { data: { userSignatureId: sig.id } },
      );
      expect(second.status()).toBe(409);
    });
  });

  test.describe('seal preconditions', () => {
    test('seal fails with no_slots reason when no signatories added', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      const r = await api.post(`/api/v1/affirmations/${affirmationId}/seal`);
      expect(r.status()).toBe(409);
      const body = await r.json();
      expect(body.reason).toBe('no_slots');
    });

    test('seal fails with unsigned_slots reason when any slot is unsigned', async ({
      apiAs,
    }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      await addSlot(api, affirmationId, { title: 'Unsigned slot' });

      const r = await api.post(`/api/v1/affirmations/${affirmationId}/seal`);
      expect(r.status()).toBe(409);
      const body = await r.json();
      expect(body.reason).toBe('unsigned_slots');
      expect(Array.isArray(body.unsignedSlotIds)).toBeTruthy();
    });

    test('re-sealing a sealed affirmation returns 409', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      const slot = await addSlot(api, affirmationId, { title: 'Sole signer' });
      const sig = await createElectronicSignature(api, {
        label: 'E2E reseal sig',
        name: 'E2E Admin',
        signedName: 'E. Admin',
        organization: 'Acme Corporation',
      });
      await signSlot(api, affirmationId, slot.id, sig.id);
      await api.post(`/api/v1/affirmations/${affirmationId}/seal`);

      const reseal = await api.post(`/api/v1/affirmations/${affirmationId}/seal`);
      expect(reseal.status()).toBe(409);
    });
  });

  test.describe('sealed = immutable', () => {
    async function sealOne(api: APIRequestContext): Promise<string> {
      const { affirmationId } = await buildAffirmation(api);
      const slot = await addSlot(api, affirmationId, { title: 'CCO' });
      const sig = await createElectronicSignature(api, {
        label: `E2E sealed-immutable ${Date.now()}`,
        name: 'E2E Admin',
        signedName: 'E. Admin',
        organization: 'Acme Corporation',
      });
      await signSlot(api, affirmationId, slot.id, sig.id);
      const seal = await api.post(`/api/v1/affirmations/${affirmationId}/seal`);
      expect(seal.ok(), `seal: ${await seal.text()}`).toBeTruthy();
      return affirmationId;
    }

    test('cannot edit statement on a sealed affirmation (409)', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const id = await sealOne(api);
      const r = await api.put(`/api/v1/affirmations/${id}`, {
        data: { statement: 'Should not stick' },
      });
      expect(r.status()).toBe(409);
    });

    test('cannot delete a sealed affirmation (409)', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const id = await sealOne(api);
      const r = await api.delete(`/api/v1/affirmations/${id}`);
      expect(r.status()).toBe(409);
    });

    test('cannot add a slot to a sealed affirmation (409)', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const id = await sealOne(api);
      const r = await api.post(`/api/v1/affirmations/${id}/signatories`, {
        data: { requiredTitle: 'Late arrival' },
      });
      expect(r.status()).toBe(409);
    });
  });

  test.describe('rescind', () => {
    async function sealOne(api: APIRequestContext, sigLabel: string): Promise<string> {
      const { affirmationId } = await buildAffirmation(api);
      const slot = await addSlot(api, affirmationId, { title: 'CCO' });
      const sig = await createElectronicSignature(api, {
        label: sigLabel,
        name: 'E2E Admin',
        signedName: 'E. Admin',
        organization: 'Acme Corporation',
      });
      await signSlot(api, affirmationId, slot.id, sig.id);
      const r = await api.post(`/api/v1/affirmations/${affirmationId}/seal`);
      expect(r.ok()).toBeTruthy();
      return affirmationId;
    }

    test('can rescind a sealed affirmation with a reason', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const id = await sealOne(api, `E2E rescind ${Date.now()}`);

      const r = await api.post(`/api/v1/affirmations/${id}/rescind`, {
        data: { reason: 'Discovered an error in the underlying evidence after sealing.' },
      });
      expect(r.ok(), `rescind: ${await r.text()}`).toBeTruthy();

      const after = await api.get(`/api/v1/affirmations/${id}`).then((r) => r.json());
      expect(after.data.rescindedAt).toBeTruthy();
    });

    test('cannot rescind an unsealed affirmation (400)', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(api);
      const r = await api.post(`/api/v1/affirmations/${affirmationId}/rescind`, {
        data: { reason: 'Premature.' },
      });
      expect(r.status()).toBe(400);
    });

    test('rescinding an already-rescinded affirmation returns 409', async ({ apiAs }) => {
      const api = await apiAs('admin');
      const id = await sealOne(api, `E2E re-rescind ${Date.now()}`);
      await api.post(`/api/v1/affirmations/${id}/rescind`, {
        data: { reason: 'First rescind.' },
      });
      const second = await api.post(`/api/v1/affirmations/${id}/rescind`, {
        data: { reason: 'Second rescind, should fail.' },
      });
      expect(second.status()).toBe(409);
    });

    test('verify on a rescinded affirmation reports rescinded=true and verified=false', async ({
      apiAs,
    }) => {
      const api = await apiAs('admin');
      const id = await sealOne(api, `E2E verify-rescinded ${Date.now()}`);
      await api.post(`/api/v1/affirmations/${id}/rescind`, {
        data: { reason: 'Test rescind.' },
      });

      const r = await api.post(`/api/v1/affirmations/${id}/verify`);
      expect(r.ok()).toBeTruthy();
      const body = await r.json();
      expect(body.rescinded).toBe(true);
      expect(body.verified).toBe(false);
    });
  });

  test.describe('RBAC matrix @smoke', () => {
    test('assessor cannot create an affirmation (lacks affirmations.manage)', async ({
      apiAs,
    }) => {
      const adminApi = await apiAs('admin');
      const { assessmentId } = await buildCompletedAssessment(adminApi);

      const assessorApi = await apiAs('assessor');
      const r = await assessorApi.post('/api/v1/affirmations', {
        data: { assessmentId, statement: 'Should fail' },
      });
      expect(r.status()).toBe(403);
    });

    test('assessee cannot create an affirmation', async ({ apiAs }) => {
      const adminApi = await apiAs('admin');
      const { assessmentId } = await buildCompletedAssessment(adminApi);

      const assesseeApi = await apiAs('assessee');
      const r = await assesseeApi.post('/api/v1/affirmations', {
        data: { assessmentId, statement: 'Should fail' },
      });
      expect(r.status()).toBe(403);
    });

    test('assessor cannot seal an affirmation', async ({ apiAs }) => {
      const adminApi = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(adminApi);

      const assessorApi = await apiAs('assessor');
      const r = await assessorApi.post(`/api/v1/affirmations/${affirmationId}/seal`);
      expect(r.status()).toBe(403);
    });

    test('all roles can read an affirmation by id', async ({ apiAs }) => {
      const adminApi = await apiAs('admin');
      const { affirmationId } = await buildAffirmation(adminApi);

      for (const role of [
        'admin',
        'assessor',
        'assessee',
        'standards_manager',
        'standards_approver',
      ] as const) {
        const api = await apiAs(role);
        const r = await api.get(`/api/v1/affirmations/${affirmationId}`);
        expect(r.ok(), `${role} could not read affirmation`).toBeTruthy();
      }
    });
  });
});
