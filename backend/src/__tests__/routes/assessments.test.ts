import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  createTestProject,
  createTestAssessment,
  createTestUser,
  createTestStandard,
  createTestRequirement,
  createTestTag,
  createTestAttestationRequirement,
  getTestDatabase,
} from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Assessments', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Assessment CRUD operations', () => {
    it('should create assessment linked to project', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id, {
        title: 'Security Assessment',
        description: 'Annual security audit',
      });

      const result = await db.selectFrom('assessment')
        .where('id', '=', assessment.id)
        .selectAll()
        .executeTakeFirst();

      expect(result).toBeDefined();
      expect(result!.title).toBe('Security Assessment');
      expect(result!.project_id).toBe(project.id);
      expect(result!.state).toBe('new');
    });

    it('should create assessment with all fields', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessmentId = uuidv4();
      const startDate = new Date('2024-01-15');
      const endDate = new Date('2024-01-31');
      const dueDate = new Date('2024-02-15');

      await db.insertInto('assessment').values({
        id: assessmentId,
        title: 'Complete Assessment',
        description: 'Comprehensive assessment',
        project_id: project.id,
        state: 'pending',
        start_date: startDate,
        end_date: endDate,
        due_date: dueDate,
      }).execute();

      const result = await db.selectFrom('assessment')
        .where('id', '=', assessmentId)
        .selectAll()
        .executeTakeFirst();

      expect(result).toBeDefined();
      expect(result!.start_date?.toISOString()).toBe(startDate.toISOString());
      expect(result!.end_date?.toISOString()).toBe(endDate.toISOString());
      expect(result!.due_date?.toISOString()).toBe(dueDate.toISOString());
    });

    it('should support assessment state transitions', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id, { state: 'new' });

      const states = ['new', 'pending', 'in_progress', 'on_hold', 'cancelled', 'complete', 'archived'];

      for (const state of states) {
        await db.updateTable('assessment')
          .set({ state: state as any })
          .where('id', '=', assessment.id)
          .execute();

        const updated = await db.selectFrom('assessment')
          .where('id', '=', assessment.id)
          .selectAll()
          .executeTakeFirst();

        expect(updated!.state).toBe(state);
      }
    });

    it('should assign assessors to assessment', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const assessor1 = await createTestUser({ displayName: 'Assessor 1' });
      const assessor2 = await createTestUser({ displayName: 'Assessor 2' });

      await db.insertInto('assessment_assessor').values({
        assessment_id: assessment.id,
        user_id: assessor1.id,
        created_at: new Date(),
      }).execute();

      await db.insertInto('assessment_assessor').values({
        assessment_id: assessment.id,
        user_id: assessor2.id,
        created_at: new Date(),
      }).execute();

      const assessors = await db.selectFrom('assessment_assessor')
        .where('assessment_id', '=', assessment.id)
        .selectAll()
        .execute();

      expect(assessors).toHaveLength(2);
      expect(assessors.map(a => a.user_id)).toContain(assessor1.id);
      expect(assessors.map(a => a.user_id)).toContain(assessor2.id);
    });

    it('should assign assessees to assessment', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const assessee1 = await createTestUser({ displayName: 'Assessee 1' });
      const assessee2 = await createTestUser({ displayName: 'Assessee 2' });

      await db.insertInto('assessment_assessee').values({
        assessment_id: assessment.id,
        user_id: assessee1.id,
        created_at: new Date(),
      }).execute();

      await db.insertInto('assessment_assessee').values({
        assessment_id: assessment.id,
        user_id: assessee2.id,
        created_at: new Date(),
      }).execute();

      const assessees = await db.selectFrom('assessment_assessee')
        .where('assessment_id', '=', assessment.id)
        .selectAll()
        .execute();

      expect(assessees).toHaveLength(2);
    });

    it('should create assessment requirement results', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const standard = await createTestStandard();
      const requirement = await createTestRequirement(standard.id);

      const assessmentReqId = uuidv4();
      await db.insertInto('assessment_requirement').values({
        id: assessmentReqId,
        assessment_id: assessment.id,
        requirement_id: requirement.id,
        result: 'yes',
        rationale: 'Requirement is met',
      }).execute();

      const result = await db.selectFrom('assessment_requirement')
        .where('id', '=', assessmentReqId)
        .selectAll()
        .executeTakeFirst();

      expect(result).toBeDefined();
      expect(result!.result).toBe('yes');
      expect(result!.rationale).toBe('Requirement is met');
    });

    it('should support all assessment requirement result values', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const standard = await createTestStandard();

      const results = ['yes', 'no', 'partial', 'not_applicable'];

      for (const resultValue of results) {
        const requirement = await createTestRequirement(standard.id, {
          identifier: `REQ-${resultValue}`,
        });

        await db.insertInto('assessment_requirement').values({
          id: uuidv4(),
          assessment_id: assessment.id,
          requirement_id: requirement.id,
          result: resultValue as any,
        }).execute();
      }

      const requirements = await db.selectFrom('assessment_requirement')
        .where('assessment_id', '=', assessment.id)
        .selectAll()
        .execute();

      expect(requirements).toHaveLength(4);
      const foundResults = requirements.map(r => r.result);
      for (const resultValue of results) {
        expect(foundResults).toContain(resultValue);
      }
    });

    it('should associate tags with assessment', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const tag1 = await createTestTag({ name: 'annual' });
      const tag2 = await createTestTag({ name: 'scheduled' });

      await db.insertInto('assessment_tag').values({
        assessment_id: assessment.id,
        tag_id: tag1.id,
        created_at: new Date(),
      }).execute();

      await db.insertInto('assessment_tag').values({
        assessment_id: assessment.id,
        tag_id: tag2.id,
        created_at: new Date(),
      }).execute();

      const tags = await db.selectFrom('assessment_tag')
        .where('assessment_id', '=', assessment.id)
        .selectAll()
        .execute();

      expect(tags).toHaveLength(2);
    });

    it('should retrieve assessment with tags', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const tag = await createTestTag({ name: 'urgent', color: '#FF0000' });

      await db.insertInto('assessment_tag').values({
        assessment_id: assessment.id,
        tag_id: tag.id,
        created_at: new Date(),
      }).execute();

      const result = await db.selectFrom('assessment_tag')
        .innerJoin('tag', 'tag.id', 'assessment_tag.tag_id')
        .where('assessment_tag.assessment_id', '=', assessment.id)
        .selectAll()
        .execute();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('urgent');
    });

    it('should create attestation for assessment', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const attestationId = uuidv4();

      await db.insertInto('attestation').values({
        id: attestationId,
        summary: 'Assessment complete and conformant',
        assessment_id: assessment.id,
      }).execute();

      const attestation = await db.selectFrom('attestation')
        .where('id', '=', attestationId)
        .selectAll()
        .executeTakeFirst();

      expect(attestation).toBeDefined();
      expect(attestation!.summary).toBe('Assessment complete and conformant');
      expect(attestation!.assessment_id).toBe(assessment.id);
    });

    it('should create attestation requirement with conformance score', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const standard = await createTestStandard();
      const requirement = await createTestRequirement(standard.id);

      const attestationId = uuidv4();
      await db.insertInto('attestation').values({
        id: attestationId,
        summary: 'Test attestation',
        assessment_id: assessment.id,
      }).execute();

      const attestReq = await createTestAttestationRequirement(
        attestationId,
        requirement.id,
        {
          conformanceScore: 0.85,
          conformanceRationale: 'Mostly compliant',
          confidenceScore: 0.90,
          confidenceRationale: 'High confidence in assessment',
        }
      );

      const result = await db.selectFrom('attestation_requirement')
        .where('id', '=', attestReq.id)
        .selectAll()
        .executeTakeFirst();

      expect(result).toBeDefined();
      // PGlite DECIMAL(3,2) returns string representations
      expect(parseFloat(String(result!.conformance_score))).toBeCloseTo(0.85);
      expect(parseFloat(String(result!.confidence_score))).toBeCloseTo(0.90);
    });

    it('should enforce conformance score constraints (0.00-1.00)', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);
      const standard = await createTestStandard();

      const attestationId = uuidv4();
      await db.insertInto('attestation').values({
        id: attestationId,
        summary: 'Test',
        assessment_id: assessment.id,
      }).execute();

      // Valid scores: each needs a unique requirement (UNIQUE attestation_id + requirement_id)
      for (const score of [0.0, 0.5, 1.0]) {
        const requirement = await createTestRequirement(standard.id, {
          identifier: `SCORE-REQ-${score}`,
        });
        await db.insertInto('attestation_requirement').values({
          id: uuidv4(),
          attestation_id: attestationId,
          requirement_id: requirement.id,
          conformance_score: score as any,
          conformance_rationale: 'Test',
        }).execute();
      }

      // Invalid score should be rejected by CHECK constraint
      const invalidReq = await createTestRequirement(standard.id, {
        identifier: 'SCORE-REQ-INVALID',
      });
      await expect(
        db.insertInto('attestation_requirement').values({
          id: uuidv4(),
          attestation_id: attestationId,
          requirement_id: invalidReq.id,
          conformance_score: 1.5 as any,
          conformance_rationale: 'Test',
        }).execute()
      ).rejects.toThrow();
    });

    it('should list assessments by project', async () => {
      const db = getTestDatabase();
      const project1 = await createTestProject();
      const project2 = await createTestProject();

      await createTestAssessment(project1.id, { title: 'Assessment 1' });
      await createTestAssessment(project1.id, { title: 'Assessment 2' });
      await createTestAssessment(project2.id, { title: 'Assessment 3' });

      const project1Assessments = await db.selectFrom('assessment')
        .where('project_id', '=', project1.id)
        .selectAll()
        .execute();

      const project2Assessments = await db.selectFrom('assessment')
        .where('project_id', '=', project2.id)
        .selectAll()
        .execute();

      expect(project1Assessments.length).toBeGreaterThanOrEqual(2);
      expect(project2Assessments.length).toBeGreaterThanOrEqual(1);
    });

    it('should delete assessments when project is deleted', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessment = await createTestAssessment(project.id);

      await db.deleteFrom('project').where('id', '=', project.id).execute();

      const remainingAssessments = await db.selectFrom('assessment')
        .where('project_id', '=', project.id)
        .selectAll()
        .execute();

      expect(remainingAssessments).toHaveLength(0);
    });

    it('should track assessment creation and update times', async () => {
      const db = getTestDatabase();
      const project = await createTestProject();
      const assessmentId = uuidv4();
      const now = new Date();

      await db.insertInto('assessment').values({
        id: assessmentId,
        title: 'Timestamped Assessment',
        project_id: project.id,
        state: 'new',
      }).execute();

      const result = await db.selectFrom('assessment')
        .where('id', '=', assessmentId)
        .selectAll()
        .executeTakeFirst();

      expect(result!.created_at).toBeDefined();
      expect(result!.updated_at).toBeDefined();
    });
  });
});
