/**
 * Regression tests for Sprint 5.7 symmetric claim / attestation
 * retention lock. This mirrors the Sprint 4.9+ `evidence-retention`
 * suite but moves up one level in the declaration record hierarchy.
 *
 * Domain rules enforced by `utils/retention.ts`:
 *   - An attestation is immutable once `signed_at` is non-null, or once
 *     its parent assessment is in a terminal state.
 *   - A claim is immutable once it is cited by any signed attestation
 *     (directly via `claim.attestation_id`, or through the
 *     `attestation_requirement_claim` and
 *     `attestation_requirement_counter_claim` junction tables), or
 *     once its parent assessment is terminal.
 *
 * Immutability is a record-integrity rule, not an authorization rule:
 * admins are bound too. The enforcement layer returns 409 Conflict
 * with a `reason` so the client can distinguish retention from 403 and
 * 404.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  setupHttpTests,
  loginAs,
  testUsers,
} from '../helpers/http.js';

interface AttestationFixture {
  attestationId: string;
  assessmentId: string;
  requirementId: string;
  signatoryId: string;
}

interface ClaimFixture {
  claimId: string;
  attestationId: string;
  assessmentId: string;
}

async function seedAttestationFixture(opts: {
  signed: boolean;
  assessmentState: 'in_progress' | 'complete' | 'archived' | 'cancelled';
  label: string;
}): Promise<AttestationFixture> {
  const { getDatabase } = await import('../../db/connection.js');
  const db = getDatabase();

  const projectId = uuidv4();
  await db.insertInto('project').values({
    id: projectId,
    name: `Ret fixture project (${opts.label})`,
    state: 'in_progress',
    workflow_type: 'evidence_driven',
  }).execute();

  const standardId = uuidv4();
  await db.insertInto('standard').values({
    id: standardId,
    identifier: `STD-RET-ATT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Ret fixture standard (${opts.label})`,
    state: 'published',
    is_imported: false,
  }).execute();

  const requirementId = uuidv4();
  await db.insertInto('requirement').values({
    id: requirementId,
    identifier: `R-RET-ATT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Ret fixture requirement (${opts.label})`,
    standard_id: standardId,
  }).execute();

  const assessmentId = uuidv4();
  await db.insertInto('assessment').values({
    id: assessmentId,
    title: `Ret fixture assessment (${opts.label})`,
    state: opts.assessmentState,
    project_id: projectId,
    standard_id: standardId,
  }).execute();

  const signatoryId = uuidv4();
  await db.insertInto('signatory').values({
    id: signatoryId,
    name: `Ret fixture signatory (${opts.label})`,
  }).execute();

  const attestationId = uuidv4();
  // Build the insert manually; signed_at is the load-bearing retention
  // flag so we either leave it null (unsigned fixtures) or stamp it now.
  await db.insertInto('attestation').values({
    id: attestationId,
    summary: `Ret fixture attestation (${opts.label})`,
    assessment_id: assessmentId,
    signatory_id: opts.signed ? signatoryId : null,
    ...(opts.signed ? { signed_at: new Date() } : {}),
  }).execute();

  return { attestationId, assessmentId, requirementId, signatoryId };
}

async function seedClaimFixture(opts: {
  linkage: 'direct_signed' | 'map_claim_signed' | 'map_counter_claim_signed';
  label: string;
}): Promise<ClaimFixture> {
  const { getDatabase } = await import('../../db/connection.js');
  const db = getDatabase();

  const parent = await seedAttestationFixture({
    signed: true,
    assessmentState: 'in_progress',
    label: opts.label,
  });

  const claimId = uuidv4();
  await db.insertInto('claim').values({
    id: claimId,
    name: `Ret fixture claim (${opts.label})`,
    target: 'fixture target',
    predicate: 'conformsTo',
    is_counter_claim: opts.linkage === 'map_counter_claim_signed',
    // Only wire the attestation_id column when we want the direct link
    // retention case. The map linkages use the junction tables below,
    // not the FK column, which mirrors how the CycloneDX schema allows
    // free-floating claims referenced from the attestation map.
    attestation_id: opts.linkage === 'direct_signed' ? parent.attestationId : null,
  }).execute();

  if (opts.linkage !== 'direct_signed') {
    const attReqId = uuidv4();
    await db.insertInto('attestation_requirement').values({
      id: attReqId,
      attestation_id: parent.attestationId,
      requirement_id: parent.requirementId,
      conformance_score: 1,
      conformance_rationale: 'fixture',
    }).execute();

    const junction = opts.linkage === 'map_claim_signed'
      ? 'attestation_requirement_claim'
      : 'attestation_requirement_counter_claim';
    await db.insertInto(junction).values({
      attestation_requirement_id: attReqId,
      claim_id: claimId,
      created_at: new Date(),
    }).execute();
  }

  return {
    claimId,
    attestationId: parent.attestationId,
    assessmentId: parent.assessmentId,
  };
}

describe('Attestation and claim retention regressions (Sprint 5.7)', () => {
  setupHttpTests();

  let attFixtures: {
    signed: AttestationFixture;
    completeAssessment: AttestationFixture;
    archivedAssessment: AttestationFixture;
    cancelledAssessment: AttestationFixture;
    unsigned: AttestationFixture;
  };

  let claimFixtures: {
    directSigned: ClaimFixture;
    mapClaimSigned: ClaimFixture;
    mapCounterClaimSigned: ClaimFixture;
    unused: ClaimFixture;
  };

  beforeAll(async () => {
    attFixtures = {
      signed: await seedAttestationFixture({ signed: true, assessmentState: 'in_progress', label: 'signed' }),
      completeAssessment: await seedAttestationFixture({ signed: false, assessmentState: 'complete', label: 'complete' }),
      archivedAssessment: await seedAttestationFixture({ signed: false, assessmentState: 'archived', label: 'archived' }),
      cancelledAssessment: await seedAttestationFixture({ signed: false, assessmentState: 'cancelled', label: 'cancelled' }),
      unsigned: await seedAttestationFixture({ signed: false, assessmentState: 'in_progress', label: 'unsigned' }),
    };

    claimFixtures = {
      directSigned: await seedClaimFixture({ linkage: 'direct_signed', label: 'direct' }),
      mapClaimSigned: await seedClaimFixture({ linkage: 'map_claim_signed', label: 'map_claim' }),
      mapCounterClaimSigned: await seedClaimFixture({ linkage: 'map_counter_claim_signed', label: 'map_counter' }),
      unused: await (async () => {
        // An unsigned parent attestation does not lock the claim even
        // though the claim is wired through the attestation_id FK; this
        // is the baseline that should remain mutable so we can confirm
        // the routes still work for the non-locked case.
        const { getDatabase } = await import('../../db/connection.js');
        const db = getDatabase();
        const parent = await seedAttestationFixture({ signed: false, assessmentState: 'in_progress', label: 'unused_claim_parent' });
        const claimId = uuidv4();
        await db.insertInto('claim').values({
          id: claimId,
          name: 'Ret fixture claim (unused)',
          target: 'fixture target',
          predicate: 'conformsTo',
          is_counter_claim: false,
          attestation_id: parent.attestationId,
        }).execute();
        return { claimId, attestationId: parent.attestationId, assessmentId: parent.assessmentId };
      })(),
    };
  });

  // Note on coverage of caller identity: `testUsers.admin` holds every
  // permission, which is the exact caller profile the pre-Sprint-5.7
  // code quietly waved through for edits and deletes. Asserting that
  // admin still gets 409 here is the whole point of the symmetric
  // retention lock.
  const _adminUser = () => testUsers.admin;

  describe('signed attestation is locked for admin', () => {
    it('PUT /attestations/:id returns 409 with reason=signed', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/attestations/${attFixtures.signed.attestationId}`)
        .send({ summary: 'Tampered' });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('signed');
    });

    it('POST /attestations/:id/requirements returns 409 with reason=signed', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post(`/api/v1/attestations/${attFixtures.signed.attestationId}/requirements`)
        .send({
          requirementId: attFixtures.signed.requirementId,
          conformanceScore: 0.5,
          conformanceRationale: 'tampered',
        });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('signed');
    });

    it('PUT /attestations/:id/requirements/:rid returns 409 when requirement exists', async () => {
      // Seed the requirement link first on a fresh unsigned attestation,
      // then sign that attestation directly in the DB so we reach the
      // PUT requirement path with a retention-locked parent. The route
      // has to fetch the attestation_requirement row first, so it has
      // to exist for the retention check to fire.
      const { getDatabase } = await import('../../db/connection.js');
      const db = getDatabase();
      const fixture = await seedAttestationFixture({
        signed: false,
        assessmentState: 'in_progress',
        label: 'sign_after_req',
      });
      await db.insertInto('attestation_requirement').values({
        id: uuidv4(),
        attestation_id: fixture.attestationId,
        requirement_id: fixture.requirementId,
        conformance_score: 1,
        conformance_rationale: 'fixture',
      }).execute();
      await db.updateTable('attestation')
        .set({ signed_at: new Date(), signatory_id: fixture.signatoryId })
        .where('id', '=', fixture.attestationId)
        .execute();

      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/attestations/${fixture.attestationId}/requirements/${fixture.requirementId}`)
        .send({ conformanceScore: 0.1, conformanceRationale: 'tampered' });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('signed');
    });

    it('POST /attestations/:id/sign on an already-signed attestation returns 409', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post(`/api/v1/attestations/${attFixtures.signed.attestationId}/sign`)
        .send({ signatoryId: attFixtures.signed.signatoryId });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('signed');
    });
  });

  describe('terminal-assessment attestation is locked for admin', () => {
    const cases: Array<{
      label: string;
      getFixture: () => AttestationFixture;
    }> = [
      { label: 'complete', getFixture: () => attFixtures.completeAssessment },
      { label: 'archived', getFixture: () => attFixtures.archivedAssessment },
      { label: 'cancelled', getFixture: () => attFixtures.cancelledAssessment },
    ];

    for (const c of cases) {
      it(`PUT /attestations/:id on ${c.label} assessment returns 409`, async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .put(`/api/v1/attestations/${c.getFixture().attestationId}`)
          .send({ summary: 'Tampered' });
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe('assessment_terminal');
      });
    }
  });

  describe('unsigned attestation on active assessment is NOT locked', () => {
    it('PUT /attestations/:id succeeds', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/attestations/${attFixtures.unsigned.attestationId}`)
        .send({ summary: 'Updated summary' });
      expect(res.status).toBe(200);
    });

    it('POST /attestations/:id/sign stamps signed_at and succeeds once', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post(`/api/v1/attestations/${attFixtures.unsigned.attestationId}/sign`)
        .send({ signatoryId: attFixtures.unsigned.signatoryId });
      expect(res.status).toBe(200);

      // After the first sign, the attestation must be immutable.
      const second = await agent
        .put(`/api/v1/attestations/${attFixtures.unsigned.attestationId}`)
        .send({ summary: 'Tampered after signing' });
      expect(second.status).toBe(409);
      expect(second.body.reason).toBe('signed');
    });
  });

  describe('claim cited by a signed attestation is locked for admin', () => {
    const cases: Array<{
      label: string;
      getFixture: () => ClaimFixture;
    }> = [
      { label: 'direct attestation_id FK', getFixture: () => claimFixtures.directSigned },
      { label: 'attestation_requirement_claim junction', getFixture: () => claimFixtures.mapClaimSigned },
      { label: 'attestation_requirement_counter_claim junction', getFixture: () => claimFixtures.mapCounterClaimSigned },
    ];

    for (const c of cases) {
      it(`PUT /claims/:id with ${c.label} returns 409`, async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .put(`/api/v1/claims/${c.getFixture().claimId}`)
          .send({ name: 'Tampered claim' });
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe('cited_in_signed_attestation');
      });

      it(`DELETE /claims/:id with ${c.label} returns 409`, async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .delete(`/api/v1/claims/${c.getFixture().claimId}`);
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe('cited_in_signed_attestation');
      });
    }
  });

  describe('unused claim is NOT locked', () => {
    it('PUT /claims/:id succeeds on a claim whose parent attestation is unsigned', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/claims/${claimFixtures.unused.claimId}`)
        .send({ name: 'Renamed unused claim' });
      expect(res.status).toBe(200);
    });
  });
});
