/**
 * Regression tests for evidence retention/immutability (Sprint 4.9-4.11).
 *
 * Domain rule: evidence is immutable, both write-protected and
 * delete-protected, once it has been "used." The rule binds every
 * caller, admins included. There is no permission that bypasses it.
 * See `isEvidenceImmutable` in backend/src/routes/evidence.ts and the
 * `project_evidence_retention.md` memory for the full policy.
 *
 * "Used" means any one of:
 *   1. evidence.state === 'claimed'
 *   2. The evidence is cited in claim_evidence, claim_counter_evidence,
 *      or claim_mitigation_strategy.
 *   3. The evidence is linked (via assessment_requirement_evidence) to
 *      an assessment in state complete, archived, or cancelled.
 *
 * The enforcement layer returns 409 Conflict with a `reason` so the
 * client can distinguish retention from 403 (no permission) and 404
 * (not found / not authorized).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  setupHttpTests,
  loginAs,
  testUsers,
} from '../helpers/http.js';

type TerminalState = 'complete' | 'archived' | 'cancelled';

interface Fixture {
  evidenceId: string;
  assessmentRequirementId: string;
  attachmentId: string;
  noteId: string;
}

async function seedUsedEvidence(opts: {
  kind: 'claimed' | 'claim_evidence' | 'claim_counter_evidence' | 'claim_mitigation_strategy' | TerminalState;
  authorId: string;
}): Promise<Fixture> {
  const { getDatabase } = await import('../../db/connection.js');
  const db = getDatabase();

  const evidenceId = uuidv4();
  const initialState = opts.kind === 'claimed' ? 'claimed' : 'in_progress';

  await db.insertInto('evidence').values({
    id: evidenceId,
    name: `Retention fixture (${opts.kind})`,
    description: 'Retention regression fixture',
    state: initialState,
    author_id: opts.authorId,
    is_counter_evidence: false,
  }).execute();

  const attachmentId = uuidv4();
  await db.insertInto('evidence_attachment').values({
    id: attachmentId,
    evidence_id: evidenceId,
    filename: 'retention.txt',
    content_type: 'text/plain',
    size_bytes: 5,
    storage_path: null,
    storage_provider: 'database',
    binary_content: Buffer.from('hello'),
  }).execute();

  const noteId = uuidv4();
  await db.insertInto('evidence_note').values({
    id: noteId,
    evidence_id: evidenceId,
    user_id: opts.authorId,
    content: 'Retention fixture note',
    created_at: new Date(),
    updated_at: new Date(),
  }).execute();

  // Always create the assessment chain so the unlink route has something
  // to target; whether that assessment is terminal is what varies below.
  const projectId = uuidv4();
  await db.insertInto('project').values({
    id: projectId,
    name: `Retention fixture project (${opts.kind})`,
    state: 'in_progress',
    workflow_type: 'evidence_driven',
  }).execute();

  const assessmentId = uuidv4();
  const assessmentState: TerminalState | 'in_progress' =
    opts.kind === 'complete' || opts.kind === 'archived' || opts.kind === 'cancelled'
      ? opts.kind
      : 'in_progress';
  await db.insertInto('assessment').values({
    id: assessmentId,
    title: `Retention fixture assessment (${opts.kind})`,
    state: assessmentState,
    project_id: projectId,
  }).execute();

  const standardId = uuidv4();
  await db.insertInto('standard').values({
    id: standardId,
    identifier: `STD-RET-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Retention fixture standard (${opts.kind})`,
    state: 'published',
    is_imported: false,
  }).execute();

  const requirementId = uuidv4();
  await db.insertInto('requirement').values({
    id: requirementId,
    identifier: `R-RET-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Retention fixture requirement (${opts.kind})`,
    standard_id: standardId,
  }).execute();

  const assessmentRequirementId = uuidv4();
  await db.insertInto('assessment_requirement').values({
    id: assessmentRequirementId,
    assessment_id: assessmentId,
    requirement_id: requirementId,
  }).execute();

  await db.insertInto('assessment_requirement_evidence').values({
    assessment_requirement_id: assessmentRequirementId,
    evidence_id: evidenceId,
    created_at: new Date(),
  }).execute();

  // For claim-linkage cases, also create a claim and the matching join
  // row so the claim-level "used" check fires. A claim is a free-
  // floating record: it carries a name/target/predicate but its link to
  // any particular evidence is through the three join tables, not a
  // column on the claim itself.
  if (
    opts.kind === 'claim_evidence' ||
    opts.kind === 'claim_counter_evidence' ||
    opts.kind === 'claim_mitigation_strategy'
  ) {
    const claimId = uuidv4();
    await db.insertInto('claim').values({
      id: claimId,
      name: `Retention fixture claim (${opts.kind})`,
      target: 'fixture target',
      predicate: 'conformsTo',
      is_counter_claim: false,
    }).execute();

    await db.insertInto(opts.kind).values({
      claim_id: claimId,
      evidence_id: evidenceId,
      created_at: new Date(),
    }).execute();
  }

  return { evidenceId, assessmentRequirementId, attachmentId, noteId };
}

describe('Evidence retention (immutability) regressions', () => {
  setupHttpTests();

  let fixtures: {
    claimed: Fixture;
    claimEvidence: Fixture;
    claimCounter: Fixture;
    claimMitigation: Fixture;
    complete: Fixture;
    archived: Fixture;
    cancelled: Fixture;
    unused: Fixture;
  };

  beforeAll(async () => {
    const adminId = testUsers.admin.id;
    fixtures = {
      claimed: await seedUsedEvidence({ kind: 'claimed', authorId: adminId }),
      claimEvidence: await seedUsedEvidence({ kind: 'claim_evidence', authorId: adminId }),
      claimCounter: await seedUsedEvidence({ kind: 'claim_counter_evidence', authorId: adminId }),
      claimMitigation: await seedUsedEvidence({ kind: 'claim_mitigation_strategy', authorId: adminId }),
      complete: await seedUsedEvidence({ kind: 'complete', authorId: adminId }),
      archived: await seedUsedEvidence({ kind: 'archived', authorId: adminId }),
      cancelled: await seedUsedEvidence({ kind: 'cancelled', authorId: adminId }),
      // Unused reference point so we can assert the routes still work
      // for evidence that has not yet been used.
      unused: await seedUsedEvidence({ kind: 'complete', authorId: adminId })
        .then(async (f) => {
          // Flip the assessment state back to in_progress so this
          // fixture is not retention-locked, while keeping the same
          // shape (note, attachment, link) as the others.
          const { getDatabase } = await import('../../db/connection.js');
          const db = getDatabase();
          await db
            .updateTable('assessment')
            .set({ state: 'in_progress' })
            .where('id', '=',
              (await db
                .selectFrom('assessment_requirement')
                .where('id', '=', f.assessmentRequirementId)
                .select('assessment_id')
                .executeTakeFirstOrThrow()).assessment_id as string,
            )
            .execute();
          return f;
        }),
    };
  });

  // Each of these sub-suites walks a "used" flavor against every
  // mutating route the helper is applied to. The assertion shape is
  // the same: 409 with `reason` matching the flavor.

  const cases: Array<{
    label: string;
    reason: 'claimed' | 'linked_to_claim' | 'assessment_terminal';
    getFixture: () => Fixture;
  }> = [
    { label: 'claimed evidence', reason: 'claimed', getFixture: () => fixtures.claimed },
    { label: 'evidence in claim_evidence', reason: 'linked_to_claim', getFixture: () => fixtures.claimEvidence },
    { label: 'evidence in claim_counter_evidence', reason: 'linked_to_claim', getFixture: () => fixtures.claimCounter },
    { label: 'evidence in claim_mitigation_strategy', reason: 'linked_to_claim', getFixture: () => fixtures.claimMitigation },
    { label: 'evidence linked to complete assessment', reason: 'assessment_terminal', getFixture: () => fixtures.complete },
    { label: 'evidence linked to archived assessment', reason: 'assessment_terminal', getFixture: () => fixtures.archived },
    { label: 'evidence linked to cancelled assessment', reason: 'assessment_terminal', getFixture: () => fixtures.cancelled },
  ];

  for (const c of cases) {
    describe(`${c.label} is locked for admin`, () => {
      it('PUT /evidence/:id returns 409', async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .put(`/api/v1/evidence/${c.getFixture().evidenceId}`)
          .send({ name: 'Tampered' });
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe(c.reason);
      });

      it('POST /evidence/:id/notes returns 409', async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .post(`/api/v1/evidence/${c.getFixture().evidenceId}/notes`)
          .send({ content: 'Should not be accepted' });
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe(c.reason);
      });

      it('POST /evidence/:id/attachments returns 409', async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .post(`/api/v1/evidence/${c.getFixture().evidenceId}/attachments`)
          .send({
            filename: 'tampered.txt',
            contentType: 'text/plain',
            binaryContent: Buffer.from('x').toString('base64'),
          });
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe(c.reason);
      });

      it('DELETE /evidence/:id/attachments/:aid returns 409', async () => {
        const agent = await loginAs('admin');
        const res = await agent.delete(
          `/api/v1/evidence/${c.getFixture().evidenceId}/attachments/${c.getFixture().attachmentId}`,
        );
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe(c.reason);
      });

      it('DELETE /evidence/:id/unlink returns 409', async () => {
        const agent = await loginAs('admin');
        const res = await agent
          .delete(`/api/v1/evidence/${c.getFixture().evidenceId}/unlink`)
          .send({ assessmentRequirementId: c.getFixture().assessmentRequirementId });
        expect(res.status).toBe(409);
        expect(res.body.reason).toBe(c.reason);
      });
    });
  }

  describe('unused evidence is NOT locked', () => {
    it('PUT /evidence/:id succeeds on unused evidence', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .put(`/api/v1/evidence/${fixtures.unused.evidenceId}`)
        .send({ name: 'Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed');
    });

    it('POST /evidence/:id/notes succeeds on unused evidence', async () => {
      const agent = await loginAs('admin');
      const res = await agent
        .post(`/api/v1/evidence/${fixtures.unused.evidenceId}/notes`)
        .send({ content: 'A fresh note' });
      expect(res.status).toBe(201);
    });
  });

  describe('retention is universal, not role-scoped', () => {
    // The admin user holds every permission including evidence.view_all
    // and evidence.delete, which is the exact caller profile that the
    // old codebase quietly waved through. Asserting that admin still
    // gets 409 is the point of the whole Sprint 4.9+ change.
    it('admin cannot DELETE an attachment on retention-locked evidence', async () => {
      const agent = await loginAs('admin');
      const res = await agent.delete(
        `/api/v1/evidence/${fixtures.complete.evidenceId}/attachments/${fixtures.complete.attachmentId}`,
      );
      expect(res.status).toBe(409);
      expect(res.body.reason).toBe('assessment_terminal');
    });
  });
});
