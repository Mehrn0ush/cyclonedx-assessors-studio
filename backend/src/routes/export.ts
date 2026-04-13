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
    affirmation?: {
      statement: string;
    };
  };
  definitions: {
    standards: CycloneDXStandard[];
  };
}

async function buildAssessmentBOM(assessmentId: string): Promise<CycloneDXBOM> {
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

  // Fetch affirmation if exists
  let affirmationStatement: string | undefined;
  if (project) {
    const affirmation = await db
      .selectFrom('affirmation')
      .where('project_id', '=', project.id)
      .selectAll()
      .executeTakeFirst();

    if (affirmation) {
      affirmationStatement = affirmation.statement;
    }
  }

  const bom: CycloneDXBOM = {
    $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
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
      ...(affirmationStatement && {
        affirmation: {
          statement: affirmationStatement,
        },
      }),
    },
    definitions: {
      standards,
    },
  };

  return bom;
}

async function generateAssessmentPDF(assessmentId: string): Promise<Buffer> {
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

  // Fetch project
  const project = assessment.project_id
    ? await db
        .selectFrom('project')
        .where('id', '=', assessment.project_id)
        .selectAll()
        .executeTakeFirst()
    : null;

  // Fetch assessors
  const assessors = await db
    .selectFrom('assessment_assessor')
    .innerJoin('app_user', 'app_user.id', 'assessment_assessor.user_id')
    .where('assessment_assessor.assessment_id', '=', assessmentId)
    .select(['app_user.display_name', 'app_user.email'])
    .execute();

  // Fetch assessees
  const assessees = await db
    .selectFrom('assessment_assessee')
    .innerJoin('app_user', 'app_user.id', 'assessment_assessee.user_id')
    .where('assessment_assessee.assessment_id', '=', assessmentId)
    .select(['app_user.display_name', 'app_user.email'])
    .execute();

  // Fetch assessment requirements
  const assessmentRequirements = await db
    .selectFrom('assessment_requirement')
    .innerJoin('requirement', 'requirement.id', 'assessment_requirement.requirement_id')
    .where('assessment_requirement.assessment_id', '=', assessmentId)
    .select([
      'assessment_requirement.id',
      'assessment_requirement.result',
      'assessment_requirement.rationale',
      'requirement.identifier',
      'requirement.name'
    ])
    .execute();

  // Fetch all evidence for this assessment
  let evidenceRecords: Record<string, unknown>[] = [];
  if (assessmentRequirements.length > 0) {
    evidenceRecords = await db
      .selectFrom('evidence')
      .innerJoin('assessment_requirement_evidence', 'assessment_requirement_evidence.evidence_id', 'evidence.id')
      .innerJoin('assessment_requirement', 'assessment_requirement.id', 'assessment_requirement_evidence.assessment_requirement_id')
      .innerJoin('app_user', 'app_user.id', 'evidence.author_id')
      .where('assessment_requirement.assessment_id', '=', assessmentId)
      .select([
        'evidence.name',
        'evidence.state',
        'evidence.description',
        'app_user.display_name'
      ])
      .execute();
  }

  // Fetch attestation if exists
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
        'requirement.name'
      ])
      .execute();
  }

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

  // Title Page
  doc.fontSize(36).fillColor('#000000').text('Assessment Report', { align: 'center' });
  doc.fontSize(24).text(assessment.title, { align: 'center' });
  doc.moveDown();

  doc.fontSize(12);
  if (project) {
    doc.text(`Project: ${project.name}`);
  }
  doc.text(`Date Generated: ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  doc.moveDown();

  addFooter();
  doc.addPage();

  // Assessment Summary Section
  doc.fontSize(16).fillColor('#000000').text('Assessment Summary', { underline: true });
  doc.fontSize(11).moveDown(0.5);

  if (assessment.description) {
    doc.text(`Description: ${assessment.description}`);
    doc.moveDown();
  }

  doc.text(`State: ${assessment.state}`);
  doc.text(`Start Date: ${assessment.start_date ? new Date(assessment.start_date).toLocaleDateString('en-US') : 'N/A'}`);
  doc.text(`Due Date: ${assessment.due_date ? new Date(assessment.due_date).toLocaleDateString('en-US') : 'N/A'}`);
  doc.text(`End Date: ${assessment.end_date ? new Date(assessment.end_date).toLocaleDateString('en-US') : 'N/A'}`);

  if (assessors.length > 0) {
    doc.text(`Assessors: ${assessors.map(a => a.display_name).join(', ')}`);
  }
  if (assessees.length > 0) {
    doc.text(`Assessees: ${assessees.map(a => a.display_name).join(', ')}`);
  }

  doc.moveDown();
  addFooter();
  doc.addPage();

  // Requirements Section
  doc.fontSize(16).fillColor('#000000').text('Requirements', { underline: true });
  doc.fontSize(10).moveDown(0.5);

  // Create requirements table
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
    const result = req.result ? req.result.toUpperCase() : 'N/A';
    const rationale = req.rationale || 'N/A';

    const rowHeight = 20;
    if (doc.y + rowHeight > footerY) {
      addFooter();
      doc.addPage();
    }

    tableX = 50;
    doc.fontSize(9);
    doc.text(req.identifier || '', tableX, doc.y, { width: colWidths.id, align: 'left' });
    tableX += colWidths.id;
    doc.text(req.name || '', tableX, doc.y, { width: colWidths.name, align: 'left' });
    tableX += colWidths.name;
    doc.text(result, tableX, doc.y, { width: colWidths.result, align: 'left' });
    tableX += colWidths.result;
    doc.text(rationale, tableX, doc.y, { width: colWidths.rationale, align: 'left' });

    doc.moveDown();
  }

  doc.moveDown();
  addFooter();

  if (evidenceRecords.length > 0) {
    doc.addPage();

    // Evidence Summary Section
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

  // Attestation Summary Section
  if (attestation && attestationRequirements.length > 0) {
    doc.addPage();

    doc.fontSize(16).fillColor('#000000').text('Attestation Summary', { underline: true });
    doc.fontSize(11).moveDown(0.5);

    if (attestation.summary) {
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
  const bom = await buildAssessmentBOM(assessmentId);

  // Set response headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="assessment-${assessmentId}-cdx.json"`);

  res.json(bom);

  logger.info('Assessment exported', {
    assessmentId,
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
  const boms = await Promise.all(assessments.map(a => buildAssessmentBOM(a.id)));

  // Create a wrapper BOM containing all assessment BOMs
  // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is complex and dynamic
  const projectBOM: Record<string, unknown> = {
    $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
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

    // Merge affirmation if present
    // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
    if (bomData.declarations.affirmation && !(projectBOM.declarations as any).affirmation) {
      // biome-ignore lint/suspicious/noExplicitAny: CycloneDX BOM structure is dynamically composed
      (projectBOM.declarations as any).affirmation = bomData.declarations.affirmation;
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
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="project-${projectId}-cdx.json"`);

  res.json(projectBOM);

  logger.info('Project exported', {
    projectId,
    assessmentCount: assessments.length,
    requestId: req.requestId,
  });
}));

export default router;
