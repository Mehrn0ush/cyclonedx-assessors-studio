import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import busboy from 'busboy';
import crypto from 'node:crypto';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requirePermission, getPermissionsForRole } from '../middleware/auth.js';
import { syncEntityTags, fetchTagsForEntities } from '../utils/tags.js';
import { logAudit } from '../utils/audit.js';
import { EVIDENCE_STATE_CHANGED } from '../events/catalog.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { validatePagination } from '../utils/pagination.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import {
  getStorageProvider,
  getStorageProviderName,
  getMaxFileSize,
  resolveProvider,
} from '../storage/index.js';
import type { StorageProviderName } from '../storage/types.js';
import type { Database } from '../db/types.js';

const router = Router();

/**
 * Check if a user is a participant (assessor or assessee) in an assessment, or is an admin.
 */
async function isAssessmentParticipant(db: Kysely<Database>, userId: string, userRole: string, assessmentId: string): Promise<boolean> {
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
 * Fetch evidence by ID with validation
 */
async function fetchEvidence(db: Kysely<Database>, evidenceId: string): Promise<Record<string, unknown> | undefined> {
  return db
    .selectFrom('evidence')
    .where('id', '=', evidenceId)
    .selectAll()
    .executeTakeFirst();
}

/**
 * Fetch assessment requirement by ID with validation
 */
async function fetchAssessmentRequirement(db: Kysely<Database>, assessmentRequirementId: string): Promise<Record<string, unknown> | undefined> {
  return db
    .selectFrom('assessment_requirement')
    .where('id', '=', assessmentRequirementId)
    .selectAll()
    .executeTakeFirst();
}

/**
 * Validate evidence submission for review
 */
async function validateEvidenceSubmission(
  evidence: Record<string, unknown> | undefined,
  reviewerId: string,
  authorId: string,
  userId: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!evidence) {
    return { valid: false, error: 'Evidence not found' };
  }
  if (evidence.state !== 'in_progress') {
    return { valid: false, error: 'Evidence can only be submitted for review from the in_progress state' };
  }
  if (reviewerId === userId) {
    return { valid: false, error: 'You cannot assign yourself as the reviewer' };
  }
  if (authorId === reviewerId) {
    return { valid: false, error: 'Reviewer cannot be the same as the author' };
  }
  return { valid: true };
}

/**
 * Validate evidence approval
 */
async function validateEvidenceApproval(
  evidence: Record<string, unknown> | undefined,
  userId: string,
  hasReviewAccess: boolean,
): Promise<{ valid: boolean; error?: string }> {
  if (!evidence) {
    return { valid: false, error: 'Evidence not found' };
  }
  if (evidence.state !== 'in_review') {
    return { valid: false, error: 'Evidence must be in review status to approve' };
  }
  if (!hasReviewAccess && evidence.reviewer_id !== userId) {
    return { valid: false, error: 'Only the assigned reviewer or an admin can approve evidence' };
  }
  if (evidence.author_id === userId) {
    return { valid: false, error: 'Evidence authors cannot approve their own evidence' };
  }
  return { valid: true };
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

router.get('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const { limit, offset } = validatePagination(req.query);
  const state = req.query.state as string | undefined;
  const assessmentId = req.query.assessmentId as string | undefined;
  const requirementId = req.query.requirementId as string | undefined;

  let query = db.selectFrom('evidence')
    .leftJoin('app_user as author', (join) => join.onRef('author.id', '=', 'evidence.author_id'))
    .leftJoin('app_user as reviewer', (join) => join.onRef('reviewer.id', '=', 'evidence.reviewer_id'))
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
    query = query.where('evidence.state', '=', state as 'in_review' | 'in_progress' | 'claimed' | 'expired');
  }

  if (assessmentId) {
    query = query
      .innerJoin('assessment_requirement_evidence', (join) =>
        join.onRef('assessment_requirement_evidence.evidence_id', '=', 'evidence.id')
      )
      .innerJoin('assessment_requirement', (join) =>
        join.onRef('assessment_requirement.id', '=', 'assessment_requirement_evidence.assessment_requirement_id')
      )
      .where(sql`assessment_requirement.assessment_id`, '=', assessmentId);

    if (requirementId) {
      query = query.where(sql`assessment_requirement.requirement_id`, '=', requirementId);
    }
  }

  const countQuery = db.selectFrom('evidence')
    .select(db.fn.count<number>('id').as('count'));

  let countWithFilters = countQuery;
  if (state) {
    countWithFilters = countWithFilters.where('state', '=', state as 'in_review' | 'in_progress' | 'claimed' | 'expired');
  }

  if (assessmentId) {
    countWithFilters = countWithFilters
      .innerJoin('assessment_requirement_evidence', (join) =>
        join.onRef('assessment_requirement_evidence.evidence_id', '=', 'evidence.id')
      )
      .innerJoin('assessment_requirement', (join) =>
        join.onRef('assessment_requirement.id', '=', 'assessment_requirement_evidence.assessment_requirement_id')
      )
      .where(sql`assessment_requirement.assessment_id`, '=', assessmentId);

    if (requirementId) {
      countWithFilters = countWithFilters.where(sql`assessment_requirement.requirement_id`, '=', requirementId);
    }
  }

  const total = await countWithFilters.executeTakeFirstOrThrow().then(r => r.count);
  const evidence = await query.limit(limit).offset(offset).execute();

  const evidenceIds = evidence.map((e: Record<string, unknown>) => e.id as string);
  const tagsByEvidence = await fetchTagsForEntities(db, 'evidence_tag', 'evidence_id', evidenceIds);
  const evidenceWithTags = evidence.map((e: Record<string, unknown>) => ({
    ...e,
    tags: tagsByEvidence[e.id as string] ?? [],
  }));

  res.json({
    data: evidenceWithTags,
    pagination: {
      limit,
      offset,
      total,
    },
  });
}));

