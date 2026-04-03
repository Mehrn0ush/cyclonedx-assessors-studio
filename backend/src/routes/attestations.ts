import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { toSnakeCase } from '../middleware/camelCase.js';

const router = Router();

const createAttestationSchema = z.object({
  summary: z.string().optional(),
  assessmentId: z.string().uuid('Invalid assessment ID'),
  signatoryId: z.string().uuid().optional(),
});

const updateAttestationSchema = z.object({
  summary: z.string().optional(),
  signatoryId: z.string().uuid().optional(),
});

const addRequirementSchema = z.object({
  requirementId: z.string().uuid('Invalid requirement ID'),
  conformanceScore: z.number().min(0).max(1),
  conformanceRationale: z.string().min(1),
  confidenceScore: z.number().min(0).max(1).optional(),
  confidenceRationale: z.string().optional(),
});

const updateRequirementSchema = z.object({
  conformanceScore: z.number().min(0).max(1),
  conformanceRationale: z.string().min(1),
  confidenceScore: z.number().min(0).max(1).optional(),
  confidenceRationale: z.string().optional(),
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const total = await db
      .selectFrom('attestation')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => r.count);

    const attestations = await db
      .selectFrom('attestation')
      .leftJoin('assessment', 'assessment.id', 'attestation.assessment_id')
      .leftJoin('signatory', 'signatory.id', 'attestation.signatory_id')
      .select([
        'attestation.id',
        'attestation.summary',
        'attestation.assessment_id',
        'attestation.signatory_id',
        'attestation.created_at',
        'attestation.updated_at',
        'assessment.title as assessment_title',
        'signatory.name as signatory_name',
      ])
      .limit(limit)
      .offset(offset)
      .execute();

    res.json({
      data: attestations,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    logger.error('Get attestations error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const attestation = await db
      .selectFrom('attestation')
      .where('id', '=', req.params.id)
      .selectAll()
      .executeTakeFirst();

    if (!attestation) {
      res.status(404).json({ error: 'Attestation not found' });
      return;
    }

    const requirements = await db
      .selectFrom('attestation_requirement')
      .innerJoin('requirement', 'requirement.id', 'attestation_requirement.requirement_id')
      .where('attestation_requirement.attestation_id', '=', req.params.id)
      .selectAll()
      .execute();

    const claims = await db
      .selectFrom('claim')
      .where('attestation_id', '=', req.params.id)
      .selectAll()
      .execute();

    const signatory = attestation.signatory_id
      ? await db
          .selectFrom('signatory')
          .where('id', '=', attestation.signatory_id)
          .selectAll()
          .executeTakeFirst()
      : null;

    res.json({
      attestation,
      requirements,
      claims,
      signatory,
    });
  } catch (error) {
    logger.error('Get attestation error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireAuth,
  requireRole('admin', 'assessor'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createAttestationSchema.parse(req.body);
      const db = getDatabase();
      const attestationId = uuidv4();

      const assessment = await db
        .selectFrom('assessment')
        .where('id', '=', data.assessmentId)
        .selectAll()
        .executeTakeFirst();

      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }

      await db
        .insertInto('attestation')
        .values(toSnakeCase({
          id: attestationId,
          summary: data.summary,
          assessmentId: data.assessmentId,
          signatoryId: data.signatoryId,
        }))
        .execute();

      logger.info('Attestation created', {
        attestationId,
        assessmentId: data.assessmentId,
        requestId: req.requestId,
      });

      res.status(201).json({
        id: attestationId,
        summary: data.summary,
        assessmentId: data.assessmentId,
        signatoryId: data.signatoryId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Create attestation error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:id',
  requireAuth,
  requireRole('admin', 'assessor'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateAttestationSchema.parse(req.body);
      const db = getDatabase();

      const attestation = await db
        .selectFrom('attestation')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      const updateData: any = {};

      if (data.summary !== undefined) updateData.summary = data.summary;
      if (data.signatoryId !== undefined) updateData.signatoryId = data.signatoryId;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable('attestation')
          .set(toSnakeCase(updateData))
          .where('id', '=', req.params.id)
          .execute();
      }

      logger.info('Attestation updated', {
        attestationId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Attestation updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Update attestation error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/requirements',
  requireAuth,
  requireRole('admin', 'assessor'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = addRequirementSchema.parse(req.body);
      const db = getDatabase();

      const attestation = await db
        .selectFrom('attestation')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      const requirement = await db
        .selectFrom('requirement')
        .where('id', '=', data.requirementId)
        .selectAll()
        .executeTakeFirst();

      if (!requirement) {
        res.status(404).json({ error: 'Requirement not found' });
        return;
      }

      const existingReq = await db
        .selectFrom('attestation_requirement')
        .where('attestation_id', '=', req.params.id)
        .where('requirement_id', '=', data.requirementId)
        .selectAll()
        .executeTakeFirst();

      if (existingReq) {
        await db
          .updateTable('attestation_requirement')
          .set(toSnakeCase({
            conformanceScore: data.conformanceScore,
            conformanceRationale: data.conformanceRationale,
            confidenceScore: data.confidenceScore || null,
            confidenceRationale: data.confidenceRationale || null,
          }))
          .where('attestation_id', '=', req.params.id)
          .where('requirement_id', '=', data.requirementId)
          .execute();
      } else {
        await db
          .insertInto('attestation_requirement')
          .values(toSnakeCase({
            id: uuidv4(),
            attestationId: req.params.id,
            requirementId: data.requirementId,
            conformanceScore: data.conformanceScore,
            conformanceRationale: data.conformanceRationale,
            confidenceScore: data.confidenceScore || null,
            confidenceRationale: data.confidenceRationale || null,
          }))
          .execute();
      }

      logger.info('Attestation requirement added/updated', {
        attestationId: req.params.id,
        requirementId: data.requirementId,
        requestId: req.requestId,
      });

      res.status(201).json({ message: 'Requirement added/updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Add attestation requirement error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:id/requirements/:requirementId',
  requireAuth,
  requireRole('admin', 'assessor'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateRequirementSchema.parse(req.body);
      const db = getDatabase();

      const attestationReq = await db
        .selectFrom('attestation_requirement')
        .where('attestation_id', '=', req.params.id)
        .where('requirement_id', '=', req.params.requirementId)
        .selectAll()
        .executeTakeFirst();

      if (!attestationReq) {
        res.status(404).json({ error: 'Attestation requirement not found' });
        return;
      }

      await db
        .updateTable('attestation_requirement')
        .set(toSnakeCase({
          conformanceScore: data.conformanceScore,
          conformanceRationale: data.conformanceRationale,
          confidenceScore: data.confidenceScore || null,
          confidenceRationale: data.confidenceRationale || null,
        }))
        .where('attestation_id', '=', req.params.id)
        .where('requirement_id', '=', req.params.requirementId)
        .execute();

      logger.info('Attestation requirement updated', {
        attestationId: req.params.id,
        requirementId: req.params.requirementId,
        requestId: req.requestId,
      });

      res.json({ message: 'Requirement updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Update attestation requirement error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:id/requirements',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const attestation = await db
        .selectFrom('attestation')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      const requirements = await db
        .selectFrom('attestation_requirement')
        .innerJoin('requirement', 'requirement.id', 'attestation_requirement.requirement_id')
        .where('attestation_requirement.attestation_id', '=', req.params.id)
        .selectAll()
        .execute();

      res.json({ data: requirements });
    } catch (error) {
      logger.error('Get attestation requirements error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/sign',
  requireAuth,
  requireRole('admin', 'assessor'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { signatoryId } = z.object({ signatoryId: z.string().uuid() }).parse(req.body);
      const db = getDatabase();

      const attestation = await db
        .selectFrom('attestation')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      const signatory = await db
        .selectFrom('signatory')
        .where('id', '=', signatoryId)
        .selectAll()
        .executeTakeFirst();

      if (!signatory) {
        res.status(404).json({ error: 'Signatory not found' });
        return;
      }

      await db
        .updateTable('attestation')
        .set(toSnakeCase({ signatoryId: signatoryId }))
        .where('id', '=', req.params.id)
        .execute();

      logger.info('Attestation signed', {
        attestationId: req.params.id,
        signatoryId: signatoryId,
        requestId: req.requestId,
      });

      res.json({ message: 'Attestation signed successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Sign attestation error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
