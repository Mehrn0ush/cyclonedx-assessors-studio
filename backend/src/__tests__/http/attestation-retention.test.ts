/**
 * Regression tests for the PR3 attestation / claim retention lock.
 *
 * Domain rules enforced by `utils/retention.ts` (as updated in PR3.6):
 *   - An attestation is immutable once any affirmation on its parent
 *     assessment has been sealed (`affirmation.sealed_at IS NOT NULL`),
 *     or once its parent assessment is in a terminal state.
 *   - A claim is immutable once it is cited by any attestation on an
 *     assessment whose affirmation is sealed (directly via
 *     `claim.attestation_id`, or through the
 *     `attestation_requirement_claim` and
 *     `attestation_requirement_counter_claim` junction tables), or once
 *     its parent assessment is terminal.
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
  affirmationId: string | null;
}

interface ClaimFixture {
  claimId: string;
  attestationId: string;
  assessmentId: string;
  affirmationId: string;
}

async function seedAttestationFixture(opts: {
  sealed: boolean;
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
  await db.insertInto('attestation').values({
    id: attestationId,
    summary: `Ret fixture attestation (${opts.label})`,
    assessment_id: assessmentId,
    signatory_id: opts.sealed ? signatoryId : null,
  }).execute();

  // Optional sealed affirmation on the same assessment. The load-bearing
  // retention flag under PR3.6 is affirmation.sealed_at, so every test
  // case that wants a locked attestation seeds one here. Using the DB
  // directly (rather than the affirmations route) keeps the fixture
  // fast and keeps this suite focused on the retention check rather
  // than the full seal ceremony.
  let affirmationId: string | null = null;
  if (opts.sealed) {
    affirmationId = uuidv4();
    await db.insertInto('affirmation').values({
      id: affirmationId,
      statement: `Ret fixture affirmation (${opts.label})`,
      assessment_id: assessmentId,
      sealed_at: new Date(),
    }).execute();
  }

  return { attestationId, assessmentId, requirementId, signatoryId, affirmationId };
}

async function seedClaimFixture(opts: {
  linkage: 'direct_sealed' | 'map_claim_sealed' | 'map_counter_claim_sealed';
  label: string;
}): Promise<ClaimFixture> {
  const { getDatabase } = await import('../../db/connection.js');
  const db = getDatabase();

  const parent = await seedAttestationFixture({
    sealed: true,
    assessmentState: 'in_progress',
    label: opts.label,
  });

  const claimId = uuidv4();
  await db.insertInto('claim').values({
    id: claimId,
    name: `Ret fixture claim (${opts.label})`,
    target: 'fixture target',
    predicate: 'conformsTo',
    is_counter_claim: opts.linkage === 'map_counter_claim_sealed',
    // Only wire the attestation_id column when we want the direct link
    // retention case. The map linkages use the junction tables below,
    // not the FK column, which mirrors how the CycloneDX schema allows
    // free-floating claims referenced from the attestation map.
    attestation_id: opts.linkage === 'direct_sealed' ? parent.attestationId : null,
  }).execute();

  if (opts.linkage !== 'direct_sealed') {
    const attReqId = uuidv4();
    await db.insertInto('attestation_requirement').values({
      id: attReqId,
      attestation_id: parent.attestationId,
      requirement_id: parent.requirementId,
      conformance_score: 1,
      conformance_rationale: 'fixture',
    }).execute();

    const junction = opts.linkage === 'map_claim_sealed'
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
    // seedAttestationFixture guarantees an affirmation when sealed=true
    // so the non-null assertion is safe here.
    affirmationId: parent.affirmationId as string,
  };
}

describe('Attestation and claim retention regressions (PR3 affirmation lock)', () => {
  setupHttpTests();

  let attFixtures: {
    sealed: AttestationFixture;
    // `complete` used to be a retention terminal for attestations but
    // the PR3.6 workflow requires attestations to be authored on
    // already-complete assessments, so `complete` is now the working
    // state. Only `archived` and `cancelled` lock attestations as
    // assessment_terminal. The `completeAssessment` fixture is kept so
    // we can positively assert that complete does NOT lock.
    completeAssessment: AttestationFixture;
    archivedAssessment: AttestationFixture;
    cancelledAssessment: AttestationFixture;
    unsigned: AttestationFixture;
  };

  let claimFixtures: {
    directSealed: ClaimFixture;
    mapClaimSealed: ClaimFixture;
    mapCounterClaimSealed: ClaimFixture;
    unused: ClaimFixture;
  };

  beforeAll(async () => {
    attFixtures = {
      sealed: await seedAttestationFixture({ sealed: true, assessmentState: 'in_progress', label: 'sealed' }),
      completeAssessment: await seedAttestationFixture({ sealed: false, assessmentState: 'complete', label: 'complete' }),
      archivedAssessment: await seedAttestationFixture({ sealed: false, assessmentState: 'archived', label: 'archived' }),
      cancelledAssessment: await seedAttestationFixture({ sealed: false, assessmentState: 'cancelled', label: 'cancelled' }),
      unsigned: await seedAttestationFixture({ sealed: false, assessmentState: 'in_progress', label: 'unsigned' }),
    };

    claimFixtures = {
      directSealed: await seedClaimFixture({ linkage: 'direct_sealed', label: 'direct' }),
      mapClaimSealed: await seedClaimFixture({ linkage: 'map_claim_sealed', label: 'map_claim' }),
      mapCounterClaimSealed: await seedClaimFixture({ linkage: 'map_counter_claim_sealed', label: 'map_counter' }),
      unused: await (async () => {
        // A claim whose parent attestation lives on an assessment
        // without a sealed affirmation is not locked. This is the
        // baseline that should remain mutable so we can confirm the
        // routes still work for the non-locked case.
        const { getDatabase } = await import('../../db/connection.js');
        const db = getDatabase();
        const parent = await seedAttestationFixture({ sealed: false, assessmentState: 'in_progress', label: 'unused_claim_parent' });
        const claimId = uuidv4();
        await db.insertInto('claim').values({
          id: claimId,
          name: 'Ret fixture claim (unused)',
          target: 'fixture target',
          predicate: 'conformsTo',
          is_counter_claim: false,
          attestation_id: parent.attestationId,
        }).execute();
        return {
          claimId,
          attestationId: parent.attestationId,
          assessmentId: parent.assessmentId,
          affirmationId: 'n/a',
        };
      })(),
    };
  });

  // Note on coverage of caller identity: `testUsers.admin` holds every
  // permission, which is the exact caller profile the pre-retention
  // code quietly waved through for edits and deletes. Asserting that
  // admin still gets 409 here is the whole point of the symmetric
  // retention lock.
  const _adminUser = () => testUsers.admin;

  describe('attestation on sealed-affirmation assessment is locked for admin', () => {
    it('PUT /attestations/:id returns 409 with reason=affirmation_sealed', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/attestations/${attFixtures.sealed.attestationId}`)
        .send({ summary: 'Tampered' });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('affirmation_sealed');
    });

    it('POST /attestations/:id/requirements returns 409 with reason=affirmation_sealed', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post(`/api/v1/attestations/${attFixtures.sealed.attestationId}/requirements`)
        .send({
          requirementId: attFixtures.sealed.requirementId,
          conformanceScore: 0.5,
          conformanceRationale: 'tampered',
        });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('affirmation_sealed');
    });

    it('PUT /attestations/:id/requirements/:rid returns 409 when requirement exists', async () => {
      // Seed the requirement link on an unsealed attestation first,
      // then seal an affirmation on the same assessment so the PUT
      // path reaches the retention check with a locked parent.
      const { getDatabase } = await import('../../db/connection.js');
      const db = getDatabase();
      const fixture = await seedAttestationFixture({
        sealed: false,
        assessmentState: 'in_progress',
        label: 'seal_after_req',
      });
      await db.insertInto('attestation_requirement').values({
        id: uuidv4(),
        attestation_id: fixture.attestationId,
        requirement_id: fixture.requirementId,
        conformance_score: 1,
        conformance_rationale: 'fixture',
      }).execute();
      await db.insertInto('affirmation').values({
        id: uuidv4(),
        statement: 'Ret fixture seal_after_req',
        assessment_id: fixture.assessmentId,
        sealed_at: new Date(),
      }).execute();

      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/attestations/${fixture.attestationId}/requirements/${fixture.requirementId}`)
        .send({ conformanceScore: 0.1, conformanceRationale: 'tampered' });
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('affirmation_sealed');
    });
  });

  describe('terminal-assessment attestation is locked for admin', () => {
    const cases: Array<{
      label: string;
      getFixture: () => AttestationFixture;
    }> = [
      // `complete` is deliberately absent: attestations are authored on
      // complete assessments under PR3.6, so it is the working state,
      // not a retention terminal.
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

    it('PUT /attestations/:id on a complete (non-sealed) assessment is allowed', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/attestations/${attFixtures.completeAssessment.attestationId}`)
        .send({ summary: 'Updated while complete' });
      expect(res.status).toBe(200);
      expect(res.body.summary).toBe('Updated while complete');
    });
  });

  describe('attestation on non-sealed active assessment is NOT locked', () => {
    it('PUT /attestations/:id succeeds', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/attestations/${attFixtures.unsigned.attestationId}`)
        .send({ summary: 'Updated summary' });
      expect(res.status).toBe(200);
    });

    it('inserting a sealed affirmation on the same assessment retroactively locks the attestation', async () => {
      const { getDatabase } = await import('../../db/connection.js');
      const db = getDatabase();
      const fixture = await seedAttestationFixture({
        sealed: false,
        assessmentState: 'in_progress',
        label: 'pre_seal_mutable',
      });

      // Before any affirmation exists, admin can edit the attestation.
      const agent = await loginAs('admin');
      const firstEdit = await agent
        .put(`/api/v1/attestations/${fixture.attestationId}`)
        .send({ summary: 'Still editable' });
      expect(firstEdit.status).toBe(200);

      await db.insertInto('affirmation').values({
        id: uuidv4(),
        statement: 'Retroactive seal fixture',
        assessment_id: fixture.assessmentId,
        sealed_at: new Date(),
      }).execute();

      // After the seal the same route must be locked.
      const second = await agent
        .put(`/api/v1/attestations/${fixture.attestationId}`)
        .send({ summary: 'Tampered after seal' });
      expect(second.status).toBe(409);
      expect(second.body.reason).toBe('affirmation_sealed');
    });
  });

  describe('claim cited by an attestation on a sealed-affirmation assessment is locked for admin', () => {
    const cases: Array<{
      label: string;
      getFixture: () => ClaimFixture;
    }> = [
      { label: 'direct attestation_id FK', getFixture: () => claimFixtures.directSealed },
      { label: 'attestation_requirement_claim junction', getFixture: () => claimFixtures.mapClaimSealed },
      { label: 'attestation_requirement_counter_claim junction', getFixture: () => claimFixtures.mapCounterClaimSealed },
    ];

    for (const c of cases) {
      it(`PUT /claims/:id with ${c.label} returns 409`, async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .put(`/api/v1/claims/${c.getFixture().claimId}`)
          .send({ name: 'Tampered claim' });
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe('cited_in_sealed_affirmation');
      });

      it(`DELETE /claims/:id with ${c.label} returns 409`, async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .delete(`/api/v1/claims/${c.getFixture().claimId}`);
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe('cited_in_sealed_affirmation');
      });
    }
  });

  describe('unused claim is NOT locked', () => {
    it('PUT /claims/:id succeeds on a claim whose parent assessment has no sealed affirmation', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/claims/${claimFixtures.unused.claimId}`)
        .send({ name: 'Renamed unused claim' });
      expect(res.status).toBe(200);
    });
  });
});
