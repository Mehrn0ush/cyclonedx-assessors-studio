import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { syncEntityTags, fetchTagsForEntities } from '../utils/tags.js';
import { createNotification } from '../utils/notifications.js';
import { toSnakeCase } from '../middleware/camelCase.js';

const router = Router();

const createAssessmentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  projectId: z.string().uuid('Invalid project ID').nullable().optional(),
  entityId: z.string().uuid('Invalid entity ID').nullable().optional(),
  standardId: z.string().uuid('Invalid standard ID').nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assessorIds: z.array(z.string().uuid()).optional(),
  assesseeIds: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string()).optional(),
});

const updateAssessmentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  state: z
    .enum(['new', 'pending', 'in_progress', 'on_hold', 'cancelled', 'complete'])
    .optional(),
  tags: z.array(z.string()).optional(),
  assessorIds: z.array(z.string().uuid()).optional(),
  assesseeIds: z.array(z.string().uuid()).optional(),
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const state = req.query.state as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    const myOnly = req.query.myOnly === 'true';

    let query = db
      .selectFrom('assessment')
      .leftJoin('project', 'project.id', 'assessment.project_id')
      .leftJoin('entity', 'entity.id', 'assessment.entity_id')
      .leftJoin('standard', 'standard.id', 'assessment.standard_id')
      .select([
        'assessment.id',
        'assessment.title',
        'assessment.description',
        'assessment.state',
        'assessment.project_id',
        'project.name as project_name',
        'assessment.entity_id',
        'entity.name as entity_name',
        'assessment.standard_id',
        'standard.name as standard_name',
        'standard.version as standard_version',
        'assessment.due_date',
        'assessment.start_date',
        'assessment.end_date',
        'assessment.created_at',
        'assessment.updated_at',
      ]);

    if (state) {
      query = query.where('assessment.state', '=', state as any);
    }

    if (projectId) {
      query = query.where('assessment.project_id', '=', projectId);
    }

    if (myOnly && req.user?.id) {
      const userId = req.user.id;
      query = query.where((eb: any) =>
        eb.or([
          eb('assessment.id', 'in',
            eb.selectFrom('assessment_assessor')
              .select('assessment_id')
              .where('user_id', '=', userId)
          ),
          eb('assessment.id', 'in',
            eb.selectFrom('assessment_assessee')
              .select('assessment_id')
              .where('user_id', '=', userId)
          ),
        ])
      );
    }

    const total = await db
      .selectFrom('assessment')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => r.count);

    const assessments = await query.limit(limit).offset(offset).execute();

    const assessmentIds = assessments.map((a: any) => a.id);
    const tagsByAssessment = await fetchTagsForEntities(db, 'assessment_tag', 'assessment_id', assessmentIds);
    const assessmentsWithTags = assessments.map((a: any) => ({
      ...a,
      tags: tagsByAssessment[a.id] || [],
    }));

    res.json({
      data: assessmentsWithTags,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    logger.error('Get assessments error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const assessment = await db
      .selectFrom('assessment')
      .leftJoin('entity', 'entity.id', 'assessment.entity_id')
      .leftJoin('standard', 'standard.id', 'assessment.standard_id')
      .leftJoin('project', 'project.id', 'assessment.project_id')
      .where('assessment.id', '=', req.params.id)
      .select([
        'assessment.id',
        'assessment.title',
        'assessment.description',
        'assessment.project_id',
        'assessment.entity_id',
        'assessment.standard_id',
        'assessment.conformance_score',
        'assessment.due_date',
        'assessment.start_date',
        'assessment.end_date',
        'assessment.state',
        'assessment.created_at',
        'assessment.updated_at',
        'entity.name as entity_name',
        'entity.entity_type as entity_type',
        'standard.name as standard_name',
        'standard.version as standard_version',
        'project.name as project_name',
      ])
      .executeTakeFirst();

    if (!assessment) {
      res.status(404).json({ error: 'Assessment not found' });
      return;
    }

    const assessmentRequirements = (await db
      .selectFrom('assessment_requirement')
      .innerJoin(
        'requirement',
        (join) =>
          join.onRef(
            'requirement.id' as any,
            '=',
            'assessment_requirement.requirement_id' as any
          )
      )
      .where('assessment_requirement.assessment_id' as any, '=', req.params.id)
      .selectAll()
      .execute()) as any[];

    const assessors = (await db
      .selectFrom('assessment_assessor')
      .innerJoin(
        'app_user',
        (join) =>
          join.onRef(
            'app_user.id' as any,
            '=',
            'assessment_assessor.user_id' as any
          )
      )
      .where('assessment_assessor.assessment_id', '=', req.params.id)
      .selectAll()
      .execute()) as any[];

    const assessees = (await db
      .selectFrom('assessment_assessee')
      .innerJoin(
        'app_user',
        (join) =>
          join.onRef(
            'app_user.id' as any,
            '=',
            'assessment_assessee.user_id' as any
          )
      )
      .where('assessment_assessee.assessment_id', '=', req.params.id)
      .selectAll()
      .execute()) as any[];

    res.json({
      assessment,
      requirements: assessmentRequirements,
      assessors,
      assessees,
    });
  } catch (error) {
    logger.error('Get assessment error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireAuth,
  requireRole('assessor', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createAssessmentSchema.parse(req.body);
      const db = getDatabase();
      const assessmentId = uuidv4();

      if (data.projectId) {
        const project = await db
          .selectFrom('project')
          .where('id', '=', data.projectId)
          .selectAll()
          .executeTakeFirst();

        if (!project) {
          res.status(404).json({ error: 'Project not found' });
          return;
        }
      }

      await db
        .insertInto('assessment')
        .values(
          toSnakeCase({
            id: assessmentId,
            title: data.title,
            description: data.description,
            projectId: data.projectId || undefined,
            entityId: data.entityId || undefined,
            standardId: data.standardId || undefined,
            dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
            state: 'new',
          })
        )
        .execute();

      if (data.assessorIds && data.assessorIds.length > 0) {
        await db
          .insertInto('assessment_assessor')
          .values(
            data.assessorIds.map(userId => ({
              assessment_id: assessmentId,
              user_id: userId,
              created_at: new Date(),
            }))
          )
          .execute();
      }

      if (data.assesseeIds && data.assesseeIds.length > 0) {
        await db
          .insertInto('assessment_assessee')
          .values(
            data.assesseeIds.map(userId => ({
              assessment_id: assessmentId,
              user_id: userId,
              created_at: new Date(),
            }))
          )
          .execute();
      }

      if (data.tags && data.tags.length > 0) {
        await syncEntityTags(db, 'assessment_tag', 'assessment_id', assessmentId, data.tags);
      }

      logger.info('Assessment created', {
        assessmentId,
        title: data.title,
        projectId: data.projectId,
        requestId: req.requestId,
      });

      res.status(201).json({
        id: assessmentId,
        title: data.title,
        description: data.description,
        projectId: data.projectId,
        state: 'new',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Create assessment error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateAssessmentSchema.parse(req.body);
    const db = getDatabase();

    const assessment = await db
      .selectFrom('assessment')
      .where('id', '=', req.params.id)
      .selectAll()
      .executeTakeFirst();

    if (!assessment) {
      res.status(404).json({ error: 'Assessment not found' });
      return;
    }

    const updateData: any = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.dueDate !== undefined && data.dueDate !== null) updateData.due_date = new Date(data.dueDate);
    if (data.state !== undefined) updateData.state = data.state;

    if (Object.keys(updateData).length > 0) {
      await db
        .updateTable('assessment')
        .set(updateData)
        .where('id', '=', req.params.id)
        .execute();
    }

    if (data.tags !== undefined) {
      await syncEntityTags(db, 'assessment_tag', 'assessment_id', req.params.id, data.tags);
    }

    // Sync assessor assignments (delete + re-insert)
    if (data.assessorIds !== undefined) {
      await db
        .deleteFrom('assessment_assessor')
        .where('assessment_id', '=', req.params.id)
        .execute();

      if (data.assessorIds.length > 0) {
        await db
          .insertInto('assessment_assessor')
          .values(
            data.assessorIds.map(userId => ({
              assessment_id: req.params.id,
              user_id: userId,
              created_at: new Date(),
            }))
          )
          .execute();
      }
    }

    // Sync assessee assignments (delete + re-insert)
    if (data.assesseeIds !== undefined) {
      await db
        .deleteFrom('assessment_assessee')
        .where('assessment_id', '=', req.params.id)
        .execute();

      if (data.assesseeIds.length > 0) {
        await db
          .insertInto('assessment_assessee')
          .values(
            data.assesseeIds.map(userId => ({
              assessment_id: req.params.id,
              user_id: userId,
              created_at: new Date(),
            }))
          )
          .execute();
      }
    }

    logger.info('Assessment updated', {
      assessmentId: req.params.id,
      requestId: req.requestId,
    });

    res.json({ message: 'Assessment updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }

    logger.error('Update assessment error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/:id/start',
  requireAuth,
  requireRole('assessor', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const bodyData = startAssessmentSchema.parse(req.body);
      const db = getDatabase();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      if (assessment.state !== 'new') {
        res.status(409).json({ error: 'Assessment can only be started from the new state' });
        return;
      }

      await db
        .updateTable('assessment')
        .set({
          state: 'in_progress',
          start_date: new Date(),
        })
        .where('id', '=', req.params.id)
        .execute();

      let requirements;

      // Priority: standard_id > entity_id standards > project_id standards > bodyData.standardIds
      if (assessment.standard_id) {
        // Load requirements from the specific standard
        requirements = (await db
          .selectFrom('requirement')
          .where('requirement.standard_id', '=', assessment.standard_id)
          .selectAll()
          .execute()) as any[];
      } else if (assessment.entity_id) {
        // Load requirements from entity's associated standards
        requirements = (await db
          .selectFrom('requirement')
          .innerJoin(
            'entity_standard',
            (join) =>
              join.onRef(
                'entity_standard.standard_id' as any,
                '=',
                'requirement.standard_id' as any
              )
          )
          .where('entity_standard.entity_id', '=', assessment.entity_id)
          .selectAll()
          .execute()) as any[];
      } else if (assessment.project_id && assessment.project_id.trim() !== '') {
        // Load requirements from project's associated standards
        requirements = (await db
          .selectFrom('requirement')
          .innerJoin(
            'project_standard',
            (join) =>
              join.onRef(
                'project_standard.standard_id' as any,
                '=',
                'requirement.standard_id' as any
              )
          )
          .where('project_standard.project_id', '=', assessment.project_id)
          .selectAll()
          .execute()) as any[];
      } else {
        // Fallback to body data
        if (!bodyData.standardIds || bodyData.standardIds.length === 0) {
          res.status(400).json({ error: 'standardIds required for ad hoc assessments' });
          return;
        }

        requirements = (await db
          .selectFrom('requirement')
          .where('requirement.standard_id', 'in', bodyData.standardIds)
          .selectAll()
          .execute()) as any[];
      }

      for (const requirement of requirements) {
        await db
          .insertInto('assessment_requirement')
          .values({
            id: uuidv4(),
            assessment_id: req.params.id,
            requirement_id: requirement.id,
          })
          .onConflict(oc => oc.column('assessment_id').column('requirement_id').doNothing())
          .execute();
      }

      // Notify all assessees on the assessment
      const assessees = await db
        .selectFrom('assessment_assessee')
        .where('assessment_id', '=', req.params.id)
        .select('user_id')
        .execute();

      for (const assessee of assessees) {
        await createNotification(db, {
          userId: assessee.user_id,
          type: 'assessment_started',
          title: 'Assessment Started',
          message: `Assessment "${assessment.title}" has been started`,
          link: `/assessments/${req.params.id}`,
        });
      }

      logger.info('Assessment started', {
        assessmentId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Assessment started successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Start assessment error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/complete',
  requireAuth,
  requireRole('assessor', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      if (assessment.state !== 'in_progress') {
        res.status(409).json({ error: 'Assessment can only be completed from the in_progress state' });
        return;
      }

      const requirements = await db
        .selectFrom('assessment_requirement')
        .where('assessment_id', '=', req.params.id)
        .selectAll()
        .execute();

      let unassessedCount = 0;
      let missingRationaleCount = 0;

      for (const req of requirements) {
        if (req.result === null || req.result === undefined) {
          unassessedCount++;
        }
        if (req.rationale === null || req.rationale === undefined || req.rationale.trim() === '') {
          missingRationaleCount++;
        }
      }

      if (unassessedCount > 0 || missingRationaleCount > 0) {
        res.status(400).json({
          error: 'Cannot complete assessment',
          unassessedCount,
          missingRationaleCount,
        });
        return;
      }

      // Calculate conformance score
      let conformanceScore: number | null = null;
      const applicableRequirements = requirements.filter(r => r.result !== 'not_applicable');
      if (applicableRequirements.length > 0) {
        const scoreMap = {
          'yes': 1.0,
          'partial': 0.5,
          'no': 0.0,
        };
        let totalScore = 0;
        for (const req of applicableRequirements) {
          totalScore += scoreMap[req.result as keyof typeof scoreMap] || 0;
        }
        conformanceScore = Math.round((totalScore / applicableRequirements.length) * 100);
      }

      await db
        .updateTable('assessment')
        .set({
          state: 'complete',
          end_date: new Date(),
          conformance_score: conformanceScore,
        })
        .where('id', '=', req.params.id)
        .execute();

      // Notify all assessors and assessees on the assessment
      const assessors = await db
        .selectFrom('assessment_assessor')
        .where('assessment_id', '=', req.params.id)
        .select('user_id')
        .execute();

      const assessees = await db
        .selectFrom('assessment_assessee')
        .where('assessment_id', '=', req.params.id)
        .select('user_id')
        .execute();

      const allParticipants = [...assessors, ...assessees];
      for (const participant of allParticipants) {
        await createNotification(db, {
          userId: participant.user_id,
          type: 'assessment_completed',
          title: 'Assessment Completed',
          message: `Assessment "${assessment.title}" has been completed`,
          link: `/assessments/${req.params.id}`,
        });
      }

      logger.info('Assessment completed', {
        assessmentId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Assessment completed successfully' });
    } catch (error) {
      logger.error('Complete assessment error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Update a specific assessment requirement result
const updateRequirementSchema = z.object({
  result: z.enum(['yes', 'no', 'partial', 'not_applicable']).nullable().optional(),
  rationale: z.string().nullable().optional(),
});

const addWorkNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required'),
});

const startAssessmentSchema = z.object({
  standardIds: z.array(z.string().uuid()).optional(),
});

// Update assessment requirement result and rationale on the assessment_requirement junction table.
// Note: This endpoint updates the ASSESSMENT-SPECIFIC result and rationale, NOT the standard requirement definition.
router.put(
  '/:id/requirements/:requirementId',
  requireAuth,
  requireRole('assessor', 'admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateRequirementSchema.parse(req.body);
      const db = getDatabase();

      const assessmentReq = await db
        .selectFrom('assessment_requirement')
        .where('assessment_id', '=', req.params.id)
        .where('requirement_id', '=', req.params.requirementId)
        .selectAll()
        .executeTakeFirst();

      if (!assessmentReq) {
        res.status(404).json({ error: 'Assessment requirement not found' });
        return;
      }

      if (data.rationale !== undefined && data.rationale !== null) {
        const wordCount = data.rationale.split(/\s+/).filter(word => word.length > 0).length;
        if (wordCount < 15) {
          res.status(400).json({ error: 'Rationale must be at least 15 words' });
          return;
        }
      }

      const updateData: any = {};
      if (data.result !== undefined) updateData.result = data.result;
      if (data.rationale !== undefined) updateData.rationale = data.rationale;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable('assessment_requirement')
          .set(updateData)
          .where('assessment_id', '=', req.params.id)
          .where('requirement_id', '=', req.params.requirementId)
          .execute();
      }

      logger.info('Assessment requirement updated', {
        assessmentId: req.params.id,
        requirementId: req.params.requirementId,
        requestId: req.requestId,
      });

      res.json({ message: 'Assessment requirement updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Update assessment requirement error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:id/requirements/:requirementId/evidence',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      const assessmentReq = await db
        .selectFrom('assessment_requirement')
        .where('assessment_id', '=', req.params.id)
        .where('requirement_id', '=', req.params.requirementId)
        .selectAll()
        .executeTakeFirst();

      if (!assessmentReq) {
        res.status(404).json({ error: 'Assessment requirement not found' });
        return;
      }

      const evidence = (await db
        .selectFrom('assessment_requirement_evidence')
        .innerJoin(
          'evidence',
          (join) =>
            join.onRef(
              'evidence.id' as any,
              '=',
              'assessment_requirement_evidence.evidence_id' as any
            )
        )
        .innerJoin(
          'app_user',
          (join) =>
            join.onRef(
              'app_user.id' as any,
              '=',
              'evidence.author_id' as any
            )
        )
        .where('assessment_requirement_evidence.assessment_requirement_id', '=', assessmentReq.id)
        .selectAll()
        .execute()) as any[];

      const evidenceIds = evidence.map((e: any) => e.id);
      const tagsByEvidence = await fetchTagsForEntities(db, 'evidence_tag', 'evidence_id', evidenceIds);
      const evidenceWithTags = evidence.map((e: any) => ({
        ...e,
        tags: tagsByEvidence[e.id] || [],
      }));

      res.json({
        data: evidenceWithTags,
      });
    } catch (error) {
      logger.error('Get requirement evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:id/evidence',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      const evidence = (await db
        .selectFrom('assessment_requirement_evidence')
        .innerJoin('evidence', (join) =>
          join.onRef('evidence.id' as any, '=', 'assessment_requirement_evidence.evidence_id' as any)
        )
        .innerJoin('assessment_requirement', (join) =>
          join.onRef('assessment_requirement.id' as any, '=', 'assessment_requirement_evidence.assessment_requirement_id' as any)
        )
        .leftJoin('app_user as author', (join) =>
          join.onRef('author.id' as any, '=', 'evidence.author_id' as any)
        )
        .where('assessment_requirement.assessment_id', '=', req.params.id)
        .select([
          'evidence.id',
          'evidence.name',
          'evidence.description',
          'evidence.state',
          'evidence.author_id',
          'evidence.is_counter_evidence',
          'evidence.classification',
          'evidence.created_at',
          'evidence.expires_on',
          'author.display_name as author_name',
          'assessment_requirement.requirement_id',
        ] as any[])
        .execute()) as any[];

      // Deduplicate evidence (one item can be linked to multiple requirements)
      const evidenceMap = new Map<string, any>();
      for (const e of evidence) {
        if (!evidenceMap.has(e.id)) {
          evidenceMap.set(e.id, { ...e, requirement_ids: [e.requirement_id] });
        } else {
          evidenceMap.get(e.id).requirement_ids.push(e.requirement_id);
        }
      }
      const uniqueEvidence = Array.from(evidenceMap.values());

      const evidenceIds = uniqueEvidence.map((e: any) => e.id);
      const tagsByEvidence = await fetchTagsForEntities(db, 'evidence_tag', 'evidence_id', evidenceIds);
      const evidenceWithTags = uniqueEvidence.map((e: any) => ({
        ...e,
        tags: tagsByEvidence[e.id] || [],
      }));

      res.json({
        data: evidenceWithTags,
      });
    } catch (error) {
      logger.error('Get assessment evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get all claims for an assessment (via its attestation(s))
router.get(
  '/:id/claims',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      // Find all attestations for this assessment
      const attestations = await db
        .selectFrom('attestation')
        .where('assessment_id', '=', req.params.id)
        .select(['id'])
        .execute();

      if (attestations.length === 0) {
        res.json({ data: [] });
        return;
      }

      const attestationIds = attestations.map(a => a.id);

      // Fetch claims linked to these attestations
      const claims = (await db
        .selectFrom('claim')
        .where('attestation_id', 'in', attestationIds)
        .selectAll()
        .orderBy('created_at', 'asc')
        .execute()) as any[];

      // For each claim, get evidence counts
      const claimIds = claims.map(c => c.id);

      let evidenceCounts = new Map<string, number>();
      let counterEvidenceCounts = new Map<string, number>();
      let mitigationCounts = new Map<string, number>();

      if (claimIds.length > 0) {
        const evCounts = await db
          .selectFrom('claim_evidence')
          .where('claim_id', 'in', claimIds)
          .select((eb) => [
            'claim_id',
            eb.fn.countAll().as('count'),
          ])
          .groupBy('claim_id')
          .execute();
        for (const row of evCounts) {
          evidenceCounts.set(row.claim_id, Number(row.count));
        }

        const ceCounts = await db
          .selectFrom('claim_counter_evidence')
          .where('claim_id', 'in', claimIds)
          .select((eb) => [
            'claim_id',
            eb.fn.countAll().as('count'),
          ])
          .groupBy('claim_id')
          .execute();
        for (const row of ceCounts) {
          counterEvidenceCounts.set(row.claim_id, Number(row.count));
        }

        const mitCounts = await db
          .selectFrom('claim_mitigation_strategy')
          .where('claim_id', 'in', claimIds)
          .select((eb) => [
            'claim_id',
            eb.fn.countAll().as('count'),
          ])
          .groupBy('claim_id')
          .execute();
        for (const row of mitCounts) {
          mitigationCounts.set(row.claim_id, Number(row.count));
        }
      }

      const claimsWithCounts = claims.map(c => ({
        ...c,
        evidence_count: evidenceCounts.get(c.id) || 0,
        counter_evidence_count: counterEvidenceCounts.get(c.id) || 0,
        mitigation_count: mitigationCounts.get(c.id) || 0,
      }));

      res.json({ data: claimsWithCounts });
    } catch (error) {
      logger.error('Get assessment claims error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:id/requirements/:requirementId/notes',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      const assessmentReq = await db
        .selectFrom('assessment_requirement')
        .where('assessment_id', '=', req.params.id)
        .where('requirement_id', '=', req.params.requirementId)
        .selectAll()
        .executeTakeFirst();

      if (!assessmentReq) {
        res.status(404).json({ error: 'Assessment requirement not found' });
        return;
      }

      const notes = (await db
        .selectFrom('work_note')
        .innerJoin(
          'app_user',
          (join) =>
            join.onRef(
              'app_user.id' as any,
              '=',
              'work_note.user_id' as any
            )
        )
        .where('work_note.assessment_requirement_id', '=', assessmentReq.id)
        .selectAll()
        .orderBy('work_note.created_at', 'desc')
        .execute()) as any[];

      res.json({ data: notes });
    } catch (error) {
      logger.error('Get work notes error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/requirements/:requirementId/notes',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = addWorkNoteSchema.parse(req.body);
      const db = getDatabase();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      const assessmentReq = await db
        .selectFrom('assessment_requirement')
        .where('assessment_id', '=', req.params.id)
        .where('requirement_id', '=', req.params.requirementId)
        .selectAll()
        .executeTakeFirst();

      if (!assessmentReq) {
        res.status(404).json({ error: 'Assessment requirement not found' });
        return;
      }

      const noteId = uuidv4();

      await db
        .insertInto('work_note')
        .values({
          id: noteId,
          assessment_requirement_id: assessmentReq.id,
          user_id: req.user!.id,
          content: data.content,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();

      // Notify all other participants on the assessment
      const assessors = await db
        .selectFrom('assessment_assessor')
        .where('assessment_id', '=', req.params.id)
        .select('user_id')
        .execute();

      const assessees = await db
        .selectFrom('assessment_assessee')
        .where('assessment_id', '=', req.params.id)
        .select('user_id')
        .execute();

      const allParticipants = [...assessors, ...assessees];
      for (const participant of allParticipants) {
        // Do not notify the note author
        if (participant.user_id !== req.user!.id) {
          await createNotification(db, {
            userId: participant.user_id,
            type: 'work_note_added',
            title: 'Work Note Added',
            message: `A new work note has been added to assessment "${assessment.title}"`,
            link: `/assessments/${req.params.id}`,
          });
        }
      }

      logger.info('Work note created', {
        noteId,
        assessmentId: req.params.id,
        requirementId: req.params.requirementId,
        requestId: req.requestId,
      });

      res.status(201).json({ id: noteId, message: 'Work note added successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Add work note error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:id/notes',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      const notes = (await db
        .selectFrom('work_note')
        .innerJoin(
          'assessment_requirement',
          (join) =>
            join.onRef(
              'assessment_requirement.id' as any,
              '=',
              'work_note.assessment_requirement_id' as any
            )
        )
        .innerJoin(
          'app_user',
          (join) =>
            join.onRef(
              'app_user.id' as any,
              '=',
              'work_note.user_id' as any
            )
        )
        .where('assessment_requirement.assessment_id', '=', req.params.id)
        .selectAll()
        .orderBy('work_note.created_at', 'desc')
        .execute()) as any[];

      res.json({ data: notes });
    } catch (error) {
      logger.error('Get assessment notes error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', req.params.id)
        .select(['id', 'title', 'state'])
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      // Delete related records first
      await db.deleteFrom('work_note')
        .where('assessment_requirement_id', 'in',
          db.selectFrom('assessment_requirement')
            .select('id')
            .where('assessment_id', '=', req.params.id)
        )
        .execute();

      await db.deleteFrom('assessment_requirement')
        .where('assessment_id', '=', req.params.id)
        .execute();

      await db.deleteFrom('assessment_assessor')
        .where('assessment_id', '=', req.params.id)
        .execute();

      await db.deleteFrom('assessment_assessee')
        .where('assessment_id', '=', req.params.id)
        .execute();

      await db.deleteFrom('assessment_tag')
        .where('assessment_id', '=', req.params.id)
        .execute();

      await db.deleteFrom('assessment')
        .where('id', '=', req.params.id)
        .execute();

      logger.info('Assessment deleted', {
        assessmentId: req.params.id,
        title: assessment.title,
        requestId: req.requestId,
      });

      res.json({ message: 'Assessment deleted' });
    } catch (error) {
      logger.error('Delete assessment error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
