import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import busboy from 'busboy';
import crypto from 'crypto';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { syncEntityTags, fetchTagsForEntities } from '../utils/tags.js';
import { logAudit } from '../utils/audit.js';
import { createNotification } from '../utils/notifications.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { validatePagination } from '../utils/pagination.js';

const router = Router();

/**
 * Check if a user is a participant (assessor or assessee) in an assessment, or is an admin.
 */
async function isAssessmentParticipant(db: any, userId: string, userRole: string, assessmentId: string): Promise<boolean> {
  if (userRole === 'admin') return true;

  const assessor = await db
    .selectFrom('assessment_assessor')
    .where('assessment_id', '=', assessmentId)
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst();
  if (assessor) return true;

  const assessee = await db
    .selectFrom('assessment_assessee')
    .where('assessment_id', '=', assessmentId)
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst();
  return !!assessee;
}

/**
 * Get the assessment ID from an assessment_requirement ID.
 */
async function getAssessmentIdFromRequirement(db: any, assessmentRequirementId: string): Promise<string | null> {
  const row = await db
    .selectFrom('assessment_requirement')
    .where('id', '=', assessmentRequirementId)
    .select('assessment_id')
    .executeTakeFirst();
  return row?.assessment_id || null;
}

const createEvidenceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  state: z.enum(['in_review', 'in_progress', 'claimed', 'expired']).default('in_progress'),
  expiresOn: z.string().nullable().optional(),
  isCounterEvidence: z.boolean().default(false),
  classification: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const addNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required'),
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const { limit, offset } = validatePagination(req.query);
    const state = req.query.state as string | undefined;
    const assessmentId = req.query.assessmentId as string | undefined;
    const requirementId = req.query.requirementId as string | undefined;

    let query = db.selectFrom('evidence')
      .leftJoin('app_user as author', (join) => join.onRef('author.id' as any, '=', 'evidence.author_id' as any))
      .leftJoin('app_user as reviewer', (join) => join.onRef('reviewer.id' as any, '=', 'evidence.reviewer_id' as any))
      .select((eb) => [
        'evidence.id',
        'evidence.bom_ref',
        'evidence.name',
        'evidence.property_name',
        'evidence.description',
        'evidence.state',
        'evidence.author_id',
        'evidence.reviewer_id',
        'evidence.expires_on',
        'evidence.is_counter_evidence',
        'evidence.classification',
        'evidence.created_at',
        'evidence.updated_at',
        'author.display_name as author_name',
        'reviewer.display_name as reviewer_name',
        eb.selectFrom('assessment_requirement_evidence')
          .whereRef('assessment_requirement_evidence.evidence_id', '=', 'evidence.id')
          .select(eb.fn.countAll().as('count'))
          .as('assessment_count'),
      ]);

    if (state) {
      query = query.where('evidence.state', '=', state as any);
    }

    if (assessmentId) {
      query = query
        .innerJoin('assessment_requirement_evidence', (join) =>
          join.onRef('assessment_requirement_evidence.evidence_id', '=', 'evidence.id' as any)
        )
        .innerJoin('assessment_requirement', (join) =>
          join.onRef('assessment_requirement.id', '=', 'assessment_requirement_evidence.assessment_requirement_id' as any)
        )
        .where('assessment_requirement.assessment_id' as any, '=', assessmentId);

      if (requirementId) {
        query = query.where('assessment_requirement.requirement_id' as any, '=', requirementId);
      }
    }

    const countQuery = db.selectFrom('evidence')
      .select(db.fn.count<number>('id').as('count'));

    let countWithFilters = countQuery;
    if (state) {
      countWithFilters = countWithFilters.where('state', '=', state as any);
    }

    if (assessmentId) {
      countWithFilters = countWithFilters
        .innerJoin('assessment_requirement_evidence', (join) =>
          join.onRef('assessment_requirement_evidence.evidence_id', '=', 'evidence.id' as any)
        )
        .innerJoin('assessment_requirement', (join) =>
          join.onRef('assessment_requirement.id', '=', 'assessment_requirement_evidence.assessment_requirement_id' as any)
        )
        .where('assessment_requirement.assessment_id' as any, '=', assessmentId);

      if (requirementId) {
        countWithFilters = countWithFilters.where('assessment_requirement.requirement_id' as any, '=', requirementId);
      }
    }

    const total = await countWithFilters.executeTakeFirstOrThrow().then(r => r.count);
    const evidence = await query.limit(limit).offset(offset).execute();

    const evidenceIds = evidence.map((e: any) => e.id);
    const tagsByEvidence = await fetchTagsForEntities(db, 'evidence_tag', 'evidence_id', evidenceIds);
    const evidenceWithTags = evidence.map((e: any) => ({
      ...e,
      tags: tagsByEvidence[e.id] || [],
    }));

    res.json({
      data: evidenceWithTags,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    logger.error('Get evidence error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const includeContent = req.query.include_content === 'true';

    const evidence = await db
      .selectFrom('evidence')
      .leftJoin('app_user as author', (join) => join.onRef('author.id' as any, '=', 'evidence.author_id' as any))
      .leftJoin('app_user as reviewer', (join) => join.onRef('reviewer.id' as any, '=', 'evidence.reviewer_id' as any))
      .where('evidence.id', '=', req.params.id)
      .select([
        'evidence.id',
        'evidence.bom_ref',
        'evidence.name',
        'evidence.property_name',
        'evidence.description',
        'evidence.state',
        'evidence.author_id',
        'evidence.reviewer_id',
        'evidence.expires_on',
        'evidence.is_counter_evidence',
        'evidence.classification',
        'evidence.created_at',
        'evidence.updated_at',
        'author.display_name as author_name',
        'reviewer.display_name as reviewer_name',
      ] as any[])
      .executeTakeFirst() as any;

    if (!evidence) {
      res.status(404).json({ error: 'Evidence not found' });
      return;
    }

    const notes = (await db
      .selectFrom('evidence_note')
      .innerJoin(
        'app_user',
        (join) =>
          join.onRef(
            'app_user.id' as any,
            '=',
            'evidence_note.user_id' as any
          )
      )
      .where('evidence_note.evidence_id', '=', req.params.id)
      .selectAll()
      .orderBy('evidence_note.created_at', 'desc')
      .execute()) as any[];

    const attachmentsQuery = db
      .selectFrom('evidence_attachment')
      .where('evidence_attachment.evidence_id', '=', req.params.id);

    const attachments = await (includeContent
      ? attachmentsQuery.selectAll().execute()
      : attachmentsQuery.select([
          'id',
          'evidence_id',
          'filename',
          'content_type',
          'size_bytes',
          'storage_path',
          'content_hash',
          'created_at',
          'updated_at',
        ]).execute());

    const tagsByEvidence = await fetchTagsForEntities(db, 'evidence_tag', 'evidence_id', [req.params.id]);

    res.json({
      evidence,
      notes,
      attachments,
      tags: tagsByEvidence[req.params.id] || [],
    });
  } catch (error) {
    logger.error('Get evidence error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get claims referencing a specific evidence item
router.get('/:id/claims', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const evidenceId = req.params.id;

    // Find claims where this evidence is supporting, counter, or mitigation
    const supportingClaims = (await db
      .selectFrom('claim_evidence')
      .innerJoin('claim', (join) =>
        join.onRef('claim.id' as any, '=', 'claim_evidence.claim_id' as any)
      )
      .where('claim_evidence.evidence_id', '=', evidenceId)
      .select([
        'claim.id',
        'claim.name',
        'claim.target',
        'claim.predicate',
        'claim.is_counter_claim',
      ] as any[])
      .execute()) as any[];

    const counterClaims = (await db
      .selectFrom('claim_counter_evidence')
      .innerJoin('claim', (join) =>
        join.onRef('claim.id' as any, '=', 'claim_counter_evidence.claim_id' as any)
      )
      .where('claim_counter_evidence.evidence_id', '=', evidenceId)
      .select([
        'claim.id',
        'claim.name',
        'claim.target',
        'claim.predicate',
        'claim.is_counter_claim',
      ] as any[])
      .execute()) as any[];

    const mitigationClaims = (await db
      .selectFrom('claim_mitigation_strategy')
      .innerJoin('claim', (join) =>
        join.onRef('claim.id' as any, '=', 'claim_mitigation_strategy.claim_id' as any)
      )
      .where('claim_mitigation_strategy.evidence_id', '=', evidenceId)
      .select([
        'claim.id',
        'claim.name',
        'claim.target',
        'claim.predicate',
        'claim.is_counter_claim',
      ] as any[])
      .execute()) as any[];

    const allClaims = [
      ...supportingClaims.map((c: any) => ({ ...c, is_counter: false, is_mitigation: false })),
      ...counterClaims.map((c: any) => ({ ...c, is_counter: true, is_mitigation: false })),
      ...mitigationClaims.map((c: any) => ({ ...c, is_counter: false, is_mitigation: true })),
    ];

    // Deduplicate by claim ID
    const seen = new Set<string>();
    const uniqueClaims = allClaims.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    res.json({ data: uniqueClaims });
  } catch (error) {
    logger.error('Get evidence claims error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, requireRole('admin', 'assessor', 'assessee'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const data = createEvidenceSchema.parse(req.body);
    const db = getDatabase();
    const evidenceId = uuidv4();

    await db
      .insertInto('evidence')
      .values(toSnakeCase({
        id: evidenceId,
        name: data.name,
        description: data.description,
        state: data.state,
        authorId: req.user.id,
        expiresOn: data.expiresOn ? new Date(data.expiresOn) : undefined,
        isCounterEvidence: data.isCounterEvidence,
        classification: data.classification,
      }))
      .execute();

    await logAudit(db, {
      entityType: 'evidence',
      entityId: evidenceId,
      action: 'create',
      userId: req.user.id,
      changes: {
        name: data.name,
        description: data.description,
        state: data.state,
      },
    });

    if (data.tags && data.tags.length > 0) {
      await syncEntityTags(db, 'evidence_tag', 'evidence_id', evidenceId, data.tags);
    }

    logger.info('Evidence created', {
      evidenceId,
      name: data.name,
      authorId: req.user.id,
      requestId: req.requestId,
    });

    res.status(201).json({
      id: evidenceId,
      name: data.name,
      description: data.description,
      state: data.state,
      authorId: req.user.id,
      expiresOn: data.expiresOn ? new Date(data.expiresOn) : undefined,
      isCounterEvidence: data.isCounterEvidence,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }

    logger.error('Create evidence error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update evidence
const updateEvidenceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  state: z.enum(['in_review', 'in_progress', 'claimed', 'expired', 'approved']).optional(),
  expiresOn: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
  reviewerId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

router.put('/:id', requireAuth, requireRole('admin', 'assessor'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateEvidenceSchema.parse(req.body);
    const db = getDatabase();

    const evidence = await db
      .selectFrom('evidence')
      .where('id', '=', req.params.id)
      .selectAll()
      .executeTakeFirst();

    if (!evidence) {
      res.status(404).json({ error: 'Evidence not found' });
      return;
    }

    if (evidence.state === 'claimed') {
      res.status(403).json({ error: 'Evidence is immutable once claimed' });
      return;
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.expiresOn !== undefined) updateData.expiresOn = data.expiresOn ? new Date(data.expiresOn) : null;
    if (data.classification !== undefined) updateData.classification = data.classification;
    if (data.reviewerId !== undefined) updateData.reviewerId = data.reviewerId;

    if (Object.keys(updateData).length > 0) {
      await db
        .updateTable('evidence')
        .set(toSnakeCase(updateData))
        .where('id', '=', req.params.id)
        .execute();

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id,
        action: 'update',
        userId: req.user!.id,
        changes: toSnakeCase(updateData),
      });
    }

    if (data.tags !== undefined) {
      await syncEntityTags(db, 'evidence_tag', 'evidence_id', req.params.id, data.tags);
    }

    logger.info('Evidence updated', {
      evidenceId: req.params.id,
      requestId: req.requestId,
    });

    // Fetch and return the updated evidence
    const updatedEvidence = await db
      .selectFrom('evidence')
      .where('id', '=', req.params.id)
      .selectAll()
      .executeTakeFirst();

    const tagsByEvidence = await fetchTagsForEntities(db, 'evidence_tag', 'evidence_id', [req.params.id]);

    res.json({
      ...updatedEvidence,
      tags: tagsByEvidence[req.params.id] || [],
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }

    logger.error('Update evidence error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/:id/notes',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const data = addNoteSchema.parse(req.body);
      const db = getDatabase();

      const evidence = await db
        .selectFrom('evidence')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      const noteId = uuidv4();

      await db
        .insertInto('evidence_note')
        .values(toSnakeCase({
          id: noteId,
          evidenceId: req.params.id,
          userId: req.user.id,
          content: data.content,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
        .execute();

      logger.info('Evidence note added', {
        evidenceId: req.params.id,
        noteId,
        userId: req.user.id,
        requestId: req.requestId,
      });

      res.status(201).json({
        id: noteId,
        content: data.content,
        userId: req.user.id,
        createdAt: new Date(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Add evidence note error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const linkEvidenceSchema = z.object({
  assessmentRequirementId: z.string().uuid('Invalid assessment requirement ID'),
});

router.post(
  '/:id/link',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = linkEvidenceSchema.parse(req.body);
      const db = getDatabase();

      const evidence = await db
        .selectFrom('evidence')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      const assessmentReq = await db
        .selectFrom('assessment_requirement')
        .where('id', '=', data.assessmentRequirementId)
        .selectAll()
        .executeTakeFirst();

      if (!assessmentReq) {
        res.status(404).json({ error: 'Assessment requirement not found' });
        return;
      }

      // Authorization check: user must be a participant in the assessment
      const assessmentId = assessmentReq.assessment_id;
      const isParticipant = await isAssessmentParticipant(db, req.user!.id, req.user!.role, assessmentId);
      if (!isParticipant) {
        res.status(403).json({ error: 'You are not a participant in this assessment' });
        return;
      }

      const existing = await db
        .selectFrom('assessment_requirement_evidence')
        .where('assessment_requirement_id', '=', data.assessmentRequirementId)
        .where('evidence_id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (existing) {
        res.status(409).json({ error: 'Evidence is already linked to this requirement' });
        return;
      }

      await db
        .insertInto('assessment_requirement_evidence')
        .values(toSnakeCase({
          assessmentRequirementId: data.assessmentRequirementId,
          evidenceId: req.params.id,
          createdAt: new Date(),
        }))
        .execute();

      logger.info('Evidence linked to requirement', {
        evidenceId: req.params.id,
        assessmentRequirementId: data.assessmentRequirementId,
        userId: req.user?.id,
        requestId: req.requestId,
      });

      res.status(201).json({ message: 'Evidence linked successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Link evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const unlinkEvidenceSchema = z.object({
  assessmentRequirementId: z.string().uuid('Invalid assessment requirement ID'),
});

router.delete(
  '/:id/unlink',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = unlinkEvidenceSchema.parse(req.body);
      const db = getDatabase();

      // Validate evidence exists
      const evidence = await db
        .selectFrom('evidence')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      // Validate assessment_requirement exists and get assessment_id
      const assessmentReq = await db
        .selectFrom('assessment_requirement')
        .where('id', '=', data.assessmentRequirementId)
        .selectAll()
        .executeTakeFirst();

      if (!assessmentReq) {
        res.status(404).json({ error: 'Assessment requirement not found' });
        return;
      }

      // Authorization check: user must be a participant in the assessment
      const assessmentId = assessmentReq.assessment_id;
      const isParticipant = await isAssessmentParticipant(db, req.user!.id, req.user!.role, assessmentId);
      if (!isParticipant) {
        res.status(403).json({ error: 'You are not a participant in this assessment' });
        return;
      }

      const result = await db
        .deleteFrom('assessment_requirement_evidence')
        .where('evidence_id', '=', req.params.id)
        .where('assessment_requirement_id', '=', data.assessmentRequirementId)
        .execute();

      if (Number(result[0].numDeletedRows) === 0) {
        res.status(404).json({ error: 'Link not found' });
        return;
      }

      logger.info('Evidence unlinked from requirement', {
        evidenceId: req.params.id,
        assessmentRequirementId: data.assessmentRequirementId,
        userId: req.user?.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Evidence unlinked successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Unlink evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const submitForReviewSchema = z.object({
  reviewerId: z.string().uuid('Invalid reviewer ID'),
});

router.post(
  '/:id/submit-for-review',
  requireAuth,
  requireRole('admin', 'assessor', 'assessee'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = submitForReviewSchema.parse(req.body);
      const db = getDatabase();

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const evidence = await db
        .selectFrom('evidence')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      // Ownership check: only the evidence author or an admin can submit for review
      if (req.user.role !== 'admin' && evidence.author_id !== req.user.id) {
        res.status(403).json({ error: 'Only the evidence author or an admin can submit evidence for review' });
        return;
      }

      // State check: evidence must be in 'in_progress' state
      if (evidence.state !== 'in_progress') {
        res.status(409).json({ error: 'Evidence can only be submitted for review from the in_progress state' });
        return;
      }

      // Self-review prevention
      if (data.reviewerId === req.user.id) {
        res.status(400).json({ error: 'You cannot assign yourself as the reviewer' });
        return;
      }

      if (evidence.author_id === data.reviewerId) {
        res.status(400).json({ error: 'Reviewer cannot be the same as the author' });
        return;
      }

      const reviewer = await db
        .selectFrom('app_user')
        .where('id', '=', data.reviewerId)
        .selectAll()
        .executeTakeFirst();

      if (!reviewer) {
        res.status(404).json({ error: 'Reviewer not found' });
        return;
      }

      await db
        .updateTable('evidence')
        .set(toSnakeCase({
          state: 'in_review',
          reviewerId: data.reviewerId,
        }))
        .where('id', '=', req.params.id)
        .execute();

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id,
        action: 'state_change',
        userId: req.user.id,
        changes: toSnakeCase({ state: 'in_review', reviewerId: data.reviewerId }),
      });

      await createNotification(db, {
        userId: data.reviewerId,
        type: 'evidence_review',
        title: 'Evidence Submitted for Review',
        message: `Evidence "${evidence.name}" has been submitted for your review`,
        link: `/evidence/${req.params.id}`,
      });

      logger.info('Evidence submitted for review', {
        evidenceId: req.params.id,
        reviewerId: data.reviewerId,
        userId: req.user.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Evidence submitted for review successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Submit for review error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/approve',
  requireAuth,
  requireRole('admin', 'assessor'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const evidence = await db
        .selectFrom('evidence')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      if (evidence.state !== 'in_review') {
        res.status(409).json({ error: 'Evidence must be in review status to approve' });
        return;
      }

      if (req.user.role !== 'admin' && evidence.reviewer_id !== req.user.id) {
        res.status(403).json({ error: 'Only the assigned reviewer or an admin can approve evidence' });
        return;
      }

      // Self-approval prevention: evidence authors cannot approve their own evidence
      if (evidence.author_id === req.user.id) {
        res.status(403).json({ error: 'Evidence authors cannot approve their own evidence' });
        return;
      }

      const result = await db
        .updateTable('evidence')
        .set({
          state: 'claimed',
        })
        .where('id', '=', req.params.id)
        .where('state', '=', 'in_review')
        .execute();

      if (Number(result[0].numUpdatedRows) === 0) {
        res.status(409).json({ error: 'Evidence state has changed. Please refresh and try again.' });
        return;
      }

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id,
        action: 'state_change',
        userId: req.user.id,
        changes: { state: 'claimed' },
      });

      await createNotification(db, {
        userId: evidence.author_id,
        type: 'evidence_approved',
        title: 'Evidence Approved',
        message: `Your evidence "${evidence.name}" has been approved`,
        link: `/evidence/${req.params.id}`,
      });

      logger.info('Evidence approved', {
        evidenceId: req.params.id,
        reviewerId: req.user.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Evidence approved successfully' });
    } catch (error) {
      logger.error('Approve evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const rejectEvidenceSchema = z.object({
  note: z.string().min(1, 'Rejection note is required'),
});

router.post(
  '/:id/reject',
  requireAuth,
  requireRole('admin', 'assessor'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = rejectEvidenceSchema.parse(req.body);
      const db = getDatabase();

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const evidence = await db
        .selectFrom('evidence')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      if (evidence.state !== 'in_review') {
        res.status(409).json({ error: 'Evidence must be in review status to reject' });
        return;
      }

      if (req.user.role !== 'admin' && evidence.reviewer_id !== req.user.id) {
        res.status(403).json({ error: 'Only the assigned reviewer or an admin can reject evidence' });
        return;
      }

      // Self-rejection prevention: evidence authors cannot reject their own evidence
      if (evidence.author_id === req.user.id) {
        res.status(403).json({ error: 'Evidence authors cannot reject their own evidence' });
        return;
      }

      const result = await db
        .updateTable('evidence')
        .set(toSnakeCase({
          state: 'in_progress',
        }))
        .where('id', '=', req.params.id)
        .where('state', '=', 'in_review')
        .execute();

      if (Number(result[0].numUpdatedRows) === 0) {
        res.status(409).json({ error: 'Evidence state has changed. Please refresh and try again.' });
        return;
      }

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id,
        action: 'state_change',
        userId: req.user.id,
        changes: toSnakeCase({ state: 'in_progress', rejectionReason: data.note }),
      });

      const noteId = uuidv4();
      await db
        .insertInto('evidence_note')
        .values(toSnakeCase({
          id: noteId,
          evidenceId: req.params.id,
          userId: req.user.id,
          content: `REJECTED: ${data.note}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
        .execute();

      await createNotification(db, {
        userId: evidence.author_id,
        type: 'evidence_rejected',
        title: 'Evidence Rejected',
        message: `Your evidence "${evidence.name}" has been rejected. Reason: ${data.note}`,
        link: `/evidence/${req.params.id}`,
      });

      logger.info('Evidence rejected', {
        evidenceId: req.params.id,
        reviewerId: req.user.id,
        noteId,
        requestId: req.requestId,
      });

      res.json({ message: 'Evidence rejected successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Reject evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Detect CycloneDX media type from filename and (optionally) raw content.
 * Returns the proper CycloneDX media type when the file is recognized,
 * or the original fallback type when it is not.
 */
function detectCycloneDXMediaType(filename: string, fallback: string, content?: Buffer | string): string {
  const lower = filename.toLowerCase();

  // Filename-based detection (*.cdx.json / *.cdx.xml)
  if (lower.endsWith('.cdx.json')) return 'application/vnd.cyclonedx+json';
  if (lower.endsWith('.cdx.xml')) return 'application/vnd.cyclonedx+xml';

  // Content-based detection for generic .json / .xml uploads
  if (content) {
    const head = (typeof content === 'string' ? content : content.toString('utf-8', 0, Math.min(content.length, 512))).trimStart();
    if (lower.endsWith('.json') && head.includes('"bomFormat"') && head.includes('"CycloneDX"')) {
      return 'application/vnd.cyclonedx+json';
    }
    if (lower.endsWith('.xml') && head.includes('<bom') && head.includes('cyclonedx')) {
      return 'application/vnd.cyclonedx+xml';
    }
  }

  return fallback;
}

const createAttachmentSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.string().min(1, 'Content type is required'),
  binaryContent: z.string().min(1, 'Binary content is required'),
});

// Helper function to compute SHA-256 hash of buffer
function computeContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

router.post(
  '/:id/attachments',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const db = getDatabase();

      const evidence = await db
        .selectFrom('evidence')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      // Check if this is JSON body upload or multipart upload
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        // JSON body upload (for demo data seeding)
        try {
          const data = createAttachmentSchema.parse(req.body);
          const attachmentId = uuidv4();

          // Decode base64 content
          const buffer = Buffer.from(data.binaryContent, 'base64');
          const contentHash = computeContentHash(buffer);
          const sizeBytes = buffer.length;
          const resolvedContentType = detectCycloneDXMediaType(data.filename, data.contentType, buffer);

          await db
            .insertInto('evidence_attachment')
            .values(toSnakeCase({
              id: attachmentId,
              evidenceId: req.params.id,
              filename: data.filename,
              contentType: resolvedContentType,
              sizeBytes,
              storagePath: `evidence/${req.params.id}/${attachmentId}-${data.filename}`,
              binaryContent: data.binaryContent,
              contentHash,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
            .execute();

          logger.info('Attachment created from JSON body', {
            evidenceId: req.params.id,
            attachmentId,
            filename: data.filename,
            userId: req.user?.id,
            requestId: req.requestId,
          });

          res.status(201).json({
            message: 'Attachment created successfully',
            attachments: [{
              id: attachmentId,
              filename: data.filename,
              contentType: resolvedContentType,
              sizeBytes,
              storagePath: `evidence/${req.params.id}/${attachmentId}-${data.filename}`,
              contentHash,
            }],
          });
          return;
        } catch (error) {
          if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Invalid input', details: error.errors });
            return;
          }
          throw error;
        }
      }

      // Multipart form upload
      const bb = busboy({
        headers: req.headers,
      });
      const uploadDir = path.join(process.cwd(), 'uploads', 'evidence', req.params.id);

      await fs.mkdir(uploadDir, { recursive: true });

      const attachments: any[] = [];

      bb.on('file', async (fieldname, file, info) => {
        try {
          const attachmentId = uuidv4();
          const filename = info.filename;
          const contentTypeFromFile = info.mimeType;
          const storagePath = `evidence/${req.params.id}/${attachmentId}-${filename}`;
          const fullPath = path.join(uploadDir, `${attachmentId}-${filename}`);

          const chunks: Buffer[] = [];

          file.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          file.on('end', async () => {
            try {
              const buffer = Buffer.concat(chunks);
              await fs.writeFile(fullPath, buffer);

              const sizeBytes = buffer.length;
              const contentHash = computeContentHash(buffer);
              const binaryContent = buffer.toString('base64');
              const resolvedContentType = detectCycloneDXMediaType(filename, contentTypeFromFile, buffer);

              await db
                .insertInto('evidence_attachment')
                .values(toSnakeCase({
                  id: attachmentId,
                  evidenceId: req.params.id,
                  filename,
                  contentType: resolvedContentType,
                  sizeBytes,
                  storagePath,
                  binaryContent,
                  contentHash,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }))
                .execute();

              attachments.push({
                id: attachmentId,
                filename,
                contentType: resolvedContentType,
                sizeBytes: sizeBytes,
                storagePath: storagePath,
                contentHash,
              });

              logger.info('Attachment uploaded', {
                evidenceId: req.params.id,
                attachmentId,
                filename,
                userId: req.user?.id,
                requestId: req.requestId,
              });
            } catch (error) {
              logger.error('Error saving attachment', { error, requestId: req.requestId });
            }
          });

          file.on('error', (error) => {
            logger.error('File upload error', { error, requestId: req.requestId });
          });
        } catch (error) {
          logger.error('Error processing file', { error, requestId: req.requestId });
        }
      });

      bb.on('close', () => {
        res.status(201).json({
          message: 'Attachments uploaded successfully',
          attachments,
        });
      });

      bb.on('error', (error) => {
        logger.error('Busboy error', { error, requestId: req.requestId });
        res.status(400).json({ error: 'Error processing upload' });
      });

      req.pipe(bb);
    } catch (error) {
      logger.error('Upload attachments error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:id/attachments/:attachmentId/download',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const attachment = await db
        .selectFrom('evidence_attachment')
        .where('evidence_attachment.id', '=', req.params.attachmentId)
        .where('evidence_attachment.evidence_id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!attachment) {
        res.status(404).json({ error: 'Attachment not found' });
        return;
      }

      res.setHeader('Content-Type', attachment.content_type);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);

      const fullPath = path.join(process.cwd(), 'uploads', attachment.storage_path);

      // Try to read from disk first
      let fileStream: any;
      try {
        await fs.access(fullPath);
        fileStream = createReadStream(fullPath);
        fileStream.pipe(res);

        fileStream.on('error', (error: any) => {
          logger.error('Error streaming file', { error, requestId: req.requestId });
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error downloading file' });
          }
        });
      } catch {
        // File doesn't exist on disk, try to serve from binary_content column
        if (attachment.binary_content) {
          try {
            const buffer = Buffer.from(attachment.binary_content, 'base64');
            res.send(buffer);
            logger.info('Attachment served from database', {
              evidenceId: req.params.id,
              attachmentId: req.params.attachmentId,
              userId: req.user?.id,
              requestId: req.requestId,
            });
          } catch (error) {
            logger.error('Error decoding binary content', { error, requestId: req.requestId });
            res.status(500).json({ error: 'Error downloading file' });
          }
        } else {
          res.status(404).json({ error: 'File not found' });
        }
      }
    } catch (error) {
      logger.error('Download attachment error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:id/attachments/:attachmentId',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const attachment = await db
        .selectFrom('evidence_attachment')
        .where('evidence_attachment.id', '=', req.params.attachmentId)
        .where('evidence_attachment.evidence_id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!attachment) {
        res.status(404).json({ error: 'Attachment not found' });
        return;
      }

      const fullPath = path.join(process.cwd(), 'uploads', attachment.storage_path);

      try {
        await fs.unlink(fullPath);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.error('Error deleting file', { error, requestId: req.requestId });
        }
      }

      await db
        .deleteFrom('evidence_attachment')
        .where('id', '=', req.params.attachmentId)
        .execute();

      logger.info('Attachment deleted', {
        evidenceId: req.params.id,
        attachmentId: req.params.attachmentId,
        userId: req.user?.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
      logger.error('Delete attachment error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
