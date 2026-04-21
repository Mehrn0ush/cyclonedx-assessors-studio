import { Router } from 'express';
import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import { getDatabase } from '../db/connection.js';
import { asyncHandler } from '../utils/route-helpers.js';
import { logger } from '../utils/logger.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

const router = Router();

// Supported CycloneDX schema versions. 1.7 (ECMA-424 2nd Edition) is
// the default for new work per the cyclonedx-spec guidance; 1.6
// (ECMA-424 1st Edition) is offered as a fallback for consumers that
// have not yet adopted the 2nd Edition. The `?spec=` query parameter
// on every export route selects between them.
export type CycloneDxSpecVersion = '1.6' | '1.7';

/**
 * Resolve the CycloneDX spec version from the query string. Defaults
 * to 1.7. Unknown values fall through to the default rather than
 * throwing so callers cannot trip on a typo in a hand-crafted URL —
 * the returned value is always something the serializer can handle.
 */
function parseSpecVersion(req: AuthRequest): CycloneDxSpecVersion {
  const raw = typeof req.query.spec === 'string' ? req.query.spec.trim() : '';
  if (raw === '1.6') return '1.6';
  return '1.7';
}

function schemaUrlFor(version: CycloneDxSpecVersion): string {
  return version === '1.6'
    ? 'http://cyclonedx.org/schema/bom-1.6.schema.json'
    : 'http://cyclonedx.org/schema/bom-1.7.schema.json';
}

interface CycloneDXAssessor {
  'bom-ref': string;
  name: string;
  email?: string;
}

interface CycloneDXConformance {
  score: number;
  rationale: string;
}

interface CycloneDXConfidence {
  score?: number;
  rationale?: string;
}

interface CycloneDXRequirementMap {
  requirement: string;
  claims: string[];
  counterClaims: string[];
  conformance: CycloneDXConformance;
  confidence: CycloneDXConfidence;
}

interface CycloneDXAttestation {
  summary?: string;
  assessor: string;
  map: CycloneDXRequirementMap[];
}

interface CycloneDXClaim {
  'bom-ref': string;
  name: string;
  target: string;
  predicate: string;
  reasoning?: string;
}

interface CycloneDXEvidence {
  'bom-ref': string;
  name: string;
  description?: string;
}

interface CycloneDXStandard {
  identifier: string;
  name: string;
  version?: string;
  requirements: {
    'bom-ref': string;
    identifier: string;
    name: string;
    description?: string;
  }[];
}

interface CycloneDXSignatory {
  name: string;
  role?: string;
  organization?: Record<string, unknown>;
  externalReference?: {
    type: string;
    url: string;
  };
  signature?: Record<string, unknown>;
}

interface CycloneDXAffirmation {
  statement: string;
  signatories?: CycloneDXSignatory[];
  // Declarations level JSF envelope produced by the platform seal.
  // CycloneDX specifies this as `declarations.signature` adjacent to
  // the affirmation block; our internal model hangs it off the
  // affirmation object because it is an artefact of the affirmation
  // ceremony, and the serializer hoists it to the correct position.
  signature?: Record<string, unknown>;
}

interface CycloneDXBOM {
  $schema: string;
  bomFormat: string;
  specVersion: string;
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: {
      components: {
        type: string;
        name: string;
        version?: string;
      }[];
    };
  };
  declarations: {
    assessors: CycloneDXAssessor[];
    attestations: CycloneDXAttestation[];
    claims: CycloneDXClaim[];
    evidence: CycloneDXEvidence[];
    targets: {
      organizations: Record<string, unknown>[];
    };
    affirmation?: CycloneDXAffirmation;
    // JSF envelope sealing the entire declarations subtree. Populated
    // only when the assessment's affirmation has been sealed.
    signature?: Record<string, unknown>;
  };
  definitions: {
    standards: CycloneDXStandard[];
  };
  // Top level document JSF envelope produced by the same seal
  // ceremony. Populated only when the assessment's affirmation has
  // been sealed.
  signature?: Record<string, unknown>;
}

// PR3.6: buildSignatoryObject was removed. The per-attestation
// signature columns it read from (signature_type, signature_value,
// public_key_pem, certificate_chain, signature_algorithm) no longer
// exist. Affirmation signatories are built inline from the
// affirmation_signatory slot rows and carry their per-signatory JSF
// envelope in signature_json. See the affirmationSignatories block
// below.

