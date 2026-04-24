import fs from 'node:fs';

process.env.DATABASE_URL = 'pglite:///tmp/cdxa-seal-check/db';
process.env.ENCRYPTION_KEY = 'U1VQRVJTRUNSRVRfMzJieXRlX2VuY3J5cHRpb25fa2V5XyEhIQ==';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn';
process.env.PGLITE_DATA_DIR = '/tmp/cdxa-seal-check/pglite';

async function main() {
  const { initializeDatabase, getDatabase } = await import('../src/db/connection.js');
  const { runMigrations } = await import('../src/db/migrate.js');
  const { seedDefaultRolesAndPermissions } = await import('../src/db/seed.js');
  const { seedDemoData } = await import('../src/db/seed-demo.js');

  await initializeDatabase();
  await runMigrations();
  await seedDefaultRolesAndPermissions();

  const db = getDatabase();
  const adminRole = await db.selectFrom('role').where('name', '=', 'Admin').selectAll().executeTakeFirst();
  const anyUser = await db.selectFrom('app_user').selectAll().executeTakeFirst();
  if (!anyUser && adminRole) {
    const { v4: uuidv4 } = await import('uuid');
    await db.insertInto('app_user').values({
      id: uuidv4(),
      username: 'admin',
      email: 'admin@demo.local',
      password_hash: 'x',
      display_name: 'Admin',
      role: 'admin',
      role_id: adminRole.id,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    } as any).execute();
    console.log('admin user inserted');
  }

  const seeded = await seedDemoData();
  console.log('demo seeded?', seeded);

  const aff = await db.selectFrom('affirmation').where('id', '=', '00000000-0000-4000-b300-000000000002').selectAll().executeTakeFirst();
  console.log('SSDF affirmation sealed_at:', aff?.sealed_at);
  console.log('declarations_signature_json present:', Boolean(aff?.declarations_signature_json));
  console.log('document_signature_json present:', Boolean(aff?.document_signature_json));

  const slots = await db.selectFrom('affirmation_signatory').where('affirmation_id', '=', '00000000-0000-4000-b300-000000000002').selectAll().execute();
  console.log('slot count:', slots.length);
  for (const s of slots) {
    console.log('  slot', s.id, 'signed_at?', !!s.signed_at);
  }

  const { buildAffirmationForAssessment } = await import('../src/utils/export-affirmation.js');
  const result = await buildAffirmationForAssessment(db, '00000000-0000-4000-b400-100000000001');
  console.log('exported affirmation:', result.affirmation ? 'present' : 'missing');
  console.log('signatories count:', result.affirmation?.signatories?.length ?? 0);
  for (const s of result.affirmation?.signatories ?? []) {
    const ok = Boolean(s.signature) || Boolean(s.externalReference && s.organization);
    console.log('  ', s.name, 'sig?', !!s.signature, 'extRef?', !!s.externalReference, 'org?', !!s.organization, 'VALID:', ok);
  }

  const Ajv = (await import('ajv/dist/2020.js')).default as any;
  const addFormats = (await import('ajv-formats')).default as any;
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schemaPath = '/sessions/optimistic-epic-goldberg/mnt/cyclonedx-assessors-studio/backend/src/cdxspec/validator/schemas/bom-1.7.schema.json';
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const validate = ajv.compile(schema);

  const bom: any = {
    $schema: 'http://cyclonedx.org/schema/bom-1.7.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.7',
    serialNumber: 'urn:uuid:11111111-1111-4111-8111-111111111111',
    version: 1,
    declarations: {
      attestations: [
        { summary: 'Test', map: [] },
      ],
      claims: [],
    },
  };
  if (result.affirmation) bom.declarations.affirmation = result.affirmation;
  if (result.declarationsSeal) bom.declarations.signature = result.declarationsSeal;
  if (result.documentSeal) bom.signature = result.documentSeal;

  const valid = validate(bom);
  console.log('BOM validates against bom-1.7.schema.json:', valid);
  if (!valid) {
    console.log('errors:', JSON.stringify(validate.errors, null, 2));
  }
  fs.mkdirSync('/tmp/cdxa-seal-check', { recursive: true });
  fs.writeFileSync('/tmp/cdxa-seal-check/exported.cdx.json', JSON.stringify(bom, null, 2));
  process.exit(valid ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