router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const includeContent = req.query.include_content === 'true';

  const evidence = await db
    .selectFrom('evidence')
    .leftJoin('app_user as author', (join) => join.onRef('author.id', '=', 'evidence.author_id'))
    .leftJoin('app_user as reviewer', (join) => join.onRef('reviewer.id', '=', 'evidence.reviewer_id'))
    .where('evidence.id', '=', req.params.id as string)
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
    ])
    .executeTakeFirst();

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
          'app_user.id',
          '=',
          'evidence_note.user_id'
        )
    )
    .where('evidence_note.evidence_id', '=', req.params.id as string)
    .selectAll()
    .orderBy('evidence_note.created_at', 'desc')
    .execute()) as unknown[];

  const attachmentsQuery = db
    .selectFrom('evidence_attachment')
    .where('evidence_attachment.evidence_id', '=', req.params.id as string);

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

  const tagsByEvidence = await fetchTagsForEntities(db, 'evidence_tag', 'evidence_id', [req.params.id as string]);

  res.json({
    evidence,
    notes,
    attachments,
    tags: tagsByEvidence[req.params.id as string] ?? [],
  });
}));

interface ClaimRecord {
  id: string;
  name: string;
  target: string;
  predicate: string;
  is_counter_claim: boolean;
}

// Get claims referencing a specific evidence item
router.get('/:id/claims', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const evidenceId = req.params.id as string;

  // Find claims where this evidence is supporting, counter, or mitigation
  const supportingClaims = (await db
    .selectFrom('claim_evidence')
    .innerJoin('claim', (join) =>
      join.onRef('claim.id', '=', 'claim_evidence.claim_id')
    )
    .where('claim_evidence.evidence_id', '=', evidenceId)
    .select([
      'claim.id',
      'claim.name',
      'claim.target',
      'claim.predicate',
      'claim.is_counter_claim',
    ])
    .execute()) as ClaimRecord[];

  const counterClaims = (await db
    .selectFrom('claim_counter_evidence')
    .innerJoin('claim', (join) =>
      join.onRef('claim.id', '=', 'claim_counter_evidence.claim_id')
    )
    .where('claim_counter_evidence.evidence_id', '=', evidenceId)
    .select([
      'claim.id',
      'claim.name',
      'claim.target',
      'claim.predicate',
      'claim.is_counter_claim',
    ])
    .execute()) as ClaimRecord[];

  const mitigationClaims = (await db
    .selectFrom('claim_mitigation_strategy')
    .innerJoin('claim', (join) =>
      join.onRef('claim.id', '=', 'claim_mitigation_strategy.claim_id')
    )
    .where('claim_mitigation_strategy.evidence_id', '=', evidenceId)
    .select([
      'claim.id',
      'claim.name',
      'claim.target',
      'claim.predicate',
      'claim.is_counter_claim',
    ])
    .execute()) as ClaimRecord[];

  const allClaims = [
    ...supportingClaims.map((c: ClaimRecord) => ({ ...c, is_counter: false, is_mitigation: false })),
    ...counterClaims.map((c: ClaimRecord) => ({ ...c, is_counter: true, is_mitigation: false })),
    ...mitigationClaims.map((c: ClaimRecord) => ({ ...c, is_counter: false, is_mitigation: true })),
  ];

  // Deduplicate by claim ID
  const seen = new Set<string>();
  const uniqueClaims = allClaims.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  res.json({ data: uniqueClaims });
}));

