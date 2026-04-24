/**
 * Shared export helper: build the CycloneDX `declarations.affirmation`
 * block for a given assessment. Both the assessment-level export and
 * the per-attestation export call in here so they serialize the same
 * affirmation shape, including signatory filtering against the
 * CycloneDX 1.6 / 1.7 Signatory `oneOf` constraint.
 *
 * The CycloneDX spec constrains every signatory to include either a
 * `signature` (digital) or both `externalReference` and
 * `organization` (electronic). This helper drops any signatory that
 * meets neither branch so we never emit a schema-invalid BOM.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type {
  Affirmation as CdxAffirmation,
  Signatory as CdxSignatory,
  Signature as CdxSignature,
  Standard as CdxStandard,
} from '../cdxspec/types.js';
import { signatoryBlock, isSignatoryValid, standardFromRow } from '../cdxspec/index.js';

/**
 * Parse a JSONB column value into a plain object. PGlite and
 * node-postgres deliver JSONB as either a parsed object or a raw
 * string depending on driver version, so both shapes are tolerated.
 */
export function parseJsonbColumn(value: unknown): CdxSignature | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as CdxSignature;
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'object') return value as CdxSignature;
  return undefined;
}

/**
 * Fields permitted on a JSF `signer` object per the JSF 0.82 schema
 * bundled with CycloneDX. Any other key makes the outer BOM schema
 * invalid because signer has `additionalProperties: false`. We keep
 * this list explicit so a silent shape drift in the stored
 * envelope does not sneak an invalid field into the export.
 */
const JSF_SIGNER_FIELDS = new Set([
  'algorithm',
  'keyId',
  'publicKey',
  'certificatePath',
  'excludes',
  'value',
]);

/**
 * Normalize a stored signature envelope into the JSF signer shape
 * that CycloneDX expects on `attestation.signature`, Signatory
 * `signature`, `declarations.signature`, and `bom.signature`.
 *
 * Our internal sign path stores the full canonical payload with a
 * nested `.signature` (the signer), which is useful for re-verify
 * but invalid at export time because the CycloneDX schema points
 * at jsf-0.82.schema.json#/definitions/signer, which has
 * `additionalProperties: false` and only whitelists algorithm,
 * keyId, publicKey, certificatePath, excludes, and value.
 *
 * Returns undefined when no JSF-shaped signer can be extracted
 * (e.g. electronic signature envelopes that have no algorithm/value
 * — those flow through the externalReference branch of the
 * Signatory oneOf instead).
 */
export function toJsfSigner(envelope: unknown): CdxSignature | undefined {
  if (!envelope || typeof envelope !== 'object') return undefined;
  let current = envelope as Record<string, unknown>;
  // Descend through nested `.signature` wrappers until we find a
  // node that looks like a signer (has algorithm and value) or
  // until there's no more .signature to unwrap.
  // Cap the descent to avoid runaway on malformed data.
  for (let depth = 0; depth < 4; depth += 1) {
    const hasSigner =
      typeof current.algorithm === 'string' && typeof current.value === 'string';
    if (hasSigner) break;
    const next = current.signature;
    if (!next || typeof next !== 'object') break;
    current = next as Record<string, unknown>;
  }
  if (typeof current.algorithm !== 'string' || typeof current.value !== 'string') {
    return undefined;
  }
  // Strip every non-JSF field. Order the output so callers that
  // JSON.stringify the result get a stable shape for diffing.
  const clean: Record<string, unknown> = {};
  for (const key of JSF_SIGNER_FIELDS) {
    if (key in current) {
      clean[key] = current[key];
    }
  }
  return clean as unknown as CdxSignature;
}

export interface AffirmationExportResult {
  /**
   * The affirmation object to emit under `declarations.affirmation`,
   * or `undefined` when the assessment has no affirmation row at all.
   */
  affirmation: CdxAffirmation | undefined;
  /**
   * The sealed envelope that belongs under `declarations.signature`
   * in the CycloneDX output. Present only when the affirmation has
   * been sealed.
   */
  declarationsSeal: CdxSignature | undefined;
  /**
   * The sealed envelope that belongs under the top-level BOM
   * `signature`. Present only when the affirmation has been sealed.
   */
  documentSeal: CdxSignature | undefined;
  /**
   * Diagnostic: number of signatory slots that had a stored envelope
   * and passed the CycloneDX `oneOf` check. Exposed so callers can
   * log a warning when slots were silently dropped.
   */
  signedSlotCount: number;
}

/**
 * Build the affirmation block for a given assessment.
 *
 * Signatory construction:
 *   - Walks every `affirmation_signatory` slot bound to the
 *     affirmation.
 *   - For each slot, builds a signatory block from the identity
 *     row, optional organization row, and optional JSF envelope.
 *   - Drops any signatory block that does not satisfy the
 *     CycloneDX Signatory `oneOf` (signature OR externalReference +
 *     organization).
 *   - Attaches the resulting `signatories[]` only if non-empty.
 *     Otherwise `affirmation.statement` stands alone as a pointer
 *     to the assessment-level export.
 */
