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
import { encryptionService } from '../utils/encryption.js';
import { getStorageProvider } from '../storage/index.js';
import {
  getSignatureProviders,
  verifyDetachedSignature,
} from '../signatures/index.js';
import { JSF_ASYMMETRIC_ALGORITHMS } from '@cyclonedx/jsf';

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

      // Sprint 5.7: retention lock. A signed attestation is frozen for
      // every caller including admins. This is a record-integrity rule,
      // not an authorization rule, so it runs before the (softer)
      // read-only assessment check below.
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

      // Sprint 5.7: retention lock. Adding or updating a requirement on
      // a signed attestation would mutate the signed record.
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

      // Sprint 5.7: retention lock. Updating a requirement is mutating
      // the parent attestation, so we reject the same way.
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

// Sprint 6: signature schemas for the /sign endpoint.
//
// Three shapes are accepted, determined by the presence of
// signatureType in the body:
//
//   - legacy (no signatureType): just a signatoryId. Preserved for
//     backward compatibility with callers that predate the lifecycle
//     rework. Recorded as an electronic signature with signed_name
//     backfilled from the signatory row.
//   - electronic: ESIGN-style typed name plus optional written-signature
//     image (data URL), captured jurisdiction, captured legal intent.
//     No cryptographic binding; the attestation's authority comes from
//     the audit trail (signed_by, signature_ip, signature_user_agent)
//     plus the immutability lock that kicks in at sign time.
//   - digital: detached signature over a canonical payload hash.
//     signatureValue is base64; publicKeyPem is the signer's public key
//     in PEM form; certificateChain is an optional PEM bundle. The
//     server recomputes the canonical payload hash at verify time and
//     validates the signature against the embedded public key.
const legacySignSchema = z.object({
  signatureType: z.undefined().optional(),
  signatoryId: z.string().uuid('signatoryId is required when no signatureType is provided'),
});

const electronicSignSchema = z.object({
  signatureType: z.literal('electronic'),
  signatoryId: z.string().uuid().optional(),
  signedName: z.string().min(1, 'signedName is required for electronic signatures'),
  signatureImageData: z.string().optional(),
  jurisdiction: z.string().optional(),
  legalIntent: z.string().optional(),
});

// Signature algorithms are constrained to the JSF asymmetric set. HMAC
// algorithms are excluded because symmetric keys cannot attribute a
// signature to a specific signatory. The enum is sourced from the JSF
// package so the wire contract and the crypto primitives stay in lock
// step; adding an algorithm to the JSF package automatically widens
// this contract.
const digitalSignSchema = z.object({
  signatureType: z.literal('digital'),
  signatoryId: z.string().uuid().optional(),
  signatureAlgorithm: z.enum(JSF_ASYMMETRIC_ALGORITHMS),
  signatureValue: z.string().min(1),
  publicKeyPem: z.string().min(1),
  certificateChain: z.string().optional(),
  canonicalPayloadHash: z.string().optional(),
});

// Stored-signature path (Option B). The caller references a row from
// their own /me/signatures inventory. The server decrypts the stored
// payload, materializes a fresh signatory row from the embedded name/
// role/organization/image, and then writes the attestation exactly the
// same way the inline electronic/digital paths do. Optional overrides
// let the caller tweak affirmation context (jurisdiction/legalIntent)
// or supply the cryptographic signature value a local signing tool just
// produced against the prepared canonical hash.
const storedSignSchema = z.object({
  userSignatureId: z.string().uuid('userSignatureId is required'),
  // Electronic overrides (all optional; stored payload wins otherwise).
  signedName: z.string().optional(),
  jurisdiction: z.string().optional(),
  legalIntent: z.string().optional(),
  // Digital fields: the signature value is produced client-side from
  // the prepared canonical payload hash. It is required when the
  // referenced signature is of type 'digital'.
  signatureValue: z.string().optional(),
  canonicalPayloadHash: z.string().optional(),
});

const signSchema = z.union([legacySignSchema, electronicSignSchema, digitalSignSchema]);