router.post('/', requireAuth, requirePermission('evidence.create'), asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
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
    if (handleValidationError(res, error)) return;

    logger.error('Create evidence error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
}));

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

router.put('/:id', requireAuth, requirePermission('evidence.edit'), asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = updateEvidenceSchema.parse(req.body);
    const db = getDatabase();

    const evidence = await db
      .selectFrom('evidence')
      .where('id', '=', req.params.id as string)
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

    const updateData: Record<string, unknown> = {};
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
        .where('id', '=', req.params.id as string)
        .execute();

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id as string,
        action: 'update',
        userId: req.user?.id ?? '',
        changes: toSnakeCase(updateData),
      });
    }

    if (data.tags !== undefined) {
      await syncEntityTags(db, 'evidence_tag', 'evidence_id', req.params.id as string, data.tags);
    }

    logger.info('Evidence updated', {
      evidenceId: req.params.id as string,
      requestId: req.requestId,
    });

    // Fetch and return the updated evidence
    const updatedEvidence = await db
      .selectFrom('evidence')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    const tagsByEvidence = await fetchTagsForEntities(db, 'evidence_tag', 'evidence_id', [req.params.id as string]);

    res.json({
      ...updatedEvidence,
      tags: tagsByEvidence[req.params.id as string] || [],
    });
  } catch (error) {
    if (handleValidationError(res, error)) return;

    logger.error('Update evidence error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
}));

