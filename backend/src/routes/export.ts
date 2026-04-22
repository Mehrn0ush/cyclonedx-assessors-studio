import { Router } from 'express';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { getDatabase } from '../db/connection.js';
import { asyncHandler } from '../utils/route-helpers.js';
import { logger } from '../utils/logger.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  assessorFromUserRow,
  attestationFromRow,
  claimFromRow,
  composeBom,
  composeDeclarations,
  isCounterClaim,
  refFor,
  signatoryBlock,
  standardFromRow,
  TargetResolver,
  type Affirmation as CdxAffirmation,
  type Assessor as CdxAssessor,
  type Attestation as CdxAttestation,
  type Bom,
  type CdxSpecVersion,
  type Claim as CdxClaim,
  type ClaimRefMap,
  type Evidence as CdxEvidence,
  type Signatory as CdxSignatory,
  type Signature as CdxSignature,
  type Standard as CdxStandard,
} from '../cdxspec/index.js';

const router = Router();

// Supported CycloneDX schema versions. 1.7 (ECMA-424 2nd Edition) is
// the default for new work per the cyclonedx-spec guidance; 1.6
// (ECMA-424 1st Edition) is offered as a fallback for consumers that
// have not yet adopted the 2nd Edition. The `?spec=` query parameter
// on every export route selects between them.
export type CycloneDxSpecVersion = CdxSpecVersion;

/**
 * Resolve the CycloneDX spec version from the query string. Defaults
 * to 1.7. Unknown values fall through to the default rather than
 * throwing so callers cannot trip on a typo in a hand-crafted URL:
 * the returned value is always something the serializer can handle.
 */
function parseSpecVersion(req: AuthRequest): CycloneDxSpecVersion {
  const raw = typeof req.query.spec === 'string' ? req.query.spec.trim() : '';
  if (raw === '1.6') return '1.6';
  return '1.7';
}

/**
 * Parse a JSONB column value into a plain object. PGlite and
 * node-postgres deliver JSONB as either a parsed object or a raw
 * string depending on driver version, so both shapes are tolerated.
 */
