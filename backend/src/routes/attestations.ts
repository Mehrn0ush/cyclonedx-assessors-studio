import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import {
  checkAttestationAssessmentReadOnly,
  fetchAttestationById,
  fetchAttestationRequirements,
  fetchAttestationClaims,
  fetchSignatory,
  checkRequirementExists,
} from '../utils/attestation-queries.js';

const router = Router();

const createAttestationSchema = z.object({
  summary: z.string().optional(),
  assessmentId: z.string().uuid('Invalid assessment ID'),
  signatoryId: z.string().uuid().optional(),
  assessorId: z.string().uuid().optional(),
});

const updateAttestationSchema = z.object({
  summary: z.string().optional(),
  signatoryId: z.string().uuid().optional(),
  assessorId: z.string().uuid().optional(),
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

router.get('/', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const total = await db
    .selectFrom('attestation')
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow()
    .then(r => r.count);

  const attestations = (await db
    .selectFrom('attestation')
    .leftJoin('assessment', 'assessment.id', 'attestation.assessment_id')
    .leftJoin('signatory', 'signatory.id', 'attestation.signatory_id')
    // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
    .leftJoin('assessor', (join) =>
      // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
      join.onRef('assessor.id' as any, '=',
        // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        'attestation.assessor_id' as any)
    )
    // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
    .leftJoin('entity as assessor_entity', (join) =>
      // biome-ignore lint/suspicious/noExplicitAny: Kysely cross-table join refs require type cast
      join.onRef('assessor_entity.id' as any, '=',
        // biome-ignore lint/suspicious/noExplicitAny: Kysely dynamic query requires type cast
        'assessor.entity_id' as any)
    )
    .select([
      'attestation.id',
      'attestation.summary',
      'attestation.assessment_id',
      'attestation.signatory_id',
      'attestation.assessor_id',
      'attestation.created_at',
      'attestation.updated_at',
      'assessment.title as assessment_title',
      'signatory.name as signatory_name',
      'assessor.bom_ref as assessor_bom_ref',
      'assessor.third_party as assessor_third_party',
      'assessor_entity.name as assessor_entity_name',
    ])
    .limit(limit)
    .offset(offset)
    .execute()) as Record<string, unknown>[];

  res.json({
    data: attestations,
    pagination: {
      limit,
      offset,
      total,
    },
  });
}));

router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const attestation = await fetchAttestationById(db, req.params.id as string);

  if (!attestation) {
    res.status(404).json({ error: 'Attestation not found' });
    return;
  }

  const requirements = await fetchAttestationRequirements(db, req.params.id as string);
  const claims = await fetchAttestationClaims(db, req.params.id as string);
  const signatory = await fetchSignatory(db, attestation.signatory_id || null);

  res.json({
    attestation,
    requirements,
    claims,
    signatory,
  });
}));

router.post(
  '/',
  requireAuth,
  requirePermission('attestations.create'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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

      // Guard: reject if assessment is complete/archived
      const readOnlyError = await checkAttestationAssessmentReadOnly(db, data.assessmentId);
      if (readOnlyError) {
        res.status(403).json({ error: readOnlyError });
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
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.put(
  '/:id',
  requireAuth,
  requirePermission('attestations.create'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateAttestationSchema.parse(req.body);
      const db = getDatabase();

      const attestation = await fetchAttestationById(db, req.params.id as string);

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      // Guard: reject if parent assessment is complete/archived
      const readOnlyError = await checkAttestationAssessmentReadOnly(db, attestation.assessment_id);
      if (readOnlyError) {
        res.status(403).json({ error: readOnlyError });
        return;
      }

      const updateData: Record<string, unknown> = {};

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

      // Fetch and return the updated attestation
      const updatedAttestation = await db
        .selectFrom('attestation')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      res.json(updatedAttestation);
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.post(
  '/:id/requirements',
  requireAuth,
  requirePermission('attestations.create'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = addRequirementSchema.parse(req.body);
      const db = getDatabase();

      const attestation = await fetchAttestationById(db, req.params.id as string);

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      // Guard: reject if parent assessment is complete/archived
      const readOnlyError = await checkAttestationAssessmentReadOnly(db, attestation.assessment_id);
      if (readOnlyError) {
        res.status(403).json({ error: readOnlyError });
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

      const existingReq = await checkRequirementExists(db, req.params.id as string, data.requirementId);

      if (existingReq) {
        await db
          .updateTable('attestation_requirement')
          .set(toSnakeCase({
            conformanceScore: data.conformanceScore,
            conformanceRationale: data.conformanceRationale,
            confidenceScore: data.confidenceScore ?? null,
            confidenceRationale: data.confidenceRationale ?? null,
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
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.put(
  '/:id/requirements/:requirementId',
  requireAuth,
  requirePermission('attestations.create'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
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

      // Guard: look up parent attestation to check assessment state
      const parentAttestation = await db
        .selectFrom('attestation')
        .where('id', '=', req.params.id)
        .select(['assessment_id'])
        .executeTakeFirst();
      if (parentAttestation) {
        const readOnlyError = await checkAttestationAssessmentReadOnly(db, parentAttestation.assessment_id);
        if (readOnlyError) {
          res.status(403).json({ error: readOnlyError });
          return;
        }
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
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.get(
  '/:id/requirements',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    const attestation = await fetchAttestationById(db, req.params.id as string);

    if (!attestation) {
      res.status(404).json({ error: 'Attestation not found' });
      return;
    }

    const requirements = await fetchAttestationRequirements(db, req.params.id as string);

    res.json({ data: requirements });
  })
);

router.post(
  '/:id/sign',
  requireAuth,
  requirePermission('attestations.sign'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { signatoryId } = z.object({ signatoryId: z.string().uuid() }).parse(req.body);
      const db = getDatabase();

      const attestation = await fetchAttestationById(db, req.params.id as string);

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
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

export default router;