router.post(
  '/:id/notes',
  requireAuth,
  requirePermission('evidence.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const data = addNoteSchema.parse(req.body);
      const db = getDatabase();

      const evidence = await db
        .selectFrom('evidence')
        .where('id', '=', req.params.id as string)
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
          evidenceId: req.params.id as string,
          userId: req.user.id,
          content: data.content,
          createdAt: new Date(),
          updatedAt: new Date(),
        }) as unknown as any)
        .execute();

      logger.info('Evidence note added', {
        evidenceId: req.params.id as string,
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
      if (handleValidationError(res, error)) return;

      logger.error('Add evidence note error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  })
);

const linkEvidenceSchema = z.object({
  assessmentRequirementId: z.string().uuid('Invalid assessment requirement ID'),
});

router.post(
  '/:id/link',
  requireAuth,
  requirePermission('evidence.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = linkEvidenceSchema.parse(req.body);
      const db = getDatabase();

      const evidence = await fetchEvidence(db, req.params.id as string);
      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      const assessmentReq = await fetchAssessmentRequirement(db, data.assessmentRequirementId);
      if (!assessmentReq) {
        res.status(404).json({ error: 'Assessment requirement not found' });
        return;
      }

      const assessmentId = (assessmentReq.assessment_id as unknown) as string;
      const userId = req.user?.id ?? '';
      const userRole = req.user?.role ?? '';
      const isParticipant = await isAssessmentParticipant(db, userId, userRole, assessmentId);
      if (!isParticipant) {
        res.status(403).json({ error: 'You are not a participant in this assessment' });
        return;
      }

      const existing = await db
        .selectFrom('assessment_requirement_evidence')
        .where('assessment_requirement_id', '=', data.assessmentRequirementId)
        .where('evidence_id', '=', req.params.id as string)
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
          evidenceId: req.params.id as string,
          createdAt: new Date(),
        }) as unknown as any)
        .execute();

      logger.info('Evidence linked to requirement', {
        evidenceId: req.params.id as string,
        assessmentRequirementId: data.assessmentRequirementId,
        userId: req.user?.id,
        requestId: req.requestId,
      });

      res.status(201).json({ message: 'Evidence linked successfully' });
    } catch (error) {
      if (handleValidationError(res, error)) return;

      logger.error('Link evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  })
);

const unlinkEvidenceSchema = z.object({
  assessmentRequirementId: z.string().uuid('Invalid assessment requirement ID'),
});

router.delete(
  '/:id/unlink',
  requireAuth,
  requirePermission('evidence.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = unlinkEvidenceSchema.parse(req.body);
      const db = getDatabase();

      const evidence = await fetchEvidence(db, req.params.id as string);
      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      const assessmentReq = await fetchAssessmentRequirement(db, data.assessmentRequirementId);
      if (!assessmentReq) {
        res.status(404).json({ error: 'Assessment requirement not found' });
        return;
      }

      const assessmentId = (assessmentReq.assessment_id as unknown) as string;
      const userId = req.user?.id ?? '';
      const userRole = req.user?.role ?? '';
      const isParticipant = await isAssessmentParticipant(db, userId, userRole, assessmentId);
      if (!isParticipant) {
        res.status(403).json({ error: 'You are not a participant in this assessment' });
        return;
      }

      const result = await db
        .deleteFrom('assessment_requirement_evidence')
        .where('evidence_id', '=', req.params.id as string)
        .where('assessment_requirement_id', '=', data.assessmentRequirementId)
        .execute();

      if (Number(result[0].numDeletedRows) === 0) {
        res.status(404).json({ error: 'Link not found' });
        return;
      }

      logger.info('Evidence unlinked from requirement', {
        evidenceId: req.params.id as string,
        assessmentRequirementId: data.assessmentRequirementId,
        userId: req.user?.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Evidence unlinked successfully' });
    } catch (error) {
      if (handleValidationError(res, error)) return;

      logger.error('Unlink evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  })
);

const submitForReviewSchema = z.object({
  reviewerId: z.string().uuid('Invalid reviewer ID'),
});

router.post(
  '/:id/submit-for-review',
  requireAuth,
  requirePermission('evidence.submit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = submitForReviewSchema.parse(req.body);
      const db = getDatabase();

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const evidence = await fetchEvidence(db, req.params.id as string);
      const userPermissions = await getPermissionsForRole(req.user.role);
      const hasSubmitAccess = userPermissions.includes('evidence.submit');

      if (!hasSubmitAccess && evidence?.author_id !== req.user.id) {
        res.status(403).json({ error: 'Only the evidence author or an admin can submit evidence for review' });
        return;
      }

      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      const authorId = (evidence as Record<string, unknown>).author_id as string;
      const validation = await validateEvidenceSubmission(
        evidence,
        data.reviewerId,
        authorId,
        req.user.id,
      );
      if (!validation.valid) {
        const statusCode = validation.error?.includes('not found') ? 404 : 409;
        res.status(statusCode).json({ error: validation.error });
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
        .where('id', '=', req.params.id as string)
        .execute();

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id as string,
        action: 'state_change',
        userId: req.user.id,
        changes: toSnakeCase({ state: 'in_review', reviewerId: data.reviewerId }),
      });

      if (evidence) {
        req.eventBus?.emit(
          EVIDENCE_STATE_CHANGED,
          {
            evidenceId: req.params.id as string,
            evidenceName: (evidence as Record<string, unknown>).name as string,
            previousState: 'in_progress',
            newState: 'in_review',
            reviewerId: data.reviewerId,
            authorId: (evidence as Record<string, unknown>).author_id as string,
            assessmentId: null,
          },
          { userId: req.user.id, displayName: req.user.displayName },
        );
      }

      logger.info('Evidence submitted for review', {
        evidenceId: req.params.id as string,
        reviewerId: data.reviewerId,
        userId: req.user.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Evidence submitted for review successfully' });
    } catch (error) {
      if (handleValidationError(res, error)) return;

      logger.error('Submit for review error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  })
);

router.post(
  '/:id/approve',
  requireAuth,
  requirePermission('evidence.review'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const evidence = await fetchEvidence(db, req.params.id as string);
    const userPermissions = await getPermissionsForRole(req.user.role);
    const hasReviewAccess = userPermissions.includes('evidence.review');

    const validation = await validateEvidenceApproval(evidence, req.user.id, hasReviewAccess);
    if (!validation.valid) {
      const statusCode = validation.error?.includes('not found') ? 404 : 409;
      res.status(statusCode).json({ error: validation.error });
      return;
    }

    const result = await db
      .updateTable('evidence')
      .set({ state: 'claimed' })
      .where('id', '=', req.params.id as string)
      .where('state', '=', 'in_review')
      .execute();

    if (Number(result[0].numUpdatedRows) === 0) {
      res.status(409).json({ error: 'Evidence state has changed. Please refresh and try again.' });
      return;
    }

    await logAudit(db, {
      entityType: 'evidence',
      entityId: req.params.id as string,
      action: 'state_change',
      userId: req.user.id,
      changes: { state: 'claimed' },
    });

    if (evidence) {
      req.eventBus?.emit(
        EVIDENCE_STATE_CHANGED,
        {
          evidenceId: req.params.id as string,
          evidenceName: (evidence as Record<string, unknown>).name as string,
          previousState: 'in_review',
          newState: 'claimed',
          authorId: (evidence as Record<string, unknown>).author_id as string,
          reviewerId: (evidence as Record<string, unknown>).reviewer_id as string | undefined,
          assessmentId: null,
        },
        { userId: req.user.id, displayName: req.user.displayName },
      );
    }

    logger.info('Evidence approved', {
      evidenceId: req.params.id as string,
      reviewerId: req.user.id,
      requestId: req.requestId,
    });

    res.json({ message: 'Evidence approved successfully' });
  })
);

const rejectEvidenceSchema = z.object({
  note: z.string().min(1, 'Rejection note is required'),
});

router.post(
  '/:id/reject',
  requireAuth,
  requirePermission('evidence.review'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = rejectEvidenceSchema.parse(req.body);
      const db = getDatabase();

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const evidence = await fetchEvidence(db, req.params.id as string);
      if (!evidence) {
        res.status(404).json({ error: 'Evidence not found' });
        return;
      }

      const userPermissions = await getPermissionsForRole(req.user.role);
      const hasReviewAccess = userPermissions.includes('evidence.review');

      if (evidence.state !== 'in_review') {
        res.status(409).json({ error: 'Evidence must be in review status to reject' });
        return;
      }

      if (!hasReviewAccess && evidence.reviewer_id !== req.user.id) {
        res.status(403).json({ error: 'Only the assigned reviewer or an admin can reject evidence' });
        return;
      }

      if (evidence.author_id === req.user.id) {
        res.status(403).json({ error: 'Evidence authors cannot reject their own evidence' });
        return;
      }

      const result = await db
        .updateTable('evidence')
        .set(toSnakeCase({ state: 'in_progress' }))
        .where('id', '=', req.params.id as string)
        .where('state', '=', 'in_review')
        .execute();

      if (Number(result[0].numUpdatedRows) === 0) {
        res.status(409).json({ error: 'Evidence state has changed. Please refresh and try again.' });
        return;
      }

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id as string,
        action: 'state_change',
        userId: req.user.id,
        changes: toSnakeCase({ state: 'in_progress', rejectionReason: data.note }),
      });

      const noteId = uuidv4();
      await db
        .insertInto('evidence_note')
        .values(toSnakeCase({
          id: noteId,
          evidenceId: req.params.id as string,
          userId: req.user.id,
          content: `REJECTED: ${data.note}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }) as unknown as any)
        .execute();

      req.eventBus?.emit(
        EVIDENCE_STATE_CHANGED,
        {
          evidenceId: req.params.id as string,
          evidenceName: evidence.name,
          previousState: 'in_review',
          newState: 'in_progress',
          rejectionReason: data.note,
          authorId: evidence.author_id,
          reviewerId: evidence.reviewer_id,
          assessmentId: null,
        },
        { userId: req.user.id, displayName: req.user.displayName },
      );

      logger.info('Evidence rejected', {
        evidenceId: req.params.id as string,
        reviewerId: req.user.id,
        noteId,
        requestId: req.requestId,
      });

      res.json({ message: 'Evidence rejected successfully' });
    } catch (error) {
      if (handleValidationError(res, error)) return;

      logger.error('Reject evidence error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  })
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
    // eslint-disable-next-line xss/no-mixed-html
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
  requirePermission('evidence.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const db = getDatabase();

    const evidence = await db
      .selectFrom('evidence')
      .where('id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!evidence) {
      res.status(404).json({ error: 'Evidence not found' });
      return;
    }

    const maxFileSize = getMaxFileSize();
    const storageProviderName = getStorageProviderName();
    const storageProvider = getStorageProvider();

    // Check if this is JSON body upload or multipart upload
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      // JSON body upload (for demo data seeding)
      try {
        const data = createAttachmentSchema.parse(req.body);
        const attachmentId = uuidv4();

        // Decode base64 content
        const buffer = Buffer.from(data.binaryContent, 'base64');

        if (buffer.length > maxFileSize) {
          res.status(413).json({ error: `File exceeds maximum size of ${maxFileSize} bytes` });
          return;
        }

        const contentHash = computeContentHash(buffer);
        const sizeBytes = buffer.length;
        const resolvedContentType = detectCycloneDXMediaType(data.filename, data.contentType, buffer);
        const storageKey = `evidence/${req.params.id as string}/${attachmentId}-${data.filename}`;

        // Build the row based on provider
        const row: Record<string, unknown> = {
          id: attachmentId,
          evidenceId: req.params.id as string,
          filename: data.filename,
          contentType: resolvedContentType,
          sizeBytes,
          contentHash,
          storageProvider: storageProviderName,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        if (storageProviderName === 'database') {
          row.binaryContent = buffer;
          row.storagePath = storageKey;
        } else {
          // S3: write to object storage, store the key
          await storageProvider.put(storageKey, buffer, { contentType: resolvedContentType });
          row.storagePath = storageKey;
          row.binaryContent = null;
        }

        await db
          .insertInto('evidence_attachment')
          .values(toSnakeCase(row))
          .execute();

        logger.info('Attachment created from JSON body', {
          evidenceId: req.params.id as string,
          attachmentId,
          filename: data.filename,
          storageProvider: storageProviderName,
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
            storagePath: storageKey,
            contentHash,
          }],
        });
        return;
      } catch (error) {
        if (handleValidationError(res, error)) return;
        throw error;
      }
    }

      // Multipart form upload
      const bb = busboy({
        headers: req.headers,
        limits: { fileSize: maxFileSize },
      });

      const attachments: Record<string, unknown>[] = [];
      let fileSizeLimitHit = false;

      bb.on('file', async (_fieldname, file, info) => {
        try {
          const attachmentId = uuidv4();
          const filename = info.filename;
          const contentTypeFromFile = info.mimeType;
          const storageKey = `evidence/${req.params.id as string}/${attachmentId}-${filename}`;

          const chunks: Buffer[] = [];

          file.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });

          file.on('limit', () => {
            fileSizeLimitHit = true;
            logger.warn('File size limit exceeded', {
              filename,
              limit: maxFileSize,
              requestId: req.requestId,
            });
          });

          file.on('end', async () => {
            if (fileSizeLimitHit) return;

            try {
              const buffer = Buffer.concat(chunks);
              const sizeBytes = buffer.length;
              const contentHash = computeContentHash(buffer);
              const resolvedContentType = detectCycloneDXMediaType(filename, contentTypeFromFile, buffer);

              // Build the row based on active storage provider
              const row: Record<string, unknown> = {
                id: attachmentId,
                evidenceId: req.params.id as string,
                filename,
                contentType: resolvedContentType,
                sizeBytes,
                contentHash,
                storageProvider: storageProviderName,
                createdAt: new Date(),
                updatedAt: new Date(),
              };

              if (storageProviderName === 'database') {
                row.binaryContent = buffer;
                row.storagePath = storageKey;
              } else {
                // S3: write to object storage
                await storageProvider.put(storageKey, buffer, { contentType: resolvedContentType });
                row.storagePath = storageKey;
                row.binaryContent = null;
              }

              await db
                .insertInto('evidence_attachment')
                .values(toSnakeCase(row))
                .execute();

              attachments.push({
                id: attachmentId,
                filename,
                contentType: resolvedContentType,
                sizeBytes,
                storagePath: storageKey,
                contentHash,
              });

              logger.info('Attachment uploaded', {
                evidenceId: req.params.id as string,
                attachmentId,
                filename,
                storageProvider: storageProviderName,
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
        if (fileSizeLimitHit) {
          res.status(413).json({ error: `File exceeds maximum size of ${maxFileSize} bytes` });
          return;
        }
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
  })
);

router.get(
  '/:id/attachments/:attachmentId/download',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    const attachment = await db
      .selectFrom('evidence_attachment')
      .where('evidence_attachment.id', '=', req.params.attachmentId)
      .where('evidence_attachment.evidence_id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    res.setHeader('Content-Type', attachment.content_type);
    // Sanitize filename to prevent header injection (CWE-113) and path traversal
    const sanitizedFilename = attachment.filename
      .replace(/[\r\n]/g, '')           // Strip newlines (header injection)
      .replace(/[/\\]/g, '_')           // Strip path separators (traversal)
      .replace(/[^\w\s.\-()]/g, '_')    // Keep only safe characters
      .substring(0, 255);               // Enforce length limit
    const encodedFilename = encodeURIComponent(sanitizedFilename);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodedFilename}`
    );

    // Resolve the provider that was used to store this particular attachment,
    // not the currently configured provider. This ensures mixed-storage
    // deployments can still serve all files.
    const recordProvider = (attachment.storage_provider || 'database') as StorageProviderName;

    try {
      if (recordProvider === 'database') {
        // For database provider, content is already in the row
        if (attachment.binary_content) {
          const data = Buffer.isBuffer(attachment.binary_content)
            ? attachment.binary_content
            : Buffer.from(attachment.binary_content as any, 'base64');
          // eslint-disable-next-line security/direct-response-write
          res.send(data);
        } else {
          res.status(404).json({ error: 'File content not found in database' });
        }
      } else {
        // S3: use the provider abstraction
        const provider = resolveProvider(recordProvider);
        const storageKey = attachment.storage_path || `evidence/${attachment.evidence_id}/${attachment.id}-${attachment.filename}`;
        const result = await provider.get(storageKey);
        // eslint-disable-next-line security/direct-response-write
        res.send(result.data);
      }

      logger.info('Attachment downloaded', {
        evidenceId: req.params.id as string,
        attachmentId: req.params.attachmentId,
        storageProvider: recordProvider,
        userId: req.user?.id,
        requestId: req.requestId,
      });
    } catch (error) {
      logger.error('Error retrieving attachment content', { error, provider: recordProvider, requestId: req.requestId });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error downloading file' });
      }
    }
  })
);

router.delete(
  '/:id/attachments/:attachmentId',
  requireAuth,
  requirePermission('evidence.delete'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    const attachment = await db
      .selectFrom('evidence_attachment')
      .where('evidence_attachment.id', '=', req.params.attachmentId)
      .where('evidence_attachment.evidence_id', '=', req.params.id as string)
      .selectAll()
      .executeTakeFirst();

    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    // Delete from external storage if applicable (S3)
    const recordProvider = (attachment.storage_provider || 'database') as StorageProviderName;
    if (recordProvider !== 'database' && attachment.storage_path) {
      try {
        const provider = resolveProvider(recordProvider);
        await provider.delete(attachment.storage_path);
      } catch (error) {
        logger.error('Error deleting from storage provider', {
          error,
          provider: recordProvider,
          requestId: req.requestId,
        });
      }
    }

    await db
      .deleteFrom('evidence_attachment')
      .where('id', '=', req.params.attachmentId)
      .execute();

    logger.info('Attachment deleted', {
      evidenceId: req.params.id as string,
      attachmentId: req.params.attachmentId,
      storageProvider: recordProvider,
      userId: req.user?.id,
      requestId: req.requestId,
    });

    res.json({ message: 'Attachment deleted successfully' });
  })
);

export default router;