/**
 * Build the canonical payload that a signature binds to.
 *
 * The payload is intentionally narrow: signing ties an attestation to
 * the requirement assertions it endorses. Adding or removing a
 * requirement after signing must break the signature, and the retention
 * lock already rejects mutation paths that would let it. We hash the
 * sorted list of (requirementId, conformanceScore, conformanceRationale,
 * confidenceScore, confidenceRationale) tuples along with the
 * attestation id and summary, which gives a verify step something
 * meaningful to compare against even though mutation is already
 * blocked.
 *
 * Canonicalization is delegated to the configured signature provider
 * (JSF today, X.590/JSS in CycloneDX v2). That keeps the canonical
 * representation aligned with whatever scheme the route is signing
 * under, and ensures verify-time recomputation always agrees with
 * sign-time canonicalization.
 */
async function computeCanonicalPayloadHash(
  db: ReturnType<typeof getDatabase>,
  attestationId: string
): Promise<string> {
  const attestation = await fetchAttestationById(db, attestationId);
  const requirements = await fetchAttestationRequirements(db, attestationId);

  const normalized: Record<string, unknown> = {
    id: attestation?.id ?? null,
    assessmentId: attestation?.assessment_id ?? null,
    summary: attestation?.summary ?? null,
    requirements: (requirements as Record<string, unknown>[])
      .map((r) => ({
        requirementId: r.requirement_id ?? r.requirementId,
        conformanceScore: r.conformance_score ?? r.conformanceScore,
        conformanceRationale: r.conformance_rationale ?? r.conformanceRationale,
        confidenceScore: r.confidence_score ?? r.confidenceScore ?? null,
        confidenceRationale: r.confidence_rationale ?? r.confidenceRationale ?? null,
      }))
      .sort((a, b) => String(a.requirementId).localeCompare(String(b.requirementId))),
  };

  // The algorithm we pass here is purely metadata for canonicalization;
  // the canonical-bytes step does not actually invoke the signing
  // primitive. ES256 is a safe default since every JSF-shaped provider
  // accepts it. The provider's JsonObject is a narrower union than
  // Record<string, unknown> (it requires JsonValue leaves), but the
  // payload we build above only ever contains JSON-serializable leaves
  // sourced from the attestation/requirement rows, so the cast is safe.
  const provider = getSignatureProviders().getDefault();
  const { sha256Hex } = provider.canonicalize(
    normalized as unknown as Parameters<typeof provider.canonicalize>[0],
    { algorithm: 'ES256' },
  );
  return sha256Hex;
}

// ---------------------------------------------------------------------------
// Stored-signature (Option B) helpers
//
// When a caller signs via a stored /me/signatures entry we:
//   1. Look up the row and verify it belongs to the caller.
//   2. Decrypt the payload back to the electronic/digital shape the
//      user configured in My Signatures.
//   3. For electronic signatures, materialize a signatory row (find or
//      create its organization by name, copy name/role onto the
//      signatory, and stamp an externalReference of type
//      "electronic-signature" when an image is attached). The legacy
//      signatory table therefore keeps acting as the historical ledger
//      each export pulls from.
//   4. Pull signature image bytes through the storage provider and
//      return a data: URI so they can be inlined on the attestation
//      (attestation.signature_image_data) and in the export.
// ---------------------------------------------------------------------------

interface StoredSignatureRow {
  id: string;
  user_id: string;
  signature_type: 'electronic' | 'digital';
  signature_format: 'jsf' | 'x509' | null;
  payload_encrypted: string;
  key_fingerprint: string | null;
  signature_image_filename: string | null;
  signature_image_content_type: string | null;
  signature_image_storage_path: string | null;
  signature_image_binary_content: Buffer | null;
  signature_image_storage_provider: string | null;
}

// Shape shared by both stored payload branches. Electronic and digital
// records both carry CycloneDX signatory identity (name, role,
// organization) so a signatory row can be materialized regardless of
// which branch was chosen at sign time.
interface StoredSignatoryIdentity {
  name: string;
  role?: string;
  organization: {
    name: string;
    address?: {
      country?: string;
      region?: string;
      locality?: string;
      postOfficeBoxNumber?: string;
      postalCode?: string;
      streetAddress?: string;
    };
    url?: string[];
  };
}

