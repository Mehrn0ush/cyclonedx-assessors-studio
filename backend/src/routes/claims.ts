import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requirePermission } from '../middleware/auth.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';

const router = Router();

/**
 * Check if the user is a participant in the assessment linked via an attestation.
 * Admins always pass. Returns true if the user is allowed, false otherwise.
 */
async function isAttestationParticipant(
  db: any,
  userId: string,
  userRole: string,
  attestationId: string | null | undefined
): Promise<boolean> {
  if (userRole === 'admin') return true;
  if (!attestationId) return true; // Unlinked claims are accessible to all authenticated users

  const attestation = await db
    .selectFrom('attestation')
    .where('id', '=', attestationId)
    .select(['assessment_id'])
    .executeTakeFirst();

  if (!attestation) return true; // Attestation doesn't exist; let other validation catch it

  const assessor = await db
    .selectFrom('assessment_assessor')
    .where('assessment_id', '=', attestation.assessment_id)
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst();
  if (assessor) return true;

  const assessee = await db
    .selectFrom('assessment_assessee')
    .where('assessment_id', '=', attestation.assessment_id)
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst();
  return !!assessee;
}

/**
 * Check if a claim's parent assessment is read-only (complete or archived).
 * Claims linked via attestation -> assessment inherit the assessment's read-only state.
 * Returns an error message if read-only, or null if mutable.
 */
async function checkClaimAssessmentReadOnly(db: any, attestationId: string | null | undefined): Promise<string | null> {
  if (!attestationId) return null; // Unlinked claims are always mutable

  const attestation = await db
    .selectFrom('attestation')
    .where('id', '=', attestationId)
    .select(['assessment_id'])
    .executeTakeFirst();

  if (!attestation) return null;

  const assessment = await db
    .selectFrom('assessment')
    .where('id', '=', attestation.assessment_id)
    .select(['state'])
    .executeTakeFirst();

  if (!assessment) return null;

  if (assessment.state === 'archived') return 'This claim belongs to an archived assessment and cannot be modified';
  if (assessment.state === 'complete') return 'This claim belongs to a completed assessment. Reopen the assessment to make changes.';
  return null;
}

const createClaimSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  target: z.string().min(1, 'Target is required'),
  targetEntityId: z.string().uuid().nullable().optional(),
  predicate: z.string().min(1, 'Predicate is required'),
  reasoning: z.string().optional(),
  isCounterClaim: z.boolean().default(false),
  attestationId: z.string().uuid().optional(),
  evidenceIds: z.array(z.string().uuid()).optional(),
  counterEvidenceIds: z.array(z.string().uuid()).optional(),
});

const updateClaimSchema = z.object({
  name: z.string().min(1).optional(),
  target: z.string().min(1).optional(),
  targetEntityId: z.string().uuid().nullable().optional(),
  predicate: z.string().min(1).optional(),
  reasoning: z.string().optional(),
  isCounterClaim: z.boolean().optional(),
  attestationId: z.string().uuid().optional(),
  evidenceIds: z.array(z.string().uuid()).optional(),
  counterEvidenceIds: z.array(z.string().uuid()).optional(),
});

router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const claim = await db
    .selectFrom('claim')
    .where('id', '=', req.params.id)
    .selectAll()
    .executeTakeFirst();

  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }

  const evidence = await db
    .selectFrom('claim_evidence')
    .innerJoin('evidence', 'evidence.id', 'claim_evidence.evidence_id')
    .where('claim_evidence.claim_id', '=', req.params.id)
    .select(['evidence.id', 'evidence.name', 'evidence.description', 'evidence.state'])
    .execute();

  const counterEvidence = await db
    .selectFrom('claim_counter_evidence')
    .innerJoin('evidence', 'evidence.id', 'claim_counter_evidence.evidence_id')
    .where('claim_counter_evidence.claim_id', '=', req.params.id)
    .select(['evidence.id', 'evidence.name', 'evidence.description', 'evidence.state'])
    .execute();

  const mitigationStrategies = await db
    .selectFrom('claim_mitigation_strategy')
    .innerJoin('evidence', 'evidence.id', 'claim_mitigation_strategy.evidence_id')
    .where('claim_mitigation_strategy.claim_id', '=', req.params.id)
    .select(['evidence.id', 'evidence.name', 'evidence.description', 'evidence.state'])
    .execute();

  // Fetch target entity details if linked
  let targetEntity = null;
  if ((claim as any).target_entity_id) {
    targetEntity = await db
      .selectFrom('entity')
      .where('id', '=', (claim as any).target_entity_id)
      .select(['id', 'name', 'entity_type', 'bom_ref'])
      .executeTakeFirst() || null;
  }

  // Fetch external references
  const externalReferences = await db
    .selectFrom('claim_external_reference')
    .where('claim_id', '=', req.params.id)
    .selectAll()
    .orderBy('created_at', 'asc')
    .execute();

  res.json({
    claim,
    evidence,
    counterEvidence,
    mitigationStrategies,
    targetEntity,
    externalReferences,
  });
}));