function parseJsonbColumn(value: unknown): CdxSignature | undefined {
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

async function buildAssessmentBOM(
  assessmentId: string,
  specVersion: CycloneDxSpecVersion = '1.7'
): Promise<Bom> {
  const db = getDatabase();

  // Fetch assessment
  const assessment = await db
    .selectFrom('assessment')
    .where('id', '=', assessmentId)
    .selectAll()
    .executeTakeFirst();

  if (!assessment) {
    throw new Error('Assessment not found');
  }

  // Fetch assessors
  const assessorRows = await db
    .selectFrom('assessment_assessor')
    .innerJoin('app_user', 'app_user.id', 'assessment_assessor.user_id')
    .where('assessment_assessor.assessment_id', '=', assessmentId)
    .select(['app_user.id', 'app_user.display_name', 'app_user.email'])
    .execute();

  const assessors: CdxAssessor[] = assessorRows.map((a) =>
    assessorFromUserRow({ user: { id: a.id, display_name: a.display_name, email: a.email } })
  );

  // Fetch attestation(s) for this assessment
  const attestations = await db
    .selectFrom('attestation')
    .where('assessment_id', '=', assessmentId)
    .selectAll()
    .execute();

  // The target resolver is shared across every attestation so that
  // claims pointing at the same target resolve to one synthetic
  // organizationalEntity record. Emitted under
  // declarations.targets.organizations by composeDeclarations.
  const targetResolver = new TargetResolver();

  // Claim serialization is centralized: the DB rows are filtered
  // down to the schema-legal keys and the counter-claim flag is
  // translated into the attestation.map[] split by
  // attestationFromRow.
  const claimRowsAll: Record<string, unknown>[] = [];
  const allClaimsOut: CdxClaim[] = [];

  if (attestations.length > 0) {
    const raw = await db
      .selectFrom('claim')
      .where('attestation_id', 'in', attestations.map((a) => a.id))
      .selectAll()
      .execute();
    claimRowsAll.push(...(raw as Record<string, unknown>[]));
  }

  for (const row of claimRowsAll) {
    allClaimsOut.push(
      claimFromRow(
        {
          id: row.id as string,
          bom_ref: (row.bom_ref as string | null | undefined) ?? null,
          target: String(row.target ?? ''),
          target_entity_id: (row.target_entity_id as string | null | undefined) ?? null,
          predicate: (row.predicate as string | null | undefined) ?? null,
          reasoning: (row.reasoning as string | null | undefined) ?? null,
          is_counter_claim: Boolean(row.is_counter_claim),
        },
        targetResolver
      )
    );
  }

  // Build per-attestation map entries. Each attestation references
  // all of its own claims; counter claims are split into the
  // counterClaims array. When the upstream DB does not carry a
  // per-requirement claim join, every claim on the attestation is
  // projected onto every requirement in its map, matching prior
  // behavior.
  const declarationAttestations: CdxAttestation[] = [];

  for (const attestation of attestations) {
    const attestationRequirements = await db
      .selectFrom('attestation_requirement')
      .innerJoin('requirement', 'requirement.id', 'attestation_requirement.requirement_id')
      .where('attestation_requirement.attestation_id', '=', attestation.id)
      .selectAll()
      .execute();

    // Collect claim bom-refs belonging to this attestation. The
    // bom-ref on each claim is either a custom value from the DB
    // column or the default refFor('claim', id).
    const attestationAllClaims: string[] = [];
    const attestationAllCounterClaims: string[] = [];

    for (const row of claimRowsAll) {
      if (row.attestation_id !== attestation.id) continue;
      const ref =
        (row.bom_ref as string | null | undefined) && (row.bom_ref as string).trim().length > 0
          ? (row.bom_ref as string)
          : refFor('claim', row.id as string);
      if (isCounterClaim(row as { is_counter_claim?: boolean })) {
        attestationAllCounterClaims.push(ref);
      } else {
        attestationAllClaims.push(ref);
      }
    }

    const claimRefs: ClaimRefMap = {
      byRequirementId: new Map(),
      allClaims: attestationAllClaims,
      allCounterClaims: attestationAllCounterClaims,
    };

    const assessorRef = assessors.length > 0 ? assessors[0]['bom-ref'] : undefined;

    const attestationObj = attestationFromRow({
      row: { id: attestation.id, summary: attestation.summary ?? null },
      requirements: attestationRequirements.map((ar) => ({
        requirement_id: ar.requirement_id,
        conformance_score: ar.conformance_score,
        conformance_rationale: ar.conformance_rationale ?? null,
        confidence_score: ar.confidence_score ?? null,
        confidence_rationale: ar.confidence_rationale ?? null,
      })),
      claimRefs,
      assessorRef,
    });

    declarationAttestations.push(attestationObj);
  }

  // Fetch evidence linked to the claims and emit one entry per
  // distinct evidence row. The DB column `evidence.name` maps to
  // `propertyName` in the CycloneDX schema; there is no `name` field
  // on the Evidence object.
  let evidenceOut: CdxEvidence[] = [];
  if (claimRowsAll.length > 0) {
    const evidenceRows = await db
      .selectFrom('evidence')
      .where(
        'evidence.id',
        'in',
        db.selectFrom('claim_evidence')
          .select('evidence_id')
          .where(
            'claim_id',
            'in',
            claimRowsAll.map((c) => c.id as string)
          )
      )
      .selectAll()
      .execute();

    evidenceOut = evidenceRows.map((e) => {
      const ev: CdxEvidence = { 'bom-ref': refFor('evidence', String(e.id)) };
      if (e.name) ev.propertyName = String(e.name);
      if (e.description) ev.description = String(e.description);
      return ev;
    });
  }

  // Fetch project and its standards for definitions.standards.
  const project = assessment.project_id
    ? await db
        .selectFrom('project')
        .where('id', '=', assessment.project_id)
        .selectAll()
        .executeTakeFirst()
    : null;

  const standards: CdxStandard[] = [];

  if (project) {
    const projectStandards = await db
      .selectFrom('project_standard')
      .innerJoin('standard', 'standard.id', 'project_standard.standard_id')
      .where('project_standard.project_id', '=', project.id)
      .selectAll()
      .execute();

    for (const ps of projectStandards) {
      const requirements = await db
        .selectFrom('requirement')
        .where('standard_id', '=', ps.standard_id)
        .selectAll()
        .execute();

      standards.push(
        standardFromRow({
          row: {
            id: ps.standard_id,
            identifier: ps.identifier ?? null,
            name: ps.name ?? null,
            version: ps.version ?? null,
            description: ps.description ?? null,
            owner: ps.owner ?? null,
          },
          requirements: requirements.map((r) => ({
            id: r.id as string,
            identifier: (r.identifier as string | null | undefined) ?? null,
            name: (r.name as string | null | undefined) ?? null,
            description: (r.description as string | null | undefined) ?? null,
            parent_id: (r.parent_id as string | null | undefined) ?? null,
            open_cre: (r.open_cre as string | null | undefined) ?? null,
          })),
        })
      );
    }
  }

  // Fetch the assessment level affirmation. The PR3 cascade signing
  // model binds one affirmation per assessment via the
  // `assessment_id` column. Legacy rows keyed only by project_id are
  // ignored here; the assessment scoped row is authoritative.
  const affirmationRow = await db
    .selectFrom('affirmation')
    .where('assessment_id', '=', assessmentId)
    .selectAll()
    .executeTakeFirst();

  // Build affirmation signatories from the affirmation_signatory
  // slot table. Each signed slot carries its own JSF envelope in
  // signature_json plus a pointer to the signatory identity row, so
  // the CycloneDX signatory object is assembled from the identity
  // row and the embedded envelope. Slots that were declared but
  // never signed are skipped: the export represents signatures that
  // actually exist, not empty placeholders.
  const affirmationSignatories: CdxSignatory[] = [];
  let signedSlotCount = 0;
  if (affirmationRow) {
    const slots = await db
      .selectFrom('affirmation_signatory')
      .where('affirmation_id', '=', affirmationRow.id)
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();

    for (const slot of slots) {
      if (!slot.signed_at || !slot.signatory_id || !slot.signature_json) continue;
      signedSlotCount += 1;

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

      const envelope = parseJsonbColumn(slot.signature_json);

      affirmationSignatories.push(
        signatoryBlock({
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
        })
      );
    }
  }

  // PR3.6: per-attestation signature material was removed. An
  // assessment that has no affirmation row simply exports without a
  // declarations.affirmation block. Consumers can still see the
  // attestation map and claims; the signature layer is optional.

  // Parse sealed envelopes when the affirmation is sealed. These
  // flow into declarations.signature and the top level bom.signature.
  const declarationsSealEnvelope = affirmationRow?.sealed_at
    ? parseJsonbColumn(affirmationRow.declarations_signature_json)
    : undefined;
  const documentSealEnvelope = affirmationRow?.sealed_at
    ? parseJsonbColumn(affirmationRow.document_signature_json)
    : undefined;

  let affirmation: CdxAffirmation | undefined;
  if (affirmationRow) {
    affirmation = { statement: affirmationRow.statement };
    if (affirmationSignatories.length > 0) {
      affirmation.signatories = affirmationSignatories;
    }
  }
  // signedSlotCount is retained for future metrics / debug; currently
  // unused but makes the logic audit easier when tracing a missing
  // signatory.
  void signedSlotCount;

  const declarations = composeDeclarations({
    assessors,
    attestations: declarationAttestations,
    claims: allClaimsOut,
    evidence: evidenceOut,
    affirmation,
    seal: declarationsSealEnvelope,
    targetResolver,
  });

  return composeBom({
    specVersion,
    declarations,
    definitions: standards.length > 0 ? { standards } : undefined,
    documentSeal: documentSealEnvelope,
  });
}

// ---- Helper functions for PDF generation ----

type ExportDb = ReturnType<typeof getDatabase>;

async function fetchExportAssessors(db: ExportDb, assessmentId: string) {
  return db
    .selectFrom('assessment_assessor')
    .innerJoin('app_user', 'app_user.id', 'assessment_assessor.user_id')
    .where('assessment_assessor.assessment_id', '=', assessmentId)
    .select(['app_user.display_name', 'app_user.email'])
    .execute();
}

async function fetchExportAssessees(db: ExportDb, assessmentId: string) {
  return db
    .selectFrom('assessment_assessee')
    .innerJoin('app_user', 'app_user.id', 'assessment_assessee.user_id')
    .where('assessment_assessee.assessment_id', '=', assessmentId)
    .select(['app_user.display_name', 'app_user.email'])
    .execute();
}

async function fetchExportAssessmentRequirements(db: ExportDb, assessmentId: string) {
  return db
    .selectFrom('assessment_requirement')
    .innerJoin('requirement', 'requirement.id', 'assessment_requirement.requirement_id')
    .where('assessment_requirement.assessment_id', '=', assessmentId)
    .select([
      'assessment_requirement.id',
      'assessment_requirement.result',
      'assessment_requirement.rationale',
      'requirement.identifier',
      'requirement.name',
    ])
    .execute();
}

async function fetchExportEvidenceRecords(
  db: ExportDb,
  assessmentId: string,
  hasRequirements: boolean,
): Promise<Record<string, unknown>[]> {
  if (!hasRequirements) return [];
  return db
    .selectFrom('evidence')
    .innerJoin('assessment_requirement_evidence', 'assessment_requirement_evidence.evidence_id', 'evidence.id')
    .innerJoin('assessment_requirement', 'assessment_requirement.id', 'assessment_requirement_evidence.assessment_requirement_id')
    .innerJoin('app_user', 'app_user.id', 'evidence.author_id')
    .where('assessment_requirement.assessment_id', '=', assessmentId)
    .select([
      'evidence.name',
      'evidence.state',
      'evidence.description',
      'app_user.display_name',
    ])
    .execute();
}

async function fetchExportAttestationData(db: ExportDb, assessmentId: string) {
  const attestation = await db
    .selectFrom('attestation')
    .where('assessment_id', '=', assessmentId)
    .selectAll()
    .executeTakeFirst();

  let attestationRequirements: Record<string, unknown>[] = [];
  if (attestation) {
    attestationRequirements = await db
      .selectFrom('attestation_requirement')
      .innerJoin('requirement', 'requirement.id', 'attestation_requirement.requirement_id')
      .where('attestation_requirement.attestation_id', '=', attestation.id)
      .select([
        'attestation_requirement.conformance_score',
        'attestation_requirement.confidence_score',
        'attestation_requirement.conformance_rationale',
        'requirement.identifier',
        'requirement.name',
      ])
      .execute();
  }

  return { attestation, attestationRequirements };
}

/**
 * Fetch all necessary data for PDF generation.
 */
async function fetchPDFData(assessmentId: string) {
  const db = getDatabase();

  const assessment = await db
    .selectFrom('assessment')
    .where('id', '=', assessmentId)
    .selectAll()
    .executeTakeFirst();

  if (!assessment) {
    throw new Error('Assessment not found');
  }

  const project = assessment.project_id
    ? await db
        .selectFrom('project')
        .where('id', '=', assessment.project_id)
        .selectAll()
        .executeTakeFirst()
    : null;

  const assessors = await fetchExportAssessors(db, assessmentId);
  const assessees = await fetchExportAssessees(db, assessmentId);
  const assessmentRequirements = await fetchExportAssessmentRequirements(db, assessmentId);
  const evidenceRecords = await fetchExportEvidenceRecords(
    db,
    assessmentId,
    assessmentRequirements.length > 0,
  );
  const { attestation, attestationRequirements } = await fetchExportAttestationData(db, assessmentId);

  return {
    assessment,
    project,
    assessors,
    assessees,
    assessmentRequirements,
    evidenceRecords,
    attestation,
    attestationRequirements,
  };
}

/**
 * Add title page to PDF.
 */
function addTitlePage(
  doc: InstanceType<typeof PDFDocument>,
  assessment: Record<string, unknown>,
  project: Record<string, unknown> | null | undefined,
): void {
  doc.fontSize(36).fillColor('#000000').text('Assessment Report', { align: 'center' });
  doc.fontSize(24).text(assessment.title as string, { align: 'center' });
  doc.moveDown();

  doc.fontSize(12);
  if (project) {
    doc.text(`Project: ${project.name}`);
  }
  const now = new Date();
  doc.text(`Date Generated: ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  doc.moveDown();
}

/**
 * Add assessment summary section to PDF.
 */
function addAssessmentSummarySection(
  doc: InstanceType<typeof PDFDocument>,
  assessment: Record<string, unknown>,
  assessors: Record<string, unknown>[],
  assessees: Record<string, unknown>[],
): void {
  doc.fontSize(16).fillColor('#000000').text('Assessment Summary', { underline: true });
  doc.fontSize(11).moveDown(0.5);

  if (assessment.description) {
    doc.text(`Description: ${assessment.description}`);
    doc.moveDown();
  }

  doc.text(`State: ${assessment.state}`);
  doc.text(`Start Date: ${assessment.start_date ? new Date(assessment.start_date as string).toLocaleDateString('en-US') : 'N/A'}`);
  doc.text(`Due Date: ${assessment.due_date ? new Date(assessment.due_date as string).toLocaleDateString('en-US') : 'N/A'}`);
  doc.text(`End Date: ${assessment.end_date ? new Date(assessment.end_date as string).toLocaleDateString('en-US') : 'N/A'}`);

  if (assessors.length > 0) {
    doc.text(`Assessors: ${assessors.map(a => a.display_name).join(', ')}`);
  }
  if (assessees.length > 0) {
    doc.text(`Assessees: ${assessees.map(a => a.display_name).join(', ')}`);
  }

  doc.moveDown();
}

/**
 * Add requirements section table to PDF.
 */
function addRequirementsSection(
  doc: InstanceType<typeof PDFDocument>,
  assessmentRequirements: Record<string, unknown>[],
  footerY: number,
  addFooter: () => void,
): void {
  doc.fontSize(16).fillColor('#000000').text('Requirements', { underline: true });
  doc.fontSize(10).moveDown(0.5);

  const tableStartY = doc.y;
  const colWidths = {
    id: 60,
    name: 130,
    result: 70,
    rationale: 180,
  };

  // Table header
  doc.fillColor('#f5f5f5').rect(50, doc.y, doc.page.width - 100, 25).fill();
  doc.fillColor('#000000').fontSize(10);

  let tableX = 50;
  doc.text('ID', tableX, doc.y + 5, { width: colWidths.id, align: 'left' });
  tableX += colWidths.id;
  doc.text('Name', tableX, tableStartY + 5, { width: colWidths.name, align: 'left' });
  tableX += colWidths.name;
  doc.text('Result', tableX, tableStartY + 5, { width: colWidths.result, align: 'left' });
  tableX += colWidths.result;
  doc.text('Rationale', tableX, tableStartY + 5, { width: colWidths.rationale, align: 'left' });

  doc.y = tableStartY + 25;

  // Table rows
  for (const req of assessmentRequirements) {
    const result = req.result ? (req.result as string).toUpperCase() : 'N/A';
    const rationale = req.rationale || 'N/A';

    const rowHeight = 20;
    if (doc.y + rowHeight > footerY) {
      addFooter();
      doc.addPage();
    }

    tableX = 50;
    doc.fontSize(9);
    doc.text(String(req.identifier || ''), tableX, doc.y, { width: colWidths.id, align: 'left' });
    tableX += colWidths.id;
    doc.text(String(req.name || ''), tableX, doc.y, { width: colWidths.name, align: 'left' });
    tableX += colWidths.name;
    doc.text(result, tableX, doc.y, { width: colWidths.result, align: 'left' });
    tableX += colWidths.result;
    doc.text(rationale as string, tableX, doc.y, { width: colWidths.rationale, align: 'left' });

    doc.moveDown();
  }

  doc.moveDown();
}

/**
 * Add evidence summary section to PDF.
 */
function addEvidenceSection(
  doc: InstanceType<typeof PDFDocument>,
  evidenceRecords: Record<string, unknown>[],
  footerY: number,
  addFooter: () => void,
): void {
  doc.addPage();

  doc.fontSize(16).fillColor('#000000').text('Evidence Summary', { underline: true });
  doc.fontSize(11).moveDown(0.5);

  for (const ev of evidenceRecords) {
    if (doc.y + 40 > footerY) {
      addFooter();
      doc.addPage();
    }

    doc.fontSize(10).text(`Name: ${ev.name}`);
    doc.fontSize(9).fillColor('#666666');
    doc.text(`State: ${ev.state}`);
    doc.text(`Author: ${ev.display_name || 'Unknown'}`);
    if (ev.description) {
      doc.text(`Description: ${ev.description}`);
    }
    doc.moveDown();
  }

  addFooter();
}

/**
 * Add attestation summary section to PDF.
 */
function addAttestationSection(
  doc: InstanceType<typeof PDFDocument>,
  attestation: Record<string, unknown>,
  attestationRequirements: Record<string, unknown>[],
  footerY: number,
  addFooter: () => void,
): void {
  doc.addPage();

  doc.fontSize(16).fillColor('#000000').text('Attestation Summary', { underline: true });
  doc.fontSize(11).moveDown(0.5);

  if (typeof attestation.summary === 'string' && attestation.summary.length > 0) {
    doc.text(`Summary: ${attestation.summary}`);
    doc.moveDown();
  }

  doc.text('Conformance Scores by Requirement:');
  doc.moveDown(0.5);

  for (const ar of attestationRequirements) {
    if (doc.y + 20 > footerY) {
      addFooter();
      doc.addPage();
    }

    const conformancePercent = ar.conformance_score ? ((ar.conformance_score as number) * 100).toFixed(0) : 'N/A';
    const confidencePercent = ar.confidence_score ? ((ar.confidence_score as number) * 100).toFixed(0) : 'N/A';

    doc.fontSize(9);
    doc.text(`${ar.identifier}: ${conformancePercent}% conformance, ${confidencePercent}% confidence`);
    if (ar.conformance_rationale) {
      doc.fontSize(8).fillColor('#666666');
      doc.text(`Rationale: ${ar.conformance_rationale}`);
      doc.fillColor('#000000');
    }
    doc.moveDown(0.5);
  }

  addFooter();
}

async function generateAssessmentPDF(assessmentId: string): Promise<Buffer> {
  // Fetch all data needed for PDF
  const {
    assessment,
    project,
    assessors,
    assessees,
    assessmentRequirements,
    evidenceRecords,
    attestation,
    attestationRequirements,
  } = await fetchPDFData(assessmentId);

  // Create PDF document
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
  });

  const pageHeight = doc.page.height;
  const pageBottomMargin = 50;
  const footerY = pageHeight - pageBottomMargin;
  const now = new Date();
  const timestamp = now.toISOString();

  // Add footer on every page
  const addFooter = () => {
    doc.fontSize(9).fillColor('#666666');
    doc.text('Generated by CycloneDX Assessors Studio', 50, footerY);
    doc.text(timestamp, 50, footerY + 15);
  };

  // Build document sections
  addTitlePage(doc, assessment, project);
  addFooter();
  doc.addPage();

  addAssessmentSummarySection(doc, assessment, assessors, assessees);
  addFooter();
  doc.addPage();

  addRequirementsSection(doc, assessmentRequirements, footerY, addFooter);
  addFooter();

  if (evidenceRecords.length > 0) {
    addEvidenceSection(doc, evidenceRecords, footerY, addFooter);
  }

  if (attestation && attestationRequirements.length > 0) {
    addAttestationSection(doc, attestation, attestationRequirements, footerY, addFooter);
  }

  // Convert PDF to buffer
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => {
      chunks.push(chunk);
    });

    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on('error', reject);

    doc.end();
  });
}

router.get('/assessment/:assessmentId', requireAuth, requirePermission('export.cyclonedx'), asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { assessmentId } = req.params as { assessmentId: string };
  const specVersion = parseSpecVersion(req);
  const db = getDatabase();

  // Verify assessment exists
  const assessment = await db
    .selectFrom('assessment')
    .where('id', '=', assessmentId)
    .selectAll()
    .executeTakeFirst();

  if (!assessment) {
    res.status(404).json({ error: 'Assessment not found' });
    return;
  }

  // Build BOM
  const bom = await buildAssessmentBOM(assessmentId, specVersion);

  // Set response headers
  res.setHeader('Content-Type', 'application/vnd.cyclonedx+json');
  res.setHeader('Content-Disposition', `attachment; filename="assessment-${assessmentId}-cdx-${specVersion}.json"`);

  res.json(bom);

  logger.info('Assessment exported', {
    assessmentId,
    specVersion,
    requestId: req.requestId,
  });
}));

router.get('/assessment/:assessmentId/pdf', requireAuth, requirePermission('export.pdf'), asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { assessmentId } = req.params as { assessmentId: string };
  const db = getDatabase();

  // Verify assessment exists
  const assessment = await db
    .selectFrom('assessment')
    .where('id', '=', assessmentId)
    .selectAll()
    .executeTakeFirst();

  if (!assessment) {
    res.status(404).json({ error: 'Assessment not found' });
    return;
  }

  // Generate PDF
  const pdfBuffer = await generateAssessmentPDF(assessmentId);

  // Set response headers (sanitize title to prevent header injection)
  const safeSlug = assessment.title.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 200);
  const filename = `assessment-${safeSlug}-report.pdf`;
  const encodedFilename = encodeURIComponent(filename);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`
  );
  res.setHeader('Content-Length', pdfBuffer.length);

  res.send(pdfBuffer);

  logger.info('Assessment PDF exported', {
    assessmentId,
    requestId: req.requestId,
  });
}));

