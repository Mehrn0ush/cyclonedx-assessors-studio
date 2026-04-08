import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './connection.js';
import { hashPassword } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DemoData {
  organizations: any[];
  contacts: any[];
  users: any[];
  tags: any[];
  entities: any[];
  entity_relationships: any[];
  entity_tags: any[];
  projects: any[];
  project_tags: any[];
  signatories: any[];
  affirmations: any[];
  affirmation_signatories: any[];
  assessments: any[];
  assessment_assessors: any[];
  assessment_assessees: any[];
  assessment_tags: any[];
  evidence: any[];
  evidence_tags: any[];
  evidence_notes: any[];
  evidence_attachments: any[];
  claims: any[];
  claim_evidence: any[];
  claim_counter_evidence: any[];
  claim_mitigation_strategies: any[];
  notifications: any[];
  audit_logs: any[];
  dashboards: any[];
  ssdf_assessment_data?: {
    assessment_requirements: any[];
    attestation: any;
    attestation_requirements: any[];
    attestation_requirement_mitigations: any[];
  };
}

/**
 * Seeds the database with comprehensive demo data.
 * Requires that:
 *   1. Migrations have been run
 *   2. Default roles/permissions have been seeded
 *   3. An admin user already exists (created during setup)
 *   4. Standards have been imported from the CycloneDX feed
 *
 * Returns true if demo data was seeded, false if skipped (data already present).
 */
