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
} from '../cdxspec/types.js';
import { signatoryBlock, isSignatoryValid } from '../cdxspec/index.js';

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

    const envelope = slot.signature_json
      ? parseJsonbColumn(slot.signature_json)
      : undefined;
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

  const declarationsSeal = affirmationRow.sealed_at
    ? parseJsonbColumn(affirmationRow.declarations_signature_json)
    : undefined;
  const documentSeal = affirmationRow.sealed_at
    ? parseJsonbColumn(affirmationRow.document_signature_json)
    : undefined;

  return { affirmation, declarationsSeal, documentSeal, signedSlotCount };
}
