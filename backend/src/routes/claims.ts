import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';
import { toSnakeCase } from '../middleware/camelCase.js';

const router = Router();

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

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
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
  } catch (error) {
    logger.error('Get claim error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
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
            }))
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
            }))
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
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Create claim error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:id',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
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
              }))
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
              }))
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
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Update claim error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin', 'assessor'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      logger.error('Delete claim error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