export async function seedDemoData(): Promise<boolean> {
  const db = getDatabase();

  // Guard: skip if demo data already exists (check for demo entities)
  const existingEntities = await db
    .selectFrom('entity')
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow();

  if (Number(existingEntities.count) > 0) {
    logger.info('Demo data already present, skipping seed');
    return false;
  }

  logger.info('Seeding demo data...');

  // Load the demo data JSON
  const demoDataPath = path.join(__dirname, 'demo-data.json');
  const raw = readFileSync(demoDataPath, 'utf-8');
  const data: DemoData = JSON.parse(raw);

  // Resolve the admin user (first admin in app_user table)
  const adminUser = await db
    .selectFrom('app_user')
    .where('role', '=', 'admin')
    .select(['id'])
    .executeTakeFirst();

  const adminUserId = adminUser?.id || uuidv4();

  // Resolve imported standards (we link assessments to the first two imported standards)
  const importedStandards = await db
    .selectFrom('standard')
    .select(['id', 'name'])
    .orderBy('created_at', 'asc')
    .execute();

  const firstStandardId = importedStandards[0]?.id || null;
  const secondStandardId = importedStandards[1]?.id || firstStandardId || null;

  // Resolve the SSDF standard (identifier = "ssdf-1.1")
  const ssdfStandard = await db
    .selectFrom('standard')
    .where('identifier', '=', 'ssdf-1.1')
    .select(['id', 'name'])
    .executeTakeFirst();
  const ssdfStandardId = ssdfStandard?.id || null;

  // Helper to resolve placeholder IDs
  const resolveId = (val: string): string | null => {
    if (val === '__ADMIN_USER__') return adminUserId;
    if (val === '__FIRST_STANDARD__') return firstStandardId;
    if (val === '__SECOND_STANDARD__') return secondStandardId;
    if (val === '__SSDF_STANDARD__') return ssdfStandardId;
    return val;
  };

  // Assign the admin user's role_id from the roles table
  const adminRole = await db
    .selectFrom('role')
    .where('key', '=', 'admin')
    .select('id')
    .executeTakeFirst();

  // --- Seed in FK dependency order ---

  // 1. Organizations
  for (const org of data.organizations) {
    await db.insertInto('organization').values(org).execute();
  }
  logger.info(`Seeded ${data.organizations.length} organizations`);

  // 2. Contacts
  for (const contact of data.contacts) {
    await db.insertInto('contact').values(contact).execute();
  }
  logger.info(`Seeded ${data.contacts.length} contacts`);

  // 3. Tags
  for (const tag of data.tags) {
    await db.insertInto('tag').values(tag).execute();
  }
  logger.info(`Seeded ${data.tags.length} tags`);

  // 4. Users (hash passwords)
  const roleMap = new Map<string, string>();
  const roles = await db.selectFrom('role').select(['id', 'key']).execute();
  for (const role of roles) {
    roleMap.set(role.key, role.id);
  }

  for (const user of data.users) {
    const passwordHash = await hashPassword(user.password);
    await db
      .insertInto('app_user')
      .values({
        id: user.id,
        username: user.username,
        email: user.email,
        password_hash: passwordHash,
        display_name: user.display_name,
        role: user.role,
        role_id: roleMap.get(user.role) || null,
        is_active: true,
        has_completed_onboarding: true,
      })
      .execute();
  }
  logger.info(`Seeded ${data.users.length} demo users`);

  // Update the admin user's role_id if not already set
  if (adminRole && adminUser) {
    await db
      .updateTable('app_user')
      .set({ role_id: adminRole.id, has_completed_onboarding: true })
      .where('id', '=', adminUser.id)
      .execute();
  }

  // 5. Entities
  for (const entity of data.entities) {
    // Auto-generate bom_ref if not provided in demo data
    const bomRef = entity.bom_ref || `${entity.entity_type}-${entity.id.substring(0, 8)}`;
    await db.insertInto('entity').values({
      ...entity,
      bom_ref: bomRef,
    }).execute();
  }
  logger.info(`Seeded ${data.entities.length} entities`);

  // 6. Entity Relationships
  for (const rel of data.entity_relationships) {
    const { _comment, ...relData } = rel as any;
    await db.insertInto('entity_relationship').values(relData).execute();
  }
  logger.info(`Seeded ${data.entity_relationships.length} entity relationships`);

  // 7. Entity Tags
  for (const et of data.entity_tags) {
    await db.insertInto('entity_tag').values({ ...et, created_at: new Date() }).execute();
  }

  // 8. Entity Standards (link entities to imported standards)
  if (firstStandardId) {
    const entityStandardPairs = [
      { entity_id: '00000000-0000-4000-e000-000000000007', standard_id: firstStandardId },
      { entity_id: '00000000-0000-4000-e000-000000000009', standard_id: firstStandardId },
    ];
    if (secondStandardId && secondStandardId !== firstStandardId) {
      entityStandardPairs.push(
        { entity_id: '00000000-0000-4000-e000-000000000006', standard_id: secondStandardId },
        { entity_id: '00000000-0000-4000-e000-000000000001', standard_id: secondStandardId },
      );
    }
    for (const es of entityStandardPairs) {
      await db.insertInto('entity_standard').values({ ...es, created_at: new Date() }).execute();
    }
    logger.info(`Seeded ${entityStandardPairs.length} entity-standard associations`);
  }
  // Link Supplier A to SSDF standard
  if (ssdfStandardId) {
    await db.insertInto('entity_standard').values({
      entity_id: '00000000-0000-4000-e000-000000000006',
      standard_id: ssdfStandardId,
      created_at: new Date(),
    }).execute();
    logger.info('Linked Supplier A to SSDF standard');
  }

  // 9. Compliance Policies
  if (firstStandardId) {
    const policies = [
      {
        id: uuidv4(),
        entity_id: '00000000-0000-4000-e000-000000000001',
        standard_id: firstStandardId,
        description: 'All Acme products must comply with ASVS Level 2 requirements.',
        is_inherited: false,
      },
    ];
    if (secondStandardId && secondStandardId !== firstStandardId) {
      policies.push({
        id: uuidv4(),
        entity_id: '00000000-0000-4000-e000-000000000006',
        standard_id: secondStandardId,
        description: 'Suppliers must demonstrate compliance with applicable security maturity standards.',
        is_inherited: false,
      });
    }
    for (const p of policies) {
      await db.insertInto('compliance_policy').values(p).execute();
    }
    logger.info(`Seeded ${policies.length} compliance policies`);
  }

  // 10. Signatories
  for (const sig of data.signatories) {
    await db.insertInto('signatory').values(sig).execute();
  }
  logger.info(`Seeded ${data.signatories.length} signatories`);

  // 11. Projects
  for (const project of data.projects) {
    await db.insertInto('project').values(project).execute();
  }
  logger.info(`Seeded ${data.projects.length} projects`);

  // 12. Project Tags
  for (const pt of data.project_tags) {
    await db.insertInto('project_tag').values({ ...pt, created_at: new Date() }).execute();
  }

  // 13. Project Standards (link projects to imported standards)
  if (firstStandardId) {
    const projectStandards = [
      { project_id: '00000000-0000-4000-f000-000000000001', standard_id: firstStandardId },
    ];
    if (secondStandardId && secondStandardId !== firstStandardId) {
      projectStandards.push(
        { project_id: '00000000-0000-4000-f000-000000000002', standard_id: secondStandardId },
      );
    }
    for (const ps of projectStandards) {
      await db.insertInto('project_standard').values({ ...ps, created_at: new Date() }).execute();
    }
  }

  // 14. Affirmations
  for (const aff of data.affirmations) {
    await db.insertInto('affirmation').values({
      ...aff,
      entity_id: aff.entity_id || null,
    }).execute();
  }
  logger.info(`Seeded ${data.affirmations.length} affirmations`);

  // 15. Affirmation Signatories
  for (const as_ of data.affirmation_signatories) {
    await db.insertInto('affirmation_signatory').values({ ...as_, created_at: new Date() }).execute();
  }

  // 16. Assessments
  for (const assessment of data.assessments) {
    await db.insertInto('assessment').values({
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      project_id: resolveId(assessment.project_id) || undefined,
      entity_id: assessment.entity_id || undefined,
      standard_id: resolveId(assessment.standard_id!) || undefined,
      state: assessment.state,
      start_date: assessment.start_date || undefined,
      due_date: assessment.due_date || undefined,
    }).execute();
  }
  logger.info(`Seeded ${data.assessments.length} assessments`);

  // 17. Assessment Assessors
  for (const aa of data.assessment_assessors) {
    await db.insertInto('assessment_assessor').values({
      assessment_id: aa.assessment_id,
      user_id: resolveId(aa.user_id)!,
      created_at: new Date(),
    }).execute();
  }

  // 18. Assessment Assessees
  for (const aa of data.assessment_assessees) {
    await db.insertInto('assessment_assessee').values({
      assessment_id: aa.assessment_id,
      user_id: resolveId(aa.user_id)!,
      created_at: new Date(),
    }).execute();
  }

  // 19. Assessment Tags
  for (const at of data.assessment_tags) {
    await db.insertInto('assessment_tag').values({ ...at, created_at: new Date() }).execute();
  }

  // 20. Evidence (must precede assessment_requirement_evidence links)
  for (const ev of data.evidence) {
    await db.insertInto('evidence').values({
      id: ev.id,
      name: ev.name,
      description: ev.description,
      state: ev.state,
      author_id: resolveId(ev.author_id)!,
      reviewer_id: ev.reviewer_id ? resolveId(ev.reviewer_id) : undefined,
      is_counter_evidence: ev.is_counter_evidence,
      classification: ev.classification,
      expires_on: ev.expires_on || undefined,
    }).execute();
  }
  logger.info(`Seeded ${data.evidence.length} evidence items`);

  // 21. Evidence Tags
  for (const et of data.evidence_tags) {
    await db.insertInto('evidence_tag').values({ ...et, created_at: new Date() }).execute();
  }

  // 22. Evidence Notes
  for (const en of data.evidence_notes) {
    await db.insertInto('evidence_note').values(en).execute();
  }
  logger.info(`Seeded ${data.evidence_notes.length} evidence notes`);

  // 23. Evidence Attachments (binary_content stored as BYTEA)
  for (const ea of data.evidence_attachments) {
    const row = { ...ea, storage_provider: 'database' };
    // Convert base64 string from JSON to a Buffer for BYTEA column
    if (typeof row.binary_content === 'string') {
      row.binary_content = Buffer.from(row.binary_content, 'base64');
    }
    await db.insertInto('evidence_attachment').values(row).execute();
  }
  logger.info(`Seeded ${data.evidence_attachments.length} evidence attachments`);

  // 24. Seed some assessment requirements for the first assessment (if standards have requirements)
  if (firstStandardId) {
    const requirements = await db
      .selectFrom('requirement')
      .where('standard_id', '=', firstStandardId)
      .select(['id'])
      .orderBy('identifier', 'asc')
      .limit(10)
      .execute();

    const assessmentReqIds: string[] = [];
    for (let i = 0; i < requirements.length; i++) {
      const arId = uuidv4();
      assessmentReqIds.push(arId);
      const results: Array<'yes' | 'no' | 'partial' | 'not_applicable' | null> = [
        'yes', 'yes', 'partial', 'yes', 'not_applicable',
        'yes', 'no', null, null, null,
      ];
      const rationales = [
        'Verified through penetration test and code review.',
        'MFA enforced for all user authentication paths.',
        'Partially implemented. API access paths still use single factor.',
        'Session management follows OWASP recommendations.',
        'Not applicable to this component architecture.',
        'Input validation implemented on all user facing endpoints.',
        'Password policy does not meet minimum complexity requirements.',
        null, null, null,
      ];

      await db.insertInto('assessment_requirement').values({
        id: arId,
        assessment_id: '00000000-0000-4000-f300-000000000001',
        requirement_id: requirements[i].id,
        result: results[i] || undefined,
        rationale: rationales[i] || undefined,
      }).execute();
    }

    // 21. Work Notes on first assessment (assessment-level notes)
    {
      const workNotes = [
        {
          id: uuidv4(),
          assessment_id: '00000000-0000-4000-f300-000000000001',
          user_id: '00000000-0000-4000-c000-000000000002',
          content: 'Reviewed pentest report section 4.2 which covers authentication requirements. All findings remediated. @spatil can you verify the remediation on your end?',
        },
        {
          id: uuidv4(),
          assessment_id: '00000000-0000-4000-f300-000000000001',
          user_id: '00000000-0000-4000-c000-000000000002',
          content: 'API MFA enforcement is on the roadmap for Q2 2026. Currently only web UI enforces MFA. @mwilson need to follow up with API gateway team on timeline.',
        },
        {
          id: uuidv4(),
          assessment_id: '00000000-0000-4000-f300-000000000001',
          user_id: '00000000-0000-4000-c000-000000000004',
          content: 'The API gateway team has started work on MFA enforcement. Expected completion: 2026-05-15. @jthompson updating you as requested.',
        },
        {
          id: uuidv4(),
          assessment_id: '00000000-0000-4000-f300-000000000001',
          user_id: '00000000-0000-4000-c000-000000000003',
          content: 'Current password policy: 8 chars minimum, no complexity. Need to upgrade to 12 chars with complexity rules per ASVS requirement.',
        },
      ];
      for (const wn of workNotes) {
        await db.insertInto('work_note').values({ ...wn, created_at: new Date(), updated_at: new Date() }).execute();
      }
      logger.info(`Seeded ${workNotes.length} work notes`);

      // 22. Assessment Requirement Evidence links
      await db.insertInto('assessment_requirement_evidence').values({
        assessment_requirement_id: assessmentReqIds[0],
        evidence_id: '00000000-0000-4000-f400-000000000001',
        created_at: new Date(),
      }).execute();
      await db.insertInto('assessment_requirement_evidence').values({
        assessment_requirement_id: assessmentReqIds[1],
        evidence_id: '00000000-0000-4000-f400-000000000003',
        created_at: new Date(),
      }).execute();
    }

    logger.info(`Seeded ${requirements.length} assessment requirements`);
  }

  // 27. Claims (include target_entity_id if present)
  for (const claim of data.claims) {
    await db.insertInto('claim').values({
      ...claim,
      target_entity_id: claim.target_entity_id || null,
    }).execute();
  }
  logger.info(`Seeded ${data.claims.length} claims`);

  // 28. Claim Evidence
  for (const ce of data.claim_evidence) {
    await db.insertInto('claim_evidence').values({ ...ce, created_at: new Date() }).execute();
  }

  // 29. Claim Counter Evidence
  for (const cce of data.claim_counter_evidence) {
    await db.insertInto('claim_counter_evidence').values({ ...cce, created_at: new Date() }).execute();
  }

  // 30. Claim Mitigation Strategies
  for (const cms of data.claim_mitigation_strategies) {
    await db.insertInto('claim_mitigation_strategy').values({ ...cms, created_at: new Date() }).execute();
  }

  // 31a. Assessors (CycloneDX declarations.assessors)
  const internalAssessorId = uuidv4();
  const externalAssessorId = uuidv4();
  await db.insertInto('assessor').values({
    id: internalAssessorId,
    bom_ref: `assessor-${internalAssessorId.substring(0, 8)}`,
    third_party: false,
    entity_id: '00000000-0000-4000-e000-000000000004', // Acme Security team
    user_id: null,
  }).execute();
  await db.insertInto('assessor').values({
    id: externalAssessorId,
    bom_ref: `assessor-${externalAssessorId.substring(0, 8)}`,
    third_party: true,
    entity_id: '00000000-0000-4000-e000-000000000013', // SecureAudit Partners
    user_id: null,
  }).execute();
  logger.info('Seeded 2 assessors (1 internal, 1 external)');

  // 31b. Claim external references (CycloneDX claim.externalReferences)
  await db.insertInto('claim_external_reference').values({
    id: uuidv4(),
    claim_id: '00000000-0000-4000-f500-000000000001',
    type: 'issue-tracker',
    url: 'https://jira.acme.example.com/browse/SEC-1234',
    comment: 'Authentication hardening tracking ticket',
  }).execute();
  await db.insertInto('claim_external_reference').values({
    id: uuidv4(),
    claim_id: '00000000-0000-4000-f500-000000000002',
    type: 'pentest-report',
    url: 'https://docs.acme.example.com/security/pentest-2026-q1.pdf',
    comment: 'Q1 2026 penetration test identifying session fixation',
  }).execute();
  await db.insertInto('claim_external_reference').values({
    id: uuidv4(),
    claim_id: '00000000-0000-4000-f500-000000000003',
    type: 'certification-report',
    url: 'https://compliance.suppliera.example.com/soc2-type2-2025.pdf',
    comment: 'Supplier A SOC 2 Type II report',
  }).execute();
  logger.info('Seeded 3 claim external references');

  // 31c. Attestations (link to the complete SSDF assessment, not the in-progress one)
  const attestation1Id = uuidv4();
  await db.insertInto('attestation').values({
    id: attestation1Id,
    summary: 'Based on our comprehensive assessment of Supplier A against NIST SP 800-218 (SSDF v1.1) requirements, we attest that the organization substantially meets the secure software development practices with identified exceptions documented in counter claims.',
    assessment_id: '00000000-0000-4000-f300-100000000001',
    signatory_id: '00000000-0000-4000-f100-000000000001',
    assessor_id: internalAssessorId,
  }).execute();

  // Link SSDF claims to attestation (these belong to the complete SSDF assessment)
  await db
    .updateTable('claim')
    .set({ attestation_id: attestation1Id })
    .where('id', '=', '00000000-0000-4000-f500-100000000001')
    .execute();
  await db
    .updateTable('claim')
    .set({ attestation_id: attestation1Id })
    .where('id', '=', '00000000-0000-4000-f500-100000000002')
    .execute();

  // Attestation requirements (use SSDF requirements for the complete SSDF assessment)
  if (ssdfStandardId) {
    const reqs = await db
      .selectFrom('requirement')
      .where('standard_id', '=', ssdfStandardId)
      .select(['id'])
      .orderBy('identifier', 'asc')
      .limit(5)
      .execute();

    for (let i = 0; i < reqs.length; i++) {
      const scores = [0.95, 1.0, 0.85, 0.9, 0.8];
      const confidences = [0.9, 0.95, 0.85, 0.9, 0.75];
      const rationales = [
        'Organization has comprehensive security requirements documented and communicated to all stakeholders.',
        'Security roles and training are well defined with regular training programs in place.',
        'Toolchain automation supports secure development practices with minor gaps in third party component verification.',
        'Security gates and quality criteria are enforced throughout the development lifecycle.',
        'Source code access controls are strong with MFA, branch protection, and regular access reviews.',
      ];
      const confRationales = [
        'High confidence based on documentation review and stakeholder interviews.',
        'Verified through training records and role definition documentation.',
        'Good confidence; automation is in place but some manual processes remain.',
        'High confidence; pipeline configuration demonstrates enforcement.',
        'Verified through repository configuration and access audit logs.',
      ];

      await db.insertInto('attestation_requirement').values({
        id: uuidv4(),
        attestation_id: attestation1Id,
        requirement_id: reqs[i].id,
        conformance_score: scores[i],
        conformance_rationale: rationales[i],
        confidence_score: confidences[i],
        confidence_rationale: confRationales[i],
      }).execute();
    }
    logger.info(`Seeded attestation with ${reqs.length} requirement mappings`);

    // Link attestation requirements to SSDF claims
    const attReqs = await db
      .selectFrom('attestation_requirement')
      .where('attestation_id', '=', attestation1Id)
      .select(['id'])
      .orderBy('created_at', 'asc')
      .execute();

    // Link first attestation requirement to SSDF claim 1 (supporting)
    if (attReqs.length > 0) {
      await db.insertInto('attestation_requirement_claim').values({
        attestation_requirement_id: attReqs[0].id,
        claim_id: '00000000-0000-4000-f500-100000000001',
        created_at: new Date(),
      }).execute();
    }
    // Link second attestation requirement to SSDF claim 2
    if (attReqs.length > 1) {
      await db.insertInto('attestation_requirement_claim').values({
        attestation_requirement_id: attReqs[1].id,
        claim_id: '00000000-0000-4000-f500-100000000002',
        created_at: new Date(),
      }).execute();
    }
    logger.info('Seeded attestation requirement claim links');
  }

  // --- SSDF Assessment Data ---
  if (data.ssdf_assessment_data && ssdfStandardId) {
    const ssdf = data.ssdf_assessment_data;

    // Build a map of SSDF requirement identifier -> requirement UUID
    const ssdfRequirements = await db
      .selectFrom('requirement')
      .where('standard_id', '=', ssdfStandardId)
      .select(['id', 'identifier'])
      .execute();
    const ssdfReqMap = new Map<string, string>();
    for (const r of ssdfRequirements) {
      ssdfReqMap.set(r.identifier, r.id);
    }

    // Seed SSDF assessment requirements
    const ssdfAssessmentId = '00000000-0000-4000-f300-100000000001';
    const ssdfAssessmentReqMap = new Map<string, string>(); // requirement_identifier -> assessment_requirement UUID

    for (const ar of ssdf.assessment_requirements) {
      const requirementId = ssdfReqMap.get(ar.requirement_identifier);
      if (!requirementId) {
        logger.warn(`SSDF requirement not found: ${ar.requirement_identifier}`);
        continue;
      }

      const arId = uuidv4();
      ssdfAssessmentReqMap.set(ar.requirement_identifier, arId);

      await db.insertInto('assessment_requirement').values({
        id: arId,
        assessment_id: ssdfAssessmentId,
        requirement_id: requirementId,
        result: ar.result || undefined,
        rationale: ar.rationale || undefined,
      }).execute();

      // Seed evidence links for this assessment requirement
      if (ar.evidence_ids && ar.evidence_ids.length > 0) {
        for (const evidenceId of ar.evidence_ids) {
          try {
            await db.insertInto('assessment_requirement_evidence').values({
              assessment_requirement_id: arId,
              evidence_id: evidenceId,
              created_at: new Date(),
            }).execute();
          } catch (e: any) {
            // Skip if evidence doesn't exist or duplicate
            if (!e?.message?.includes('duplicate') && !e?.message?.includes('unique') && !e?.message?.includes('foreign')) {
              throw e;
            }
          }
        }
      }

      // Seed work notes for this assessment
      if (ar.work_notes && ar.work_notes.length > 0) {
        for (const wn of ar.work_notes) {
          await db.insertInto('work_note').values({
            id: uuidv4(),
            assessment_id: ssdfAssessmentId,
            user_id: wn.user_id || adminUserId,
            content: wn.content,
            created_at: new Date(),
            updated_at: new Date(),
          }).execute();
        }
      }
    }
    logger.info(`Seeded ${ssdfAssessmentReqMap.size} SSDF assessment requirements`);

    // Create SSDF attestation (with external assessor)
    const ssdfAttestationId = uuidv4();
    await db.insertInto('attestation').values({
      id: ssdfAttestationId,
      summary: ssdf.attestation.summary,
      assessment_id: ssdfAssessmentId,
      signatory_id: ssdf.attestation.signatory_id,
      assessor_id: externalAssessorId,
    }).execute();

    // Link SSDF claims to attestation and set target entities
    // Map SSDF claim targets to entity IDs
    const ssdfTargetEntityMap: Record<string, string> = {
      'Acme Corporation SDLC': '00000000-0000-4000-e000-000000000001',          // Acme Inc
      'Acme Corporation': '00000000-0000-4000-e000-000000000001',               // Acme Inc
      'Acme Corporation Development Infrastructure': '00000000-0000-4000-e000-000000000001',
      'Acme Corporation Development Process': '00000000-0000-4000-e000-000000000001',
      'Product A v2.1 Source Repositories': '00000000-0000-4000-e000-000000000008', // Product A v2.1
      'Product A v2.1 Build and Release': '00000000-0000-4000-e000-000000000008',
      'Product A v2.1 Releases': '00000000-0000-4000-e000-000000000008',
      'Product A v2.1 Supply Chain': '00000000-0000-4000-e000-000000000008',
      'Product A v2.1 Development': '00000000-0000-4000-e000-000000000008',
      'Product A v2.1 Architecture': '00000000-0000-4000-e000-000000000008',
    };

    for (const claim of data.claims) {
      if (claim.id.startsWith('00000000-0000-4000-f500-1000')) {
        const targetEntityId = ssdfTargetEntityMap[claim.target] || null;
        await db
          .updateTable('claim')
          .set({
            attestation_id: ssdfAttestationId,
            ...(targetEntityId ? { target_entity_id: targetEntityId } : {}),
          })
          .where('id', '=', claim.id)
          .execute();
      }
    }

    // Seed SSDF attestation requirements
    const ssdfAttReqMap = new Map<string, string>(); // requirement_identifier -> attestation_requirement UUID
    for (const atReq of ssdf.attestation_requirements) {
      const requirementId = ssdfReqMap.get(atReq.requirement_identifier);
      if (!requirementId) {
        logger.warn(`SSDF attestation requirement not found: ${atReq.requirement_identifier}`);
        continue;
      }

      const atReqId = uuidv4();
      ssdfAttReqMap.set(atReq.requirement_identifier, atReqId);

      await db.insertInto('attestation_requirement').values({
        id: atReqId,
        attestation_id: ssdfAttestationId,
        requirement_id: requirementId,
        conformance_score: atReq.conformance_score,
        conformance_rationale: atReq.conformance_rationale,
        confidence_score: atReq.confidence_score,
        confidence_rationale: atReq.confidence_rationale,
      }).execute();
    }
    logger.info(`Seeded ${ssdfAttReqMap.size} SSDF attestation requirements`);

    // Seed SSDF attestation requirement mitigations
    for (const mit of ssdf.attestation_requirement_mitigations) {
      const atReqId = ssdfAttReqMap.get(mit.requirement_identifier);
      if (!atReqId) {
        logger.warn(`SSDF mitigation: attestation requirement not found for ${mit.requirement_identifier}`);
        continue;
      }

      await db.insertInto('attestation_requirement_mitigation').values({
        attestation_requirement_id: atReqId,
        evidence_id: mit.evidence_id,
        description: mit.description || null,
        target_completion: mit.target_completion || null,
      }).execute();
    }
    logger.info(`Seeded ${ssdf.attestation_requirement_mitigations.length} SSDF attestation requirement mitigations`);
  } else if (data.ssdf_assessment_data && !ssdfStandardId) {
    logger.warn('SSDF assessment data found but SSDF standard (ssdf-1.1) not imported. Skipping SSDF seeding.');
  }

  // 32. Notifications
  for (const notif of data.notifications) {
    await db.insertInto('notification').values({
      ...notif,
      user_id: resolveId(notif.user_id)!,
    }).execute();
  }
  logger.info(`Seeded ${data.notifications.length} notifications`);

  // 33. Audit logs
  for (const log of data.audit_logs) {
    await db.insertInto('audit_log').values({
      id: uuidv4(),
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      action: log.action,
      user_id: resolveId(log.user_id)!,
      changes: JSON.stringify(log.changes),
    }).execute();
  }
  logger.info(`Seeded ${data.audit_logs.length} audit log entries`);

  // 34. Dashboards
  for (const dash of data.dashboards) {
    await db.insertInto('dashboard').values({
      id: dash.id,
      name: dash.name,
      description: dash.description,
      owner_id: resolveId(dash.owner_id)!,
      is_default: dash.is_default,
      is_shared: dash.is_shared,
      layout: JSON.stringify(dash.layout),
    }).execute();
  }
  logger.info(`Seeded ${data.dashboards.length} dashboards`);

  logger.info('Demo data seeded successfully');
  return true;
}