router.post(
  '/',
  requireAuth,
  requirePermission('claims.create'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createClaimSchema.parse(req.body);
      const db = getDatabase();

      // Guard: reject if parent assessment is complete/archived
      const readOnlyError = await checkClaimAssessmentReadOnly(db, data.attestationId);
      if (readOnlyError) {
        res.status(403).json({ error: readOnlyError });
        return;
      }

      // Validate attestation exists if provided
      if (data.attestationId) {
        const attestation = await db
          .selectFrom('attestation')
          .where('id', '=', data.attestationId)
          .selectAll()
          .executeTakeFirst();

        if (!attestation) {
          res.status(404).json({ error: 'Attestation not found' });
          return;
        }

        // Authorization: user must be a participant in the assessment
        const allowed = await isAttestationParticipant(db, req.user!.id, req.user!.role, data.attestationId);
        if (!allowed) {
          res.status(403).json({ error: 'You are not a participant in this assessment' });
          return;
        }
      }

      const claimId = uuidv4();

      await db
        .insertInto('claim')
        .values(toSnakeCase({
          id: claimId,
          name: data.name,
          target: data.target,
          targetEntityId: data.targetEntityId || null,
          predicate: data.predicate,
          reasoning: data.reasoning,
          isCounterClaim: data.isCounterClaim,
          attestationId: data.attestationId,
        }))
        .execute();

      if (data.evidenceIds && data.evidenceIds.length > 0) {
        await db
          .insertInto('claim_evidence')
          .values(
            data.evidenceIds.map(evidenceId => toSnakeCase({
              claimId,
              evidenceId,
              createdAt: new Date(),
            })) as unknown as any
          )
          .execute();
      }

      if (data.counterEvidenceIds && data.counterEvidenceIds.length > 0) {
        await db
          .insertInto('claim_counter_evidence')
          .values(
            data.counterEvidenceIds.map(evidenceId => toSnakeCase({
              claimId,
              evidenceId,
              createdAt: new Date(),
            })) as unknown as any
          )
          .execute();
      }

      logger.info('Claim created', {
        claimId,
        name: data.name,
        requestId: req.requestId,
      });

      res.status(201).json({
        id: claimId,
        name: data.name,
        target: data.target,
        predicate: data.predicate,
        reasoning: data.reasoning,
        isCounterClaim: data.isCounterClaim,
        attestationId: data.attestationId,
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
  requirePermission('claims.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateClaimSchema.parse(req.body);
      const db = getDatabase();

      const claim = await db
        .selectFrom('claim')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }

      // Guard: reject if parent assessment is complete/archived
      const readOnlyError = await checkClaimAssessmentReadOnly(db, (claim as any).attestation_id);
      if (readOnlyError) {
        res.status(403).json({ error: readOnlyError });
        return;
      }

      // Authorization: user must be a participant in the current assessment
      const allowed = await isAttestationParticipant(db, req.user!.id, req.user!.role, (claim as any).attestation_id);
      if (!allowed) {
        res.status(403).json({ error: 'You are not a participant in this assessment' });
        return;
      }

      // If changing attestation, validate the new one exists and check its read-only status
      if (data.attestationId !== undefined && data.attestationId !== (claim as any).attestation_id) {
        if (data.attestationId) {
          const newAttestation = await db
            .selectFrom('attestation')
            .where('id', '=', data.attestationId)
            .selectAll()
            .executeTakeFirst();

          if (!newAttestation) {
            res.status(404).json({ error: 'Target attestation not found' });
            return;
          }

          // Check if the target assessment is read-only
          const targetReadOnlyError = await checkClaimAssessmentReadOnly(db, data.attestationId);
          if (targetReadOnlyError) {
            res.status(403).json({ error: targetReadOnlyError });
            return;
          }
        }
      }

      const updateData: any = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.target !== undefined) updateData.target = data.target;
      if (data.predicate !== undefined) updateData.predicate = data.predicate;
      if (data.reasoning !== undefined) updateData.reasoning = data.reasoning;
      if (data.isCounterClaim !== undefined) updateData.isCounterClaim = data.isCounterClaim;
      if (data.attestationId !== undefined) updateData.attestationId = data.attestationId;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable('claim')
          .set(toSnakeCase(updateData))
          .where('id', '=', req.params.id)
          .execute();
      }

      if (data.evidenceIds !== undefined) {
        await db.deleteFrom('claim_evidence').where('claim_id', '=', req.params.id).execute();

        if (data.evidenceIds.length > 0) {
          await db
            .insertInto('claim_evidence')
            .values(
              data.evidenceIds.map(evidenceId => toSnakeCase({
                claimId: req.params.id,
                evidenceId,
                createdAt: new Date(),
              })) as unknown as any
            )
            .execute();
        }
      }

      if (data.counterEvidenceIds !== undefined) {
        await db
          .deleteFrom('claim_counter_evidence')
          .where('claim_id', '=', req.params.id)
          .execute();

        if (data.counterEvidenceIds.length > 0) {
          await db
            .insertInto('claim_counter_evidence')
            .values(
              data.counterEvidenceIds.map(evidenceId => toSnakeCase({
                claimId: req.params.id,
                evidenceId,
                createdAt: new Date(),
              })) as unknown as any
            )
            .execute();
        }
      }

      logger.info('Claim updated', {
        claimId: req.params.id,
        requestId: req.requestId,
      });

      // Fetch and return the updated claim
      const updatedClaim = await db
        .selectFrom('claim')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      res.json(updatedClaim);
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.delete(
  '/:id',
  requireAuth,
  requirePermission('claims.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    const claim = await db
      .selectFrom('claim')
      .where('id', '=', req.params.id)
      .selectAll()
      .executeTakeFirst();

    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    // Guard: reject if parent assessment is complete/archived
    const readOnlyError = await checkClaimAssessmentReadOnly(db, (claim as any).attestation_id);
    if (readOnlyError) {
      res.status(403).json({ error: readOnlyError });
      return;
    }

    await db.deleteFrom('claim').where('id', '=', req.params.id).execute();

    logger.info('Claim deleted', {
      claimId: req.params.id,
      requestId: req.requestId,
    });

    res.status(204).send();
  })
);

export default router;