interface StoredElectronicPayload extends StoredSignatoryIdentity {
  signedName?: string;
  jurisdiction?: string;
  legalIntent?: string;
}

interface StoredDigitalPayload extends StoredSignatoryIdentity {
  signatureFormat: 'jsf' | 'x509';
  signatureAlgorithm: string;
  publicKeyPem: string;
  certificateChain?: string;
}

/**
 * Fetch a stored signature row that belongs to the caller. Returns
 * undefined if the row does not exist or is owned by someone else —
 * callers translate that into a 404 so the endpoint never leaks the
 * existence of another user's inventory.
 */
async function fetchOwnedStoredSignature(
  db: ReturnType<typeof getDatabase>,
  userSignatureId: string,
  userId: string
): Promise<StoredSignatureRow | undefined> {
  return (await db
    .selectFrom('user_signature')
    .where('id', '=', userSignatureId)
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst()) as StoredSignatureRow | undefined;
}

/**
 * Find an organization by name, or insert a new one. We intentionally
 * match on name only — CycloneDX signatory affirmation is low-volume
 * per tenant, and "Acme Inc." should materialize the same organization
 * row every sign regardless of which user's signature references it.
 * Address/url fields are backfilled the first time we see them so the
 * first-written wins; later signatures do not overwrite existing data.
 */
async function findOrCreateOrganizationByName(
  db: ReturnType<typeof getDatabase>,
  organization: StoredSignatoryIdentity['organization']
): Promise<string> {
  const existing = await db
    .selectFrom('organization')
    .where('name', '=', organization.name)
    .select(['id'])
    .executeTakeFirst();

  if (existing) {
    return existing.id as string;
  }

  const id = uuidv4();
  const address = organization.address ?? {};
  const website = Array.isArray(organization.url) && organization.url.length > 0
    ? organization.url[0]
    : null;

  await db
    .insertInto('organization')
    .values({
      id,
      name: organization.name,
      country: address.country ?? null,
      region: address.region ?? null,
      locality: address.locality ?? null,
      post_office_box_number: address.postOfficeBoxNumber ?? null,
      postal_code: address.postalCode ?? null,
      street_address: address.streetAddress ?? null,
      website,
    })
    .execute();

  return id;
}

/**
 * Insert a new signatory row copying identity from a stored signature
 * payload. Works for both electronic and digital payloads since both
 * carry the same CycloneDX signatory identity shape (name, role,
 * organization). The signatory table stays append-only from this path
 * — prior signatories stay untouched even if the caller updates their
 * stored signature afterwards. externalReference fields are populated
 * only when a signature image exists (electronic path); the export
 * layer can then emit a CycloneDX externalReference of type
 * "electronic-signature" without an extra lookup.
 */
async function materializeSignatoryFromStored(
  db: ReturnType<typeof getDatabase>,
  identity: StoredSignatoryIdentity,
  imageDataUri: string | null
): Promise<string> {
  const organizationId = await findOrCreateOrganizationByName(db, identity.organization);
  const signatoryId = uuidv4();

  await db
    .insertInto('signatory')
    .values({
      id: signatoryId,
      name: identity.name,
      role: identity.role ?? null,
      organization_id: organizationId,
      external_reference_type: imageDataUri ? 'electronic-signature' : null,
      external_reference_url: imageDataUri,
    })
    .execute();

  return signatoryId;
}

/**
 * Pull the signature image bytes through the storage provider and
 * return a data: URI. Returns null when no image is attached or when
 * the bytes cannot be read — callers treat a null return as "no image"
 * rather than a hard error so signing a brand-new inventory entry
 * without an uploaded image still works.
 */
