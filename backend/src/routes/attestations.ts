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
import { rejectIfAttestationImmutable } from '../utils/retention.js';

const router = Router();

// Coerce empty strings and explicit nulls to undefined before UUID validation
// so form fields that the user leaves blank do not trip .uuid() with an
// "Invalid input" error. This is important for the Create Attestation dialog
// where Signatory and Assessor are optional.
const optionalUuid = z.preprocess(
  (val) => (val === '' || val === null ? undefined : val),
  z.string().uuid().optional(),
);

const createAttestationSchema = z.object({
  summary: z.string().optional(),
  assessmentId: z.string().uuid('Invalid assessment ID'),
  signatoryId: optionalUuid,
  assessorId: optionalUuid,
});

const updateAttestationSchema = z.object({
  summary: z.string().optional(),
  signatoryId: optionalUuid,
  assessorId: optionalUuid,
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
  // Sprint 6: editing an existing attestation is a distinct action from
  // creating one, even though both touch the same row. Splitting lets
  // admins grant edit to reviewers without also granting the ability to
  // spin up new attestations. The migration backfills this permission
  // onto every role that already had attestations.create so existing
  // grants keep working.
  requirePermission('attestations.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateAttestationSchema.parse(req.body);
      const db = getDatabase();

      const attestation = await fetchAttestationById(db, req.params.id as string);

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      // PR3: retention lock. An attestation referenced by a sealed
      // affirmation, or living on an assessment in a terminal state, is
      // frozen for every caller including admins. Record-integrity rule,
      // so it runs before the (softer) read-only assessment check below.
      if (await rejectIfAttestationImmutable(db, req.params.id as string, res)) return;

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
  requirePermission('attestations.edit'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = addRequirementSchema.parse(req.body);
      const db = getDatabase();

      const attestation = await fetchAttestationById(db, req.params.id as string);

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      // PR3: retention lock. Adding or updating a requirement on a
      // sealed-affirmation or terminal-assessment attestation would
      // mutate the frozen record.
      if (await rejectIfAttestationImmutable(db, req.params.id as string, res)) return;

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
  requirePermission('attestations.edit'),
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

      // PR3: retention lock. Updating a requirement is mutating the
      // parent attestation, so we reject the same way.
      if (await rejectIfAttestationImmutable(db, req.params.id as string, res)) return;

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

// ---------------------------------------------------------------------------
// PR3.6: Per-attestation sign/verify/rescind endpoints removed.
//
// Attestation authority now flows through the assessment's affirmation
// and its signatory slots (see routes/affirmations.ts). Cascade signing
// produces a single declarations-level JSF envelope (platform-signed)
// and a document-level JSF envelope (platform-signed). Individual
// attestation rows no longer carry signature material.
//
// Removed in this PR:
//   - POST /:id/sign             (replaced by affirmation slot sign)
//   - POST /:id/sign/prepare     (replaced by affirmation slot prepare)
//   - POST /:id/verify           (replaced by affirmation-level verify)
//   - POST /:id/rescind          (replaced by affirmation rescind/reseal)
//
// The migration in db/migrate.ts drops the signature_* /
// rescinded_* columns from attestation and revokes the legacy
// attestations.verify and attestations.rescind permissions.
// ---------------------------------------------------------------------------

/**
 * Export a single attestation as a standalone CycloneDX attestations
 * document (CDXA). Scoped down to one attestation row so a consumer can
 * be handed the requirements/claims evidence for that attestation alone.
 *
 * Spec version is selected via ?spec=1.6|1.7 (defaults to 1.7). The
 * signatory block mirrors the CycloneDX 1.6/1.7 shape (name, role,
 * organization, optional externalReference for electronic signatures).
 * Signature material is emitted only at the assessment level via the
 * affirmation flow (see routes/export.ts) — a single-attestation export
 * never carries a JSF envelope because the envelope is scoped to the
 * assessment's declarations tree, not a single attestation.
 */
router.get(
  '/:id/export',
  requireAuth,
  requirePermission('attestations.export'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const attestation = await fetchAttestationById(db, req.params.id as string);

    if (!attestation) {
      res.status(404).json({ error: 'Attestation not found' });
      return;
    }

    const rawSpec = typeof req.query.spec === 'string' ? req.query.spec.trim() : '';
    const specVersion: '1.6' | '1.7' = rawSpec === '1.6' ? '1.6' : '1.7';
    const schemaUrl =
      specVersion === '1.6'
        ? 'http://cyclonedx.org/schema/bom-1.6.schema.json'
        : 'http://cyclonedx.org/schema/bom-1.7.schema.json';

    const requirements = await fetchAttestationRequirements(db, req.params.id as string);
    const claims = await fetchAttestationClaims(db, req.params.id as string);
    const signatory = await fetchSignatory(db, attestation.signatory_id || null);

    let signatoryOrg: Record<string, unknown> | null = null;
    if (signatory && (signatory as Record<string, unknown>).organization_id) {
      signatoryOrg = (await db
        .selectFrom('organization')
        .where('id', '=', (signatory as Record<string, unknown>).organization_id as string)
        .selectAll()
        .executeTakeFirst()) as Record<string, unknown> | null;
    }

    // Build a CycloneDX-shaped signatory block from the row. Signature
    // subtree is intentionally omitted here; see the block comment above
    // for why single-attestation exports never carry a JSF envelope.
    let signatoryBlock: Record<string, unknown> | undefined;
    if (signatory) {
      const row = signatory as Record<string, unknown>;
      const block: Record<string, unknown> = { name: row.name };
      if (row.role) block.role = row.role;
      if (signatoryOrg) {
        const address: Record<string, unknown> = {};
        if (signatoryOrg.country) address.country = signatoryOrg.country;
        if (signatoryOrg.region) address.region = signatoryOrg.region;
        if (signatoryOrg.locality) address.locality = signatoryOrg.locality;
        if (signatoryOrg.post_office_box_number) {
          address.postOfficeBoxNumber = signatoryOrg.post_office_box_number;
        }
        if (signatoryOrg.postal_code) address.postalCode = signatoryOrg.postal_code;
        if (signatoryOrg.street_address) address.streetAddress = signatoryOrg.street_address;
        const org: Record<string, unknown> = { name: signatoryOrg.name };
        if (Object.keys(address).length > 0) org.address = address;
        if (signatoryOrg.website) org.url = [signatoryOrg.website];
        block.organization = org;
      }
      if (row.external_reference_type && row.external_reference_url) {
        block.externalReference = {
          type: row.external_reference_type,
          url: row.external_reference_url,
        };
      }
      signatoryBlock = block;
    }

    const cdxa: Record<string, unknown> = {
      $schema: schemaUrl,
      bomFormat: 'CycloneDX',
      specVersion,
      serialNumber: `urn:uuid:${uuidv4()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        tools: {
          components: [
            { type: 'application', name: 'CycloneDX Assessors Studio' },
          ],
        },
      },
      declarations: {
        attestations: [
          {
            summary: attestation.summary ?? null,
            map: (requirements as Record<string, unknown>[]).map((r) => ({
              requirement: r.requirement_id ?? r.requirementId,
              conformance: {
                score: r.conformance_score ?? r.conformanceScore,
                rationale: r.conformance_rationale ?? r.conformanceRationale,
              },
              confidence:
                (r.confidence_score ?? r.confidenceScore) != null
                  ? {
                      score: r.confidence_score ?? r.confidenceScore,
                      rationale: r.confidence_rationale ?? r.confidenceRationale,
                    }
                  : undefined,
            })),
          },
        ],
        claims: claims as Record<string, unknown>[],
        // Single-attestation exports include the signatory identity
        // block (so a consumer can see who is named on the attestation)
        // but never an affirmation.signatures[] subtree, since a valid
        // JSF envelope requires the assessment-scoped declarations tree
        // that the /assessments/:id/export route emits.
        ...(signatoryBlock
          ? {
              affirmation: {
                statement:
                  'This attestation identifies the signatory listed. See the assessment-level export for the sealed CycloneDX affirmation and JSF signature envelope.',
                signatories: [signatoryBlock],
              },
            }
          : {}),
      },
    };

    res.setHeader('Content-Type', 'application/vnd.cyclonedx+json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attestation-${attestation.id}-cdx-${specVersion}.json"`
    );
    res.json(cdxa);
  })
);

export default router;
