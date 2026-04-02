import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const createClaimSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  target: z.string().min(1, 'Target is required'),
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
  predicate: z.string().min(1).optional(),
  reasoning: z.string().optional(),
  isCounterClaim: z.boolean().optional(),
  attestationId: z.string().uuid().optional(),
  evidenceIds: z.array(z.string().uuid()).optional(),
  counterEvidenceIds: z.array(z.string().uuid()).optional(),
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const attestationId = req.query.attestation_id as string | undefined;

    let query = db.selectFrom('claim').selectAll();

    if (attestationId) {
      query = query.where('attestation_id', '=', attestationId);
    }

    const total = await db
      .selectFrom('claim')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => r.count);

    const claims = await query.limit(limit).offset(offset).execute();

    res.json({
      data: claims,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    logger.error('Get claims error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
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

    res.json({
      claim,
      evidence,
      counterEvidence,
      mitigationStrategies,
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
      const claimId = uuidv4();

      await db
        .insertInto('claim')
        .values({
          id: claimId,
          name: data.name,
          target: data.target,
          predicate: data.predicate,
          reasoning: data.reasoning,
          is_counter_claim: data.isCounterClaim,
          attestation_id: data.attestationId,
        })
        .execute();

      if (data.evidenceIds && data.evidenceIds.length > 0) {
        await db
          .insertInto('claim_evidence')
          .values(
            data.evidenceIds.map(evidenceId => ({
              claim_id: claimId,
              evidence_id: evidenceId,
              created_at: new Date(),
            }))
          )
          .execute();
      }

      if (data.counterEvidenceIds && data.counterEvidenceIds.length > 0) {
        await db
          .insertInto('claim_counter_evidence')
          .values(
            data.counterEvidenceIds.map(evidenceId => ({
              claim_id: claimId,
              evidence_id: evidenceId,
              created_at: new Date(),
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

      const updateData: any = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.target !== undefined) updateData.target = data.target;
      if (data.predicate !== undefined) updateData.predicate = data.predicate;
      if (data.reasoning !== undefined) updateData.reasoning = data.reasoning;
      if (data.isCounterClaim !== undefined) updateData.is_counter_claim = data.isCounterClaim;
      if (data.attestationId !== undefined) updateData.attestation_id = data.attestationId;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable('claim')
          .set(updateData)
          .where('id', '=', req.params.id)
          .execute();
      }

      if (data.evidenceIds !== undefined) {
        await db.deleteFrom('claim_evidence').where('claim_id', '=', req.params.id).execute();

        if (data.evidenceIds.length > 0) {
          await db
            .insertInto('claim_evidence')
            .values(
              data.evidenceIds.map(evidenceId => ({
                claim_id: req.params.id,
                evidence_id: evidenceId,
                created_at: new Date(),
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
              data.counterEvidenceIds.map(evidenceId => ({
                claim_id: req.params.id,
                evidence_id: evidenceId,
                created_at: new Date(),
              }))
            )
            .execute();
        }
      }

      logger.info('Claim updated', {
        claimId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Claim updated successfully' });
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

      await db.deleteFrom('claim').where('id', '=', req.params.id).execute();

      logger.info('Claim deleted', {
        claimId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Claim deleted successfully' });
    } catch (error) {
      logger.error('Delete claim error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
