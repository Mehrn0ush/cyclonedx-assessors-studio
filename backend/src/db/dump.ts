import { initializeDatabase, closeDatabase, getDatabase } from './connection.js';

const tables = [
  'permission', 'role', 'role_permission', 'organization', 'contact', 'license',
  'standard', 'requirement', 'level', 'level_requirement',
  'project', 'project_standard', 'project_tag',
  'app_user', 
  'assessment', 'assessment_assessor', 'assessment_assessee', 'assessment_requirement', 'assessment_requirement_evidence', 'assessment_tag',
  'evidence', 'evidence_note', 'evidence_attachment', 'evidence_tag',
  'signatory', 'claim', 'claim_evidence', 'claim_counter_evidence', 'claim_mitigation_strategy',
  'attestation', 'attestation_requirement', 'attestation_requirement_mitigation',
  'affirmation', 'affirmation_signatory',
  'tag', 'entity', 'entity_relationship', 'entity_tag', 'entity_standard',
  'compliance_policy', 'work_note', 'audit_log', 'notification', 'dashboard',
  'api_key', 'session'
];

async function main() {
  await initializeDatabase();
  const db = getDatabase();
  const dump: Record<string, any[]> = {};
  
  for (const table of tables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await db.selectFrom(table as any).selectAll().execute();
      if (rows.length > 0) {
        dump[table] = rows;
      }
    } catch (err: any) {
      console.error(`Error on ${table}: ${err.message}`);
    }
  }
  
  const sanitized = JSON.parse(JSON.stringify(dump, (key, value) => {
    if (key === 'password_hash' || key === 'token_hash' || key === 'key_hash') return '[REDACTED]';
    return value;
  }));
  
  console.log(JSON.stringify(sanitized, null, 2));
  await closeDatabase();
}

main().catch(console.error);