export async function buildAffirmationForAssessment(
  db: Kysely<Database>,
  assessmentId: string,
): Promise<AffirmationExportResult> {
  const affirmationRow = await db
    .selectFrom('affirmation')
    .where('assessment_id', '=', assessmentId)
    .selectAll()
    .executeTakeFirst();

  if (!affirmationRow) {
    return {
      affirmation: undefined,
      declarationsSeal: undefined,
      documentSeal: undefined,
      signedSlotCount: 0,
    };
  }

  const slots = await db
    .selectFrom('affirmation_signatory')
    .where('affirmation_id', '=', affirmationRow.id)
    .selectAll()
    .orderBy('created_at', 'asc')
    .execute();

  const signatories: CdxSignatory[] = [];
  let signedSlotCount = 0;
  for (const slot of slots) {
    if (!slot.signatory_id) continue;

    const sigRow = await db
      .selectFrom('signatory')
      .where('id', '=', slot.signatory_id)
      .selectAll()
      .executeTakeFirst();
    if (!sigRow) continue;

    const org = sigRow.organization_id
      ? await db
          .selectFrom('organization')
          .where('id', '=', sigRow.organization_id)
          .selectAll()
          .executeTakeFirst()
      : null;

    // Extract a clean JSF signer from whatever shape the sign path
    // stored. The stored envelope wraps the signer in a canonical
    // payload plus nested `.signature` with extra metadata; the
    // CycloneDX schema will reject those extras via
    // additionalProperties:false.
    const rawEnvelope = slot.signature_json
      ? parseJsonbColumn(slot.signature_json)
      : undefined;
    const envelope = rawEnvelope ? toJsfSigner(rawEnvelope) : undefined;
    if (envelope && slot.signed_at) signedSlotCount += 1;

    const block = signatoryBlock({
      row: {
        name: sigRow.name ?? null,
        role: sigRow.role ?? null,
        external_reference_type: sigRow.external_reference_type ?? null,
        external_reference_url: sigRow.external_reference_url ?? null,
      },
      organization: org
        ? {
            name: org.name ?? null,
            country: org.country ?? null,
            region: org.region ?? null,
            locality: org.locality ?? null,
            post_office_box_number: org.post_office_box_number ?? null,
            postal_code: org.postal_code ?? null,
            street_address: org.street_address ?? null,
            website: org.website ?? null,
          }
        : null,
      envelope: envelope ?? null,
      roleOverride: slot.required_title ?? null,
    });

    if (isSignatoryValid(block)) {
      signatories.push(block);
    }
  }

  const affirmation: CdxAffirmation = { statement: affirmationRow.statement };
  if (signatories.length > 0) {
    affirmation.signatories = signatories;
  }

  // Strip the canonical-payload wrapper off the stored envelopes so
  // declarations.signature and bom.signature emit a bare JSF signer
  // rather than the whole sealed subtree.
  const declarationsSeal = affirmationRow.sealed_at
    ? toJsfSigner(parseJsonbColumn(affirmationRow.declarations_signature_json))
    : undefined;
  const documentSeal = affirmationRow.sealed_at
    ? toJsfSigner(parseJsonbColumn(affirmationRow.document_signature_json))
    : undefined;

  return { affirmation, declarationsSeal, documentSeal, signedSlotCount };
}

/**
 * Build `definitions.standards[]` for an attestation export, scoped
 * to the single standard the attestation is attesting to. The
 * standard is derived from the attestation_requirement rows: every
 * requirement on an attestation references the same standard by
 * construction, so the first row's `requirement.standard_id` is
 * authoritative. Returns an empty array when the attestation has no
 * requirements (e.g. a skeleton attestation).
 *
 * The standard's own bom-ref and every requirement's bom-ref come
 * from the `imported_bom_ref` column populated at standards import
 * time, so an exported attestation round trips the exact identifiers
 * the source feed used.
 */
export async function buildStandardsForAttestation(
  db: Kysely<Database>,
  attestationId: string,
): Promise<CdxStandard[]> {
  const firstReq = await db
    .selectFrom('attestation_requirement')
    .innerJoin('requirement', 'requirement.id', 'attestation_requirement.requirement_id')
    .where('attestation_requirement.attestation_id', '=', attestationId)
    .select(['requirement.standard_id'])
    .executeTakeFirst();
  if (!firstReq?.standard_id) return [];

  const standardRow = await db
    .selectFrom('standard')
    .where('id', '=', firstReq.standard_id as string)
    .selectAll()
    .executeTakeFirst();
  if (!standardRow) return [];

  const requirementRows = await db
    .selectFrom('requirement')
    .where('standard_id', '=', firstReq.standard_id as string)
    .selectAll()
    .execute();

  return [
    standardFromRow({
      row: {
        id: standardRow.id as string,
        identifier: (standardRow.identifier as string | null) ?? null,
        name: (standardRow.name as string | null) ?? null,
        version: (standardRow.version as string | null) ?? null,
        description: (standardRow.description as string | null) ?? null,
        owner: (standardRow.owner as string | null) ?? null,
        // standard-import.ts stores the upstream bom-ref into the
        // `standard.identifier` column. Surface it as the imported
        // bom-ref so the standard round trips with its source value.
        imported_bom_ref: (standardRow.identifier as string | null) ?? null,
      },
      requirements: requirementRows.map((r) => ({
        id: r.id as string,
        identifier: (r.identifier as string | null) ?? null,
        name: (r.name as string | null) ?? null,
        description: (r.description as string | null) ?? null,
        parent_id: (r.parent_id as string | null) ?? null,
        open_cre: (r.open_cre as string | null) ?? null,
        imported_bom_ref: (r.imported_bom_ref as string | null) ?? null,
      })),
    }),
  ];
}