async function buildAssessmentBOM(
  assessmentId: string,
  specVersion: CycloneDxSpecVersion = '1.7'
): Promise<CycloneDXBOM> {
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
  const assessors = await db
    .selectFrom('assessment_assessor')
    .innerJoin('app_user', 'app_user.id', 'assessment_assessor.user_id')
    .where('assessment_assessor.assessment_id', '=', assessmentId)
    .select(['app_user.id', 'app_user.display_name', 'app_user.email'])
    .execute();

  const assessorsMap: CycloneDXAssessor[] = assessors.map((a: Record<string, unknown>) => ({
    'bom-ref': `assessor-${a.id as string}`,
    name: a.display_name as string,
    email: a.email as string,
  }));

  // Fetch attestation(s) for this assessment
  const attestations = await db
    .selectFrom('attestation')
    .where('assessment_id', '=', assessmentId)
    .selectAll()
    .execute();

  // Build declarations attestations array
  const declarationAttestations: CycloneDXAttestation[] = [];

  for (const attestation of attestations) {
    // Get requirements for this attestation
    const attestationRequirements = await db
      .selectFrom('attestation_requirement')
      .innerJoin('requirement', 'requirement.id', 'attestation_requirement.requirement_id')
      .where('attestation_requirement.attestation_id', '=', attestation.id)
      .selectAll()
      .execute();

    const map: CycloneDXRequirementMap[] = [];

    for (const ar of attestationRequirements) {
      // Get claims linked to this requirement in this attestation
      const claims = await db
        .selectFrom('claim')
        .where('attestation_id', '=', attestation.id)
        .selectAll()
        .execute();

      const requirementClaims = claims
        .filter(c => !c.is_counter_claim)
        .map(c => `claim-${c.id}`);

      const counterClaims = claims
        .filter(c => c.is_counter_claim)
        .map(c => `claim-${c.id}`);

      map.push({
        requirement: `requirement-${ar.requirement_id}`,
        claims: requirementClaims,
        counterClaims: counterClaims,
        conformance: {
          score: ar.conformance_score,
          rationale: ar.conformance_rationale,
        },
        confidence: {
          score: ar.confidence_score ?? undefined,
          rationale: ar.confidence_rationale ?? undefined,
        },
      });
    }

    const firstAssessor = assessorsMap.length > 0 ? assessorsMap[0]['bom-ref'] : 'assessor-unknown';

    declarationAttestations.push({
      summary: attestation.summary ?? undefined,
      assessor: firstAssessor,
      map,
    });
  }

  // Fetch all claims for this assessment
  let claims: Record<string, unknown>[] = [];
  if (attestations.length > 0) {
    claims = await db
      .selectFrom('claim')
      .where('attestation_id', 'in', attestations.map(a => a.id))
      .selectAll()
      .execute();
  }

  const claimsDeclaration: CycloneDXClaim[] = claims.map((c: Record<string, unknown>) => ({
    'bom-ref': `claim-${c.id as string}`,
    name: c.name as string,
    target: c.target as string,
    predicate: c.predicate as string,
    reasoning: c.reasoning as string | undefined,
  }));

  // Fetch evidence linked to assessment
  let evidenceRecords: Record<string, unknown>[] = [];
  if (claims.length > 0) {
    evidenceRecords = await db
      .selectFrom('evidence')
      .where('evidence.id', 'in',
        db.selectFrom('claim_evidence')
          .select('evidence_id')
          .where('claim_id', 'in', claims.map(c => c.id as string))
      )
      .selectAll()
      .execute();
  }

  const evidenceDeclaration: CycloneDXEvidence[] = evidenceRecords.map((e: Record<string, unknown>) => ({
    'bom-ref': `evidence-${String(e.id)}`,
    name: String(e.name),
    description: e.description ? String(e.description) : undefined,
  }));

  // Fetch project and its standards
  const project = assessment.project_id
    ? await db
        .selectFrom('project')
        .where('id', '=', assessment.project_id)
        .selectAll()
        .executeTakeFirst()
    : null;

  const standards: CycloneDXStandard[] = [];

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

      standards.push({
        identifier: ps.identifier,
        name: ps.name,
        version: ps.version ?? undefined,
        requirements: requirements.map((r: Record<string, unknown>) => ({
          'bom-ref': `requirement-${r.id as string}`,
          identifier: r.identifier as string,
          name: r.name as string,
          description: r.description as string | undefined,
        })),
      });
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
  // the CycloneDX signatory object is assembled from the identity row
  // and the embedded envelope. Slots that were declared but never
  // signed are skipped: the export represents signatures that
  // actually exist, not empty placeholders.
  const affirmationSignatories: CycloneDXSignatory[] = [];
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

      // The slot's signature_json is stored as a JSONB column. In
      // PGlite / node-postgres it may arrive as either a parsed
      // object or a raw string depending on the driver, so we
      // tolerate both shapes.
      const envelopeRaw = slot.signature_json as unknown;
      let envelope: Record<string, unknown> | undefined;
      if (typeof envelopeRaw === 'string') {
        try {
          envelope = JSON.parse(envelopeRaw) as Record<string, unknown>;
        } catch {
          envelope = undefined;
        }
      } else if (envelopeRaw && typeof envelopeRaw === 'object') {
        envelope = envelopeRaw as Record<string, unknown>;
      }

      const signatoryObj: CycloneDXSignatory = {
        name: String(sigRow.name ?? ''),
      };
      const role = (slot.required_title ?? sigRow.role) as string | null | undefined;
      if (role) signatoryObj.role = role;

      if (org) {
        const address: Record<string, unknown> = {};
        if (org.country) address.country = org.country;
        if (org.region) address.region = org.region;
        if (org.locality) address.locality = org.locality;
        if (org.post_office_box_number) address.postOfficeBoxNumber = org.post_office_box_number;
        if (org.postal_code) address.postalCode = org.postal_code;
        if (org.street_address) address.streetAddress = org.street_address;

        const orgShape: Record<string, unknown> = { name: org.name };
        if (Object.keys(address).length > 0) orgShape.address = address;
        if (org.website) orgShape.url = [org.website];
        signatoryObj.organization = orgShape;
      }

      const extRefType = sigRow.external_reference_type as string | null | undefined;
      const extRefUrl = sigRow.external_reference_url as string | null | undefined;
      if (extRefType && extRefUrl) {
        signatoryObj.externalReference = { type: extRefType, url: extRefUrl };
      }

      if (envelope) signatoryObj.signature = envelope;
      affirmationSignatories.push(signatoryObj);
    }
  }

  // PR3.6: per-attestation signature material was removed. An
  // assessment that has no affirmation row simply exports without a
  // declarations.affirmation block. Consumers can still see the
  // attestation map and claims; the signature layer is optional.

  // Parse sealed envelopes if the affirmation is sealed. These flow
  // into declarations.signature and the top level bom.signature.
  function parseJsonbColumn(value: unknown): Record<string, unknown> | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    }
    if (typeof value === 'object') return value as Record<string, unknown>;
    return undefined;
  }

  const declarationsSealEnvelope = affirmationRow?.sealed_at
    ? parseJsonbColumn(affirmationRow.declarations_signature_json)
    : undefined;
  const documentSealEnvelope = affirmationRow?.sealed_at
    ? parseJsonbColumn(affirmationRow.document_signature_json)
    : undefined;

  let affirmation: CycloneDXAffirmation | undefined;
  if (affirmationRow) {
    affirmation = {
      statement: affirmationRow.statement,
      ...(affirmationSignatories.length > 0 && { signatories: affirmationSignatories }),
      ...(declarationsSealEnvelope && { signature: declarationsSealEnvelope }),
    };
  }
  // signedSlotCount is retained for future metrics / debug; currently
  // unused but makes the logic audit easier when tracing a missing
  // signatory.
  void signedSlotCount;

  const bom: CycloneDXBOM = {
    $schema: schemaUrlFor(specVersion),
    bomFormat: 'CycloneDX',
    specVersion,
    serialNumber: `urn:uuid:${uuidv4()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: {
        components: [
          {
            type: 'application',
            name: 'CycloneDX Assessors Studio',
          },
        ],
      },
    },
    declarations: {
      assessors: assessorsMap,
      attestations: declarationAttestations,
      claims: claimsDeclaration,
      evidence: evidenceDeclaration,
      targets: {
        organizations: [],
      },
      // The CycloneDX schema places `affirmation` and `signature`
      // as siblings inside declarations. The internal affirmation
      // object carries the declarations-level seal as `signature`
      // for cohesion, but before handing the structure to the
      // schema it is hoisted to the declarations level. The hoist
      // happens below, after the BOM is built, by stripping the
      // duplicate from the affirmation object.
      ...(affirmation && { affirmation }),
      ...(declarationsSealEnvelope && { signature: declarationsSealEnvelope }),
    },
    definitions: {
      standards,
    },
    ...(documentSealEnvelope && { signature: documentSealEnvelope }),
  };

  // Remove the internal duplicate of the declarations seal from the
  // affirmation object so the exported JSON matches the schema.
  if (bom.declarations.affirmation && bom.declarations.affirmation.signature) {
    const { signature: _internal, ...rest } = bom.declarations.affirmation;
    bom.declarations.affirmation = rest;
    void _internal;
  }

  return bom;
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
  const boms = await Promise.all(assessments.map(a => buildAssessmentBOM(a.id, specVersion)));

  // Create a wrapper BOM containing all assessment BOMs
  // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is complex and dynamic
  const projectBOM: Record<string, unknown> = {
    $schema: schemaUrlFor(specVersion),
    bomFormat: 'CycloneDX',
    specVersion,
    serialNumber: `urn:uuid:${uuidv4()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: {
        components: [
          {
            type: 'application',
            name: 'CycloneDX Assessors Studio',
          },
        ],
      },
    },
    declarations: {
      assessors: [],
      attestations: [],
      claims: [],
      evidence: [],
      targets: {
        organizations: [],
      },
    },
    definitions: {
      standards: [],
    },
  };

  // Merge all assessment BOMs
  const mergedAssessors = new Map<string, CycloneDXAssessor>();
  const mergedClaims = new Map<string, CycloneDXClaim>();
  const mergedEvidence = new Map<string, CycloneDXEvidence>();
  const mergedStandards = new Map<string, CycloneDXStandard>();

  for (const bom of boms) {
    // biome-ignore lint/suspicious/noExplicitAny: Merging dynamic BOM structures from multiple assessments
    const bomData = bom as any;
    // Merge assessors
    for (const assessor of bomData.declarations.assessors) {
      mergedAssessors.set(assessor['bom-ref'], assessor);
    }

    // Merge attestations
    // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
    (projectBOM.declarations as any).attestations.push(...bomData.declarations.attestations);

    // Merge claims
    for (const claim of bomData.declarations.claims) {
      mergedClaims.set(claim['bom-ref'], claim);
    }

    // Merge evidence
    for (const evidence of bomData.declarations.evidence) {
      mergedEvidence.set(evidence['bom-ref'], evidence);
    }

    // Merge standards
    for (const standard of bomData.definitions.standards) {
      mergedStandards.set(standard.identifier, standard);
    }

    // Merge affirmation if present. A project BOM is the union of
    // multiple assessment BOMs; each assessment may have its own
    // sealed affirmation, but the declarations block can only carry
    // one affirmation. We keep the first one encountered. The
    // declarations-level seal and the top level document seal are
    // carried only when exactly one sealed assessment contributes to
    // this project BOM; if more than one contributes a seal they are
    // dropped because a merged BOM is a different document and the
    // original seals no longer verify against its canonical form.
    // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
    if (bomData.declarations.affirmation && !(projectBOM.declarations as any).affirmation) {
      // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
      (projectBOM.declarations as any).affirmation = bomData.declarations.affirmation;
    }
  }

  // Handle declarations and document signatures at the project
  // level. Propagate only when exactly one sealed assessment
  // contributed to this project, because a merged multi assessment
  // BOM has a different canonical form than any single assessment
  // BOM. Anything else gets dropped.
  const sealedBoms = boms.filter((b) => {
    const d = (b as unknown as { declarations?: { signature?: unknown } }).declarations;
    return Boolean(d?.signature);
  });
  if (sealedBoms.length === 1) {
    const sealed = sealedBoms[0] as unknown as {
      declarations?: { signature?: unknown };
      signature?: unknown;
    };
    // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
    (projectBOM.declarations as any).signature = sealed.declarations?.signature;
    if (sealed.signature) {
      // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
      (projectBOM as any).signature = sealed.signature;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
  (projectBOM.declarations as any).assessors = Array.from(mergedAssessors.values());
  // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
  (projectBOM.declarations as any).claims = Array.from(mergedClaims.values());
  // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
  (projectBOM.declarations as any).evidence = Array.from(mergedEvidence.values());
  // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
  (projectBOM.definitions as any).standards = Array.from(mergedStandards.values());

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
