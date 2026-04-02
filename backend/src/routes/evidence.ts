import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import busboy from 'busboy';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { syncEntityTags, fetchTagsForEntities } from '../utils/tags.js';
import { logAudit } from '../utils/audit.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

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
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
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

    const evidence = await db
      .selectFrom('evidence')
      .where('id', '=', req.params.id)
      .selectAll()
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
            'app_user.id' as any,
            '=',
            'evidence_note.user_id' as any
          )
      )
      .where('evidence_note.evidence_id', '=', req.params.id)
      .selectAll()
      .orderBy('evidence_note.created_at', 'desc')
      .execute()) as any[];

    const attachments = await db
      .selectFrom('evidence_attachment')
      .where('evidence_attachment.evidence_id', '=', req.params.id)
      .selectAll()
      .execute();

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
      .values({
        id: evidenceId,
        name: data.name,
        description: data.description,
        state: data.state,
        author_id: req.user.id,
        expires_on: data.expiresOn ? new Date(data.expiresOn) : undefined,
        is_counter_evidence: data.isCounterEvidence,
        classification: data.classification,
      })
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
    if (data.expiresOn !== undefined) updateData.expires_on = data.expiresOn ? new Date(data.expiresOn) : null;
    if (data.classification !== undefined) updateData.classification = data.classification;
    if (data.reviewerId !== undefined) updateData.reviewer_id = data.reviewerId;

    if (Object.keys(updateData).length > 0) {
      await db
        .updateTable('evidence')
        .set(updateData)
        .where('id', '=', req.params.id)
        .execute();

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id,
        action: 'update',
        userId: req.user!.id,
        changes: updateData,
      });
    }

    if (data.tags !== undefined) {
      await syncEntityTags(db, 'evidence_tag', 'evidence_id', req.params.id, data.tags);
    }

    logger.info('Evidence updated', {
      evidenceId: req.params.id,
      requestId: req.requestId,
    });

    res.json({ message: 'Evidence updated successfully' });
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
        .values({
          id: noteId,
          evidence_id: req.params.id,
          user_id: req.user.id,
          content: data.content,
          created_at: new Date(),
          updated_at: new Date(),
        })
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
        .values({
          assessment_requirement_id: data.assessmentRequirementId,
          evidence_id: req.params.id,
          created_at: new Date(),
        })
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
        .set({
          state: 'in_review',
          reviewer_id: data.reviewerId,
        })
        .where('id', '=', req.params.id)
        .execute();

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id,
        action: 'state_change',
        userId: req.user.id,
        changes: { state: 'in_review', reviewer_id: data.reviewerId },
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

      if (evidence.reviewer_id !== req.user.id) {
        res.status(403).json({ error: 'Only the assigned reviewer can approve evidence' });
        return;
      }

      await db
        .updateTable('evidence')
        .set({
          state: 'claimed',
        })
        .where('id', '=', req.params.id)
        .execute();

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

      if (evidence.reviewer_id !== req.user.id) {
        res.status(403).json({ error: 'Only the assigned reviewer can reject evidence' });
        return;
      }

      await db
        .updateTable('evidence')
        .set({
          state: 'in_progress',
        })
        .where('id', '=', req.params.id)
        .execute();

      await logAudit(db, {
        entityType: 'evidence',
        entityId: req.params.id,
        action: 'state_change',
        userId: req.user.id,
        changes: { state: 'in_progress', rejection_reason: data.note },
      });

      const noteId = uuidv4();
      await db
        .insertInto('evidence_note')
        .values({
          id: noteId,
          evidence_id: req.params.id,
          user_id: req.user.id,
          content: `REJECTED: ${data.note}`,
          created_at: new Date(),
          updated_at: new Date(),
        })
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
          const contentType = info.mimeType;
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

              await db
                .insertInto('evidence_attachment')
                .values({
                  id: attachmentId,
                  evidence_id: req.params.id,
                  filename,
                  content_type: contentType,
                  size_bytes: sizeBytes,
                  storage_path: storagePath,
                  created_at: new Date(),
                  updated_at: new Date(),
                })
                .execute();

              attachments.push({
                id: attachmentId,
                filename,
                contentType,
                sizeBytes,
                storagePath,
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

      const fullPath = path.join(process.cwd(), 'uploads', attachment.storage_path);

      try {
        await fs.access(fullPath);
      } catch {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      res.setHeader('Content-Type', attachment.content_type);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);

      const fileStream = require('fs').createReadStream(fullPath);
      fileStream.pipe(res);

      fileStream.on('error', (error: any) => {
        logger.error('Error streaming file', { error, requestId: req.requestId });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error downloading file' });
        }
      });
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