async function loadStoredSignatureImageDataUri(
  row: StoredSignatureRow
): Promise<string | null> {
  if (!row.signature_image_filename) {
    return null;
  }

  const providerName = (row.signature_image_storage_provider || 'database') as StoredSignatureRow['signature_image_storage_provider'];
  const contentType = row.signature_image_content_type || 'application/octet-stream';

  try {
    if (providerName === 'database') {
      const buf = row.signature_image_binary_content;
      if (!buf) return null;
      const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    }
    const provider = getStorageProvider();
    const result = await provider.get(row.signature_image_storage_path || '');
    const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    logger.warn('Failed to load stored signature image; signing without image', {
      signatureId: row.id,
      providerName,
      error: (err as Error).message,
    });
    return null;
  }
}

router.post(
  '/:id/sign',
  requireAuth,
  requirePermission('signatures.sign'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();
      const attestation = await fetchAttestationById(db, req.params.id as string);

      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      // Sprint 5.7: re-signing is a mutation on a retention-locked
      // record. Reject with 409 so the client is forced to treat a
      // signed attestation as frozen.
      if (attestation.signed_at) {
        res.status(409).json({
          error: 'Attestation is immutable once signed',
          reason: 'signed',
        });
        return;
      }

      const ipAddress = (req.ip || req.socket.remoteAddress || '').slice(0, 64);
      const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 1000);
      const canonicalHash = await computeCanonicalPayloadHash(db, req.params.id as string);

      // ------------------------------------------------------------------
      // Stored-signature branch (Option B). Detected by the presence of
      // userSignatureId in the body — keeps the inline electronic/digital
      // paths fully backward compatible while letting the new My
      // Signatures inventory drive the affirmation/digital material.
      // ------------------------------------------------------------------
      if (typeof (req.body as { userSignatureId?: unknown })?.userSignatureId === 'string') {
        const stored = storedSignSchema.parse(req.body);
        const userId = req.user?.id;
        if (!userId) {
          res.status(401).json({ error: 'Unauthenticated' });
          return;
        }

        const sigRow = await fetchOwnedStoredSignature(db, stored.userSignatureId, userId);
        if (!sigRow) {
          res.status(404).json({ error: 'Signature not found in your inventory' });
          return;
        }

        let payload: StoredElectronicPayload | StoredDigitalPayload;
        try {
          const plaintext = encryptionService.decrypt(sigRow.payload_encrypted);
          payload = plaintext ? JSON.parse(plaintext) : null;
        } catch (err) {
          logger.error('Failed to decrypt stored signature payload at sign time', {
            signatureId: sigRow.id,
            error: (err as Error).message,
          });
          res.status(500).json({ error: 'Stored signature payload could not be decrypted' });
          return;
        }
        if (!payload) {
          res.status(500).json({ error: 'Stored signature payload is empty' });
          return;
        }

        const updateValues: Record<string, unknown> = {
          signedAt: new Date(),
          signedBy: userId,
          signatureType: sigRow.signature_type,
          signatureIp: ipAddress || null,
          signatureUserAgent: userAgent || null,
          canonicalPayloadHash: canonicalHash,
        };

        if (sigRow.signature_type === 'electronic') {
          const electronic = payload as StoredElectronicPayload;
          // Pull the image first so the materialized signatory can
          // record an electronic-signature externalReference URL.
          const imageDataUri = await loadStoredSignatureImageDataUri(sigRow);
          const signatoryId = await materializeSignatoryFromStored(
            db,
            electronic,
            imageDataUri
          );

          updateValues.signatoryId = signatoryId;
          updateValues.signedName = stored.signedName ?? electronic.signedName ?? electronic.name;
          updateValues.signatureImageData = imageDataUri;
          updateValues.signatureJurisdiction =
            stored.jurisdiction ?? electronic.jurisdiction ?? null;
          updateValues.signatureLegalIntent =
            stored.legalIntent ?? electronic.legalIntent ?? null;
        } else if (sigRow.signature_type === 'digital') {
          const digital = payload as StoredDigitalPayload;
          if (!stored.signatureValue) {
            res.status(400).json({
              error:
                'signatureValue is required when signing with a stored digital signature. Call POST /:id/sign/prepare to obtain the canonical payload hash, sign it locally, and resubmit.',
            });
            return;
          }

          // Materialize a signatory row for the digital path so the
          // exporter can emit a spec conformant signatory with the
          // signature subtree attached. No image is attached to digital
          // signatories (CycloneDX oneOf routes them through the
          // `signature` branch, not externalReference).
          const digitalSignatoryId = await materializeSignatoryFromStored(
            db,
            digital,
            null
          );
          updateValues.signatoryId = digitalSignatoryId;
          updateValues.signatureAlgorithm = digital.signatureAlgorithm;
          updateValues.signatureValue = stored.signatureValue;
          updateValues.publicKeyPem = digital.publicKeyPem;
          updateValues.certificateChain = digital.certificateChain ?? null;
          if (stored.canonicalPayloadHash) {
            updateValues.canonicalPayloadHash = stored.canonicalPayloadHash;
          }
        }

        await db
          .updateTable('attestation')
          .set(toSnakeCase(updateValues))
          .where('id', '=', req.params.id)
          .execute();

        logger.info('Attestation signed via stored signature', {
          attestationId: req.params.id,
          userSignatureId: sigRow.id,
          signatureType: sigRow.signature_type,
          signatoryId: updateValues.signatoryId ?? null,
          requestId: req.requestId,
        });

        res.json({
          message: 'Attestation signed successfully',
          signatureType: sigRow.signature_type,
          signatoryId: updateValues.signatoryId ?? null,
          canonicalPayloadHash: updateValues.canonicalPayloadHash,
        });
        return;
      }

      // ------------------------------------------------------------------
      // Inline branches: legacy (signatoryId only), electronic (typed
      // name + optional image data URL), or digital (full key material).
      // ------------------------------------------------------------------
      const data = signSchema.parse(req.body);

      if (data.signatoryId) {
        const signatory = await db
          .selectFrom('signatory')
          .where('id', '=', data.signatoryId)
          .selectAll()
          .executeTakeFirst();
        if (!signatory) {
          res.status(404).json({ error: 'Signatory not found' });
          return;
        }
      }

      const updateValues: Record<string, unknown> = {
        signedAt: new Date(),
        signedBy: req.user?.id ?? null,
        signatureType: data.signatureType ?? null,
        signatureIp: ipAddress || null,
        signatureUserAgent: userAgent || null,
        canonicalPayloadHash: canonicalHash,
      };

      if (data.signatoryId) updateValues.signatoryId = data.signatoryId;

      if (data.signatureType === 'electronic') {
        updateValues.signedName = data.signedName;
        updateValues.signatureImageData = data.signatureImageData ?? null;
        updateValues.signatureJurisdiction = data.jurisdiction ?? null;
        updateValues.signatureLegalIntent = data.legalIntent ?? null;
      } else if (data.signatureType === 'digital') {
        updateValues.signatureAlgorithm = data.signatureAlgorithm;
        updateValues.signatureValue = data.signatureValue;
        updateValues.publicKeyPem = data.publicKeyPem;
        updateValues.certificateChain = data.certificateChain ?? null;
        // Client may supply its own canonical hash if it signed an
        // alternate payload shape. If absent, fall back to the hash
        // we just computed.
        if (data.canonicalPayloadHash) updateValues.canonicalPayloadHash = data.canonicalPayloadHash;
      }
      // Legacy path (no signatureType): the base updateValues above
      // already captures everything the pre-Sprint-6 signers recorded.

      await db
        .updateTable('attestation')
        .set(toSnakeCase(updateValues))
        .where('id', '=', req.params.id)
        .execute();

      logger.info('Attestation signed', {
        attestationId: req.params.id,
        signatureType: data.signatureType,
        signatoryId: data.signatoryId ?? null,
        requestId: req.requestId,
      });

      res.json({
        message: 'Attestation signed successfully',
        signatureType: data.signatureType,
        canonicalPayloadHash: canonicalHash,
      });
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

/**
 * Two-step digital signing: step one returns the canonical payload
 * hash that the client should sign locally with their private key.
 * The client then resubmits to /:id/sign with the signatureValue
 * (and optionally an exact canonicalPayloadHash) so the server can
 * stamp the attestation. This keeps private-key material entirely
 * client-side.
 *
 * Also useful as a "dry-run" for electronic signers who want to see
 * what payload they're about to commit to before the immutability
 * lock kicks in.
 */
router.post(
  '/:id/sign/prepare',
  requireAuth,
  requirePermission('signatures.sign'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const attestation = await fetchAttestationById(db, req.params.id as string);
    if (!attestation) {
      res.status(404).json({ error: 'Attestation not found' });
      return;
    }
    if (attestation.signed_at) {
      res.status(409).json({
        error: 'Attestation is immutable once signed',
        reason: 'signed',
      });
      return;
    }

    const canonicalHash = await computeCanonicalPayloadHash(db, req.params.id as string);
    res.json({
      attestationId: req.params.id,
      canonicalPayloadHash: canonicalHash,
      hashAlgorithm: 'sha256',
    });
  })
);

