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
import { verifyAttachmentMimeType } from '../utils/attachment-mime.js';

const router = Router();

/**
 * Check if a user is a participant (assessor or assessee) in an assessment,
 * or bears a permission that grants assessment-wide visibility.
 *
 * Access is granted when any of the following holds:
 *   1. The caller holds `evidence.view_all` or `assessments.view_all`.
 *   2. The caller is listed on assessment_assessor for the assessment.
 *   3. The caller is listed on assessment_assessee for the assessment.
 *
 * Prior revisions short-circuited on a literal role-name check for
 * `admin`. That matched the intent only because the admin role seeds with
 * every permission, but it created a role-name dependency that drifts
 * from the RBAC tables and violates the project rule of permission-only
 * access control. The check below consults the DB-driven permission set
 * for the caller's role instead.
 */
async function isAssessmentParticipant(db: Kysely<Database>, userId: string, userRole: string, assessmentId: string): Promise<boolean> {
  const perms = await getPermissionsForRole(userRole);
  if (perms.includes('evidence.view_all') || perms.includes('assessments.view_all')) return true;

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
 * Check whether a user may read or act on a specific evidence record.
 *
 * Access is granted when any of the following holds:
 *   1. The caller holds `evidence.view_all` or `assessments.view_all`.
 *   2. The caller authored the evidence (authors always retain access
 *      to their own uploads, including orphan evidence not yet linked
 *      to an assessment).
 *   3. The caller is listed as the reviewer of the evidence.
 *   4. The evidence is linked (via assessment_requirement_evidence)
 *      to at least one assessment where the caller is an assessor or
 *      assessee.
 *
 * Returns the evidence row on success for caller reuse, or null when
 * the evidence does not exist or the caller is not authorized.
 */
async function getEvidenceIfAccessible(
  db: Kysely<Database>,
  userId: string,
  userRole: string,
  evidenceId: string,
): Promise<Record<string, unknown> | null> {
  const evidence = await fetchEvidence(db, evidenceId);
  if (!evidence) return null;

  const perms = await getPermissionsForRole(userRole);
  if (perms.includes('evidence.view_all') || perms.includes('assessments.view_all')) {
    return evidence;
  }

  if (evidence.author_id === userId) return evidence;
  if (evidence.reviewer_id === userId) return evidence;

  const participantRow = await db
    .selectFrom('assessment_requirement_evidence as are')
    .innerJoin('assessment_requirement as ar', 'ar.id', 'are.assessment_requirement_id')
    .leftJoin('assessment_assessor as assessor', (join) =>
      join
        .onRef('assessor.assessment_id', '=', 'ar.assessment_id')
        .on('assessor.user_id', '=', userId),
    )
    .leftJoin('assessment_assessee as assessee', (join) =>
      join
        .onRef('assessee.assessment_id', '=', 'ar.assessment_id')
        .on('assessee.user_id', '=', userId),
    )
    .where('are.evidence_id', '=', evidenceId)
    .where((eb) =>
      eb.or([
        eb('assessor.user_id', 'is not', null),
        eb('assessee.user_id', 'is not', null),
      ]),
    )
    .select('ar.assessment_id')
    .limit(1)
    .executeTakeFirst();

  return participantRow ? evidence : null;
}

/**
 * Retention/immutability check for an evidence record.
 *
 * Evidence is considered "used" and therefore retention-locked once any
 * of the following is true. Used evidence is both write-protected and
 * delete-protected across its attachments, notes, and link rows. This
 * binds every caller equally; there is no admin override and no
 * permission that bypasses the lock. The rule is a record-integrity
 * policy, not an authorization policy, so callers must not consult
 * `req.user.role` or permissions here.
 *
 *   1. `evidence.state === 'claimed'`. This mirrors the legacy rule
 *      already enforced on PUT /:id and predates the retention policy.
 *   2. The evidence is cited in any claim via `claim_evidence`,
 *      `claim_counter_evidence`, or `claim_mitigation_strategy`.
 *   3. The evidence is linked (via assessment_requirement_evidence) to
 *      an assessment in a terminal state: `complete`, `archived`, or
 *      `cancelled`. Cancelled assessments still left a business record
 *      and therefore count as terminal for retention purposes.
 *
 * Expiration (`evidence.state === 'expired'`) does not, on its own,
 * unlock retention. Expired evidence that has never been used may still
 * be freely edited or unlinked; expired evidence that has been used
 * stays locked.
 *
 * Callers should return 409 Conflict with the `reason` so the client
 * can distinguish retention from 403 (no permission) and 404 (not
 * found / not authorized).
 */
async function isEvidenceImmutable(
  db: Kysely<Database>,
  evidenceId: string,
): Promise<{ immutable: true; reason: 'claimed' | 'linked_to_claim' | 'assessment_terminal' } | { immutable: false }> {
  const evidence = await db
    .selectFrom('evidence')
    .where('id', '=', evidenceId)
    .select(['state'])
    .executeTakeFirst();

  if (!evidence) return { immutable: false };

  if (evidence.state === 'claimed') {
    return { immutable: true, reason: 'claimed' };
  }

  const inClaimEvidence = await db
    .selectFrom('claim_evidence')
    .where('evidence_id', '=', evidenceId)
    .select('claim_id')
    .limit(1)
    .executeTakeFirst();
  if (inClaimEvidence) return { immutable: true, reason: 'linked_to_claim' };

  const inCounter = await db
    .selectFrom('claim_counter_evidence')
    .where('evidence_id', '=', evidenceId)
    .select('claim_id')
    .limit(1)
    .executeTakeFirst();
  if (inCounter) return { immutable: true, reason: 'linked_to_claim' };

  const inMitigation = await db
    .selectFrom('claim_mitigation_strategy')
    .where('evidence_id', '=', evidenceId)
    .select('claim_id')
    .limit(1)
    .executeTakeFirst();
  if (inMitigation) return { immutable: true, reason: 'linked_to_claim' };

  const terminalLink = await db
    .selectFrom('assessment_requirement_evidence as are')
    .innerJoin('assessment_requirement as ar', 'ar.id', 'are.assessment_requirement_id')
    .innerJoin('assessment as a', 'a.id', 'ar.assessment_id')
    .where('are.evidence_id', '=', evidenceId)
    .where('a.state', 'in', ['complete', 'archived', 'cancelled'])
    .select('a.id')
    .limit(1)
    .executeTakeFirst();
  if (terminalLink) return { immutable: true, reason: 'assessment_terminal' };

  return { immutable: false };
}

/**
 * Convenience helper: if evidence is retention-locked, write a 409
 * Conflict response and return true so the caller can early-return.
 * Otherwise returns false and writes nothing.
 */
async function rejectIfImmutable(
  db: Kysely<Database>,
  evidenceId: string,
  res: Response,
): Promise<boolean> {
  const result = await isEvidenceImmutable(db, evidenceId);
  if (!result.immutable) return false;

  const messages: Record<typeof result.reason, string> = {
    claimed: 'Evidence is immutable once claimed',
    linked_to_claim: 'Evidence is immutable once cited in a claim',
    assessment_terminal: 'Evidence is immutable once used in a completed, archived, or cancelled assessment',
  };

  res.status(409).json({
    error: messages[result.reason],
    reason: result.reason,
  });
  return true;
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
function validateEvidenceApproval(
  evidence: Record<string, unknown> | undefined,
  userId: string,
  hasReviewAccess: boolean,
): { valid: boolean; error?: string } {
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
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const db = getDatabase();
  const includeContent = req.query.include_content === 'true';

  // Authorization gate: only return evidence the caller can see. We
  // reuse the accessibility helper to decide visibility, then fetch
  // the display projection once authorization is confirmed. A 404 is
  // returned for both not-found and not-authorized to avoid leaking
  // existence to callers with no right to know.
  const accessible = await getEvidenceIfAccessible(db, req.user.id, req.user.role, req.params.id as string);
  if (!accessible) {
    res.status(404).json({ error: 'Evidence not found' });
    return;
  }

  const evidence = await db
    .selectFrom('evidence')
    .leftJoin('app_user as author', (join) => join.onRef('author.id', '=', 'evidence.author_id'))
    .leftJoin('app_user as reviewer', (join) => join.onRef('reviewer.id', '=', 'evidence.reviewer_id'))
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
    .where('evidence_note.evidence_id', '=', req.params.id)
    .selectAll()
    .orderBy('evidence_note.created_at', 'desc')
    .execute()) as unknown[];

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
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const db = getDatabase();
  const evidenceId = req.params.id as string;

  // Authorization gate: evidence claim links can disclose which assessments
  // and products an organization is assessing, so they must be readable
  // only by evidence participants or holders of the view-all permissions.
  const accessible = await getEvidenceIfAccessible(db, req.user.id, req.user.role, evidenceId);
  if (!accessible) {
    res.status(404).json({ error: 'Evidence not found' });
    return;
  }

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

    // Retention/immutability check. Covers the legacy `state === 'claimed'`
    // rule plus the newer conditions: cited in a claim, or linked to an
    // assessment whose state is complete/archived/cancelled. Admins are
    // bound equally; this is a record-integrity policy, not an authz
    // policy, so 409 is returned instead of 403.
    if (await rejectIfImmutable(db, req.params.id as string, res)) return;

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
        .where('id', '=', req.params.id)
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
      evidenceId: req.params.id,
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

      // Notes are part of the evidence record for retention purposes, so
      // they cannot be added to a used/locked evidence row.
      if (await rejectIfImmutable(db, req.params.id as string, res)) return;

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
          // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        }) as any)
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
          evidenceId: req.params.id as string,
          createdAt: new Date(),
          // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        }) as any)
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

      // Links are part of the evidence record for retention purposes. If
      // the evidence is used (claimed, cited in a claim, or linked to a
      // terminal assessment) then no link row may be removed, even the
      // one currently being asked for.
      if (await rejectIfImmutable(db, req.params.id as string, res)) return;

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

      // State transitions mutate the evidence record and must respect
      // retention. The validation above covers `state === 'claimed'`
      // indirectly (by requiring `in_progress`), but the retention
      // helper also blocks evidence already cited in a claim or linked
      // to a terminal assessment, which can in theory coexist with
      // other non-terminal states.
      if (await rejectIfImmutable(db, req.params.id as string, res)) return;

      // Existence check only; we never return this row to the client.
      const reviewer = await db
        .selectFrom('app_user')
        .where('id', '=', data.reviewerId)
        .select('id')
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

    // Approval is a state transition that both the retention rule and
    // the business invariants care about. If the evidence is already
    // retention-locked (for example because it is linked to a terminal
    // assessment) the caller should not be able to move it to claimed
    // through this path.
    if (await rejectIfImmutable(db, req.params.id as string, res)) return;

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

      // Reject is a state transition and a note-insert. Both are
      // blocked once the evidence is retention-locked.
      if (await rejectIfImmutable(db, req.params.id as string, res)) return;

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
      // biome-ignore lint/suspicious/noExplicitAny: toSnakeCase returns object incompatible with DB row type
      await db
        .insertInto('evidence_note')
        .values(toSnakeCase({
          id: noteId,
          evidenceId: req.params.id as string,
          userId: req.user.id,
          content: `REJECTED: ${data.note}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        }) as any)
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

    // Authorization gate: the caller must be a participant in an
    // assessment this evidence is linked to (or hold a view-all
    // permission). `requirePermission('evidence.edit')` only asserts
    // that the caller could edit *some* evidence; it does not scope
    // the edit to this particular record. A 404 is used for the
    // negative case to avoid leaking evidence existence.
    const evidence = await getEvidenceIfAccessible(db, req.user.id, req.user.role, req.params.id as string);
    if (!evidence) {
      res.status(404).json({ error: 'Evidence not found' });
      return;
    }

    // Attachments are part of the evidence record for retention
    // purposes and cannot be added to a used/locked evidence row.
    if (await rejectIfImmutable(db, req.params.id as string, res)) return;

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

        const mimeDecision = verifyAttachmentMimeType(buffer, data.filename, data.contentType);
        if (!mimeDecision.allowed) {
          logger.warn('Attachment rejected by MIME allowlist', {
            evidenceId: req.params.id as string,
            filename: data.filename,
            claimedType: data.contentType,
            detectedType: mimeDecision.resolvedType,
            reason: mimeDecision.reason,
            userId: req.user?.id,
            requestId: req.requestId,
          });
          res.status(415).json({
            error: mimeDecision.reason ?? 'Unsupported media type',
            detectedType: mimeDecision.resolvedType,
          });
          return;
        }

        const contentHash = computeContentHash(buffer);
        const sizeBytes = buffer.length;
        const resolvedContentType = mimeDecision.resolvedType;
        const storageKey = `evidence/${req.params.id}/${attachmentId}-${data.filename}`;

        // Build the row based on provider
        const row: Record<string, unknown> = {
          id: attachmentId,
          evidenceId: req.params.id,
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
      let mimeRejection: { filename: string; reason: string; detected: string } | null = null;

      bb.on('file', (_fieldname, file, info) => {
        try {
          const attachmentId = uuidv4();
          const filename = info.filename;
          const contentTypeFromFile = info.mimeType;
          const storageKey = `evidence/${req.params.id}/${attachmentId}-${filename}`;

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
            if (mimeRejection) return;

            try {
              const buffer = Buffer.concat(chunks);
              const sizeBytes = buffer.length;

              const mimeDecision = verifyAttachmentMimeType(buffer, filename, contentTypeFromFile);
              if (!mimeDecision.allowed) {
                mimeRejection = {
                  filename,
                  reason: mimeDecision.reason ?? 'Unsupported media type',
                  detected: mimeDecision.resolvedType,
                };
                logger.warn('Attachment rejected by MIME allowlist', {
                  evidenceId: req.params.id as string,
                  filename,
                  claimedType: contentTypeFromFile,
                  detectedType: mimeDecision.resolvedType,
                  reason: mimeDecision.reason,
                  userId: req.user?.id,
                  requestId: req.requestId,
                });
                return;
              }

              const contentHash = computeContentHash(buffer);
              const resolvedContentType = mimeDecision.resolvedType;

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
        if (mimeRejection) {
          res.status(415).json({
            error: mimeRejection.reason,
            filename: mimeRejection.filename,
            detectedType: mimeRejection.detected,
          });
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
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const db = getDatabase();

    // Authorization gate: binary content can contain proprietary or
    // regulated material, so the download must be restricted to evidence
    // participants or holders of the view-all permissions. The check
    // runs before the attachment lookup to avoid leaking its existence.
    const accessible = await getEvidenceIfAccessible(db, req.user.id, req.user.role, req.params.id as string);
    if (!accessible) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

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
    // X-Content-Type-Options: nosniff prevents browsers from
    // MIME-sniffing a user-uploaded file as something more dangerous
    // than its stored Content-Type (for example, rendering a
    // "text/plain" upload as HTML). Paired with the allowlist and
    // magic-number check at upload time this closes the common
    // same-origin stored XSS path for uploaded attachments.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Defense in depth: belt-and-braces guard against legacy clients
    // that ignore the SPA-wide CSP. sandbox on the response CSP
    // tells browsers to treat the body as an opaque origin so any
    // scripted content (HTML, SVG, and so on) runs without cookies
    // or same-origin privileges even when served with a rich MIME
    // type.
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; frame-ancestors 'none'");
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
            // biome-ignore lint/suspicious/noExplicitAny: BYTEA column type varies by driver
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
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const db = getDatabase();

    // Authorization gate: the caller must be a participant in an
    // assessment this evidence is linked to (or hold a view-all
    // permission). Same rationale as the POST route above: a global
    // `evidence.delete` permission does not imply record-level
    // authority over every evidence item.
    const accessible = await getEvidenceIfAccessible(db, req.user.id, req.user.role, req.params.id as string);
    if (!accessible) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

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

    // Attachments on used/locked evidence cannot be deleted. This is
    // the primary retention vector: once the evidence has been cited
    // or closed out, its binary payload must survive any caller's
    // decision, including admins. Return 409 so the client can
    // distinguish retention from authorization.
    if (await rejectIfImmutable(db, req.params.id as string, res)) return;

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