router.get('/project/:projectId', requireAuth, requirePermission('export.cyclonedx'), asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  const specVersion = parseSpecVersion(req);
  const db = getDatabase();

  // Verify project exists
  const project = await db
    .selectFrom('project')
    .where('id', '=', projectId)
    .selectAll()
    .executeTakeFirst();

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // Fetch all assessments for this project
  const assessments = await db
    .selectFrom('assessment')
    .where('project_id', '=', projectId)
    .selectAll()
    .execute();

  // Build BOMs for all assessments
  const boms = await Promise.all(assessments.map((a) => buildAssessmentBOM(a.id, specVersion)));

  // Merge all assessment BOMs into a single project-scoped BOM. The
  // merge preserves per-attestation map entries verbatim while
  // deduping the shared declaration arrays (assessors, claims,
  // evidence, standards). Keys are the bom-ref values to guarantee
  // cross-reference integrity.
  const mergedAssessors = new Map<string, CdxAssessor>();
  const mergedAttestations: CdxAttestation[] = [];
  const mergedClaims = new Map<string, CdxClaim>();
  const mergedEvidence = new Map<string, CdxEvidence>();
  const mergedStandards = new Map<string, CdxStandard>();
  let mergedAffirmation: CdxAffirmation | undefined;

  for (const bom of boms) {
    const decls = bom.declarations;
    const defs = bom.definitions;
    if (decls) {
      for (const assessor of decls.assessors ?? []) {
        mergedAssessors.set(assessor['bom-ref'], assessor);
      }
      if (decls.attestations) mergedAttestations.push(...decls.attestations);
      for (const claim of decls.claims ?? []) {
        mergedClaims.set(claim['bom-ref'], claim);
      }
      for (const evidence of decls.evidence ?? []) {
        mergedEvidence.set(evidence['bom-ref'], evidence);
      }
      // A project BOM is the union of multiple assessment BOMs;
      // each assessment may have its own sealed affirmation, but
      // the declarations block can only carry one affirmation. Keep
      // the first one encountered.
      if (decls.affirmation && !mergedAffirmation) {
        mergedAffirmation = decls.affirmation;
      }
    }
    if (defs?.standards) {
      for (const standard of defs.standards) {
        mergedStandards.set(standard['bom-ref'], standard);
      }
    }
  }

  // Propagate declarations and document seals only when exactly one
  // sealed assessment contributed to this project BOM. A merged
  // multi-assessment BOM has a different canonical form than any
  // single assessment BOM, so seals from more than one source would
  // not verify against the merged document and are therefore
  // dropped.
  let mergedSeal: CdxSignature | undefined;
  let mergedDocumentSeal: CdxSignature | undefined;
  const sealedBoms = boms.filter((b) => Boolean(b.declarations?.signature));
  if (sealedBoms.length === 1) {
    const sealed = sealedBoms[0];
    mergedSeal = sealed.declarations?.signature;
    mergedDocumentSeal = sealed.signature;
  }

  const projectDeclarations = composeDeclarations({
    assessors: Array.from(mergedAssessors.values()),
    attestations: mergedAttestations,
    claims: Array.from(mergedClaims.values()),
    evidence: Array.from(mergedEvidence.values()),
    affirmation: mergedAffirmation,
    seal: mergedSeal,
  });

  const projectBOM = composeBom({
    specVersion,
    declarations: projectDeclarations,
    definitions:
      mergedStandards.size > 0
        ? { standards: Array.from(mergedStandards.values()) }
        : undefined,
    documentSeal: mergedDocumentSeal,
  });

  // Set response headers
  res.setHeader('Content-Type', 'application/vnd.cyclonedx+json');
  res.setHeader('Content-Disposition', `attachment; filename="project-${projectId}-cdx-${specVersion}.json"`);

  res.json(projectBOM);

  logger.info('Project exported', {
    projectId,
    specVersion,
    assessmentCount: assessments.length,
    requestId: req.requestId,
  });
}));

export default router;