/**
 * Verify a previously-signed attestation.
 *
 * For electronic signatures we only confirm that the canonical payload
 * has not drifted since sign time (the record may have been corrupted
 * through an out-of-band mutation). For digital signatures we also
 * validate the signature value against the stored public key by
 * routing through the configured SignatureProvider's algorithm
 * primitives (today, the JSF package). Both paths return a structured
 * result so the UI can render a clear success/failure state.
 */
router.post(
  '/:id/verify',
  requireAuth,
  requirePermission('attestations.verify'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();
    const attestation = await fetchAttestationById(db, req.params.id as string);

    if (!attestation) {
      res.status(404).json({ error: 'Attestation not found' });
      return;
    }

    if (!attestation.signed_at) {
      res.status(400).json({ error: 'Attestation has not been signed', verified: false });
      return;
    }

    const currentHash = await computeCanonicalPayloadHash(db, req.params.id as string);
    const storedHash = attestation.canonical_payload_hash ?? '';
    const payloadMatches = storedHash === currentHash;

    const result: Record<string, unknown> = {
      verified: payloadMatches,
      signatureType: attestation.signature_type,
      signedAt: attestation.signed_at,
      canonicalPayloadHashCurrent: currentHash,
      canonicalPayloadHashStored: storedHash,
      payloadMatches,
      rescinded: Boolean(attestation.rescinded_at),
      issues: [] as string[],
    };

    if (!payloadMatches) {
      (result.issues as string[]).push('Canonical payload has drifted from the hash stored at sign time.');
    }

    if (attestation.signature_type === 'digital') {
      if (!attestation.signature_value || !attestation.public_key_pem || !attestation.signature_algorithm) {
        (result.issues as string[]).push('Digital signature is missing required material (value/algorithm/public key).');
        result.verified = false;
      } else {
        // The signed input is the canonical payload hash that was
        // returned by /sign/prepare. The client signed the UTF-8 bytes
        // of that hex string, so verify uses the same encoding. We
        // verify against the stored hash when present so the verify
        // outcome stays stable even if the canonical payload drifts;
        // the payloadMatches check above already surfaces drift as a
        // separate issue.
        const signedInputHex = storedHash || currentHash;
        const detached = verifyDetachedSignature({
          algorithm: attestation.signature_algorithm,
          publicKey: attestation.public_key_pem,
          data: Buffer.from(signedInputHex, 'utf8'),
          signatureBase64: attestation.signature_value,
        });
        result.signatureValid = detached.valid;
        if (!detached.valid) {
          (result.issues as string[]).push(
            detached.reason
              ? `Digital signature did not verify: ${detached.reason}`
              : 'Digital signature did not verify against the stored public key.',
          );
          result.verified = false;
        }
      }
    }

    if (attestation.rescinded_at) {
      (result.issues as string[]).push('Attestation has been rescinded.');
      result.verified = false;
    }

    logger.info('Attestation verified', {
      attestationId: req.params.id,
      verified: result.verified,
      requestId: req.requestId,
    });

    res.json(result);
  })
);

/**
 * Rescind a previously-signed attestation.
 *
 * Rescinding does not delete the record — the retention lock keeps the
 * row immutable. Instead we stamp rescinded_at/by/reason so verify
 * reports the rescinded state and downstream exports can advertise it.
 * A rescinded attestation stays signed; consumers must still trust that
 * *at the time of signing* the signer endorsed the payload.
 */
router.post(
  '/:id/rescind',
  requireAuth,
  requirePermission('attestations.rescind'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { reason } = z.object({ reason: z.string().min(1, 'reason is required') }).parse(req.body);
      const db = getDatabase();

      const attestation = await fetchAttestationById(db, req.params.id as string);
      if (!attestation) {
        res.status(404).json({ error: 'Attestation not found' });
        return;
      }

      if (!attestation.signed_at) {
        res.status(400).json({ error: 'Only signed attestations can be rescinded' });
        return;
      }

      if (attestation.rescinded_at) {
        res.status(409).json({ error: 'Attestation is already rescinded' });
        return;
      }

      await db
        .updateTable('attestation')
        .set(
          toSnakeCase({
            rescindedAt: new Date(),
            rescindedBy: req.user?.id ?? null,
            rescindReason: reason,
          })
        )
        .where('id', '=', req.params.id)
        .execute();

      logger.info('Attestation rescinded', {
        attestationId: req.params.id,
        rescindedBy: req.user?.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Attestation rescinded' });
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

/**
 * Export a single attestation as a standalone CycloneDX attestations
 * document (CDXA). The shape mirrors what the whole-assessment export
 * produces, but scoped down to one attestation row. This is the path
 * consumers use to share a single signed record with a supply chain
 * partner without exposing the rest of the assessment.
 *
 * Spec version is selected via ?spec=1.6|1.7 (defaults to 1.7). The
 * signatory block mirrors the CycloneDX 1.6/1.7 shape: name, role,
 * organization, and either a digital `signature` or an
 * `externalReference` of type "electronic-signature" for DocuSign-
 * style flows.
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

    // Build a CycloneDX-shaped signatory block from the row.
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
      if (attestation.signature_type === 'digital') {
        const sig: Record<string, unknown> = {};
        if (attestation.signature_algorithm) sig.algorithm = attestation.signature_algorithm;
        if (attestation.signature_value) sig.value = attestation.signature_value;
        if (attestation.certificate_chain) {
          const chain = String(attestation.certificate_chain);
          const certs = chain
            .split(/-----END CERTIFICATE-----/g)
            .map((b) => b.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/\s+/g, '').trim())
            .filter((b) => b.length > 0);
          if (certs.length > 0) sig.certificatePath = certs;
        } else if (attestation.public_key_pem) {
          sig.publicKey = attestation.public_key_pem;
        }
        if (Object.keys(sig).length > 0) block.signature = sig;
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
        ...(signatoryBlock && attestation.signed_at
          ? {
              affirmation: {
                statement:
                  attestation.signature_legal_intent ??
                  'This attestation has been signed by the listed signatory.',
                signatories: [signatoryBlock],
              },
            }
          : {}),
      },
      // Out-of-band metadata for downstream verifiers. These fields
      // are not part of the CycloneDX schema but travel alongside the
      // BOM so consumers have everything they need to verify the
      // attestation. Strip them if you are sending to a tool that
      // rejects unknown properties.
      meta: attestation.signed_at
        ? {
            signedAt: attestation.signed_at,
            signatureType: attestation.signature_type,
            signedName: attestation.signed_name ?? undefined,
            jurisdiction: attestation.signature_jurisdiction ?? undefined,
            legalIntent: attestation.signature_legal_intent ?? undefined,
            canonicalPayloadHash: attestation.canonical_payload_hash ?? undefined,
            rescindedAt: attestation.rescinded_at ?? undefined,
            rescindReason: attestation.rescind_reason ?? undefined,
          }
        : undefined,
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
