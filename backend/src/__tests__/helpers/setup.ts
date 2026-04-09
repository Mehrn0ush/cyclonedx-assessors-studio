import { Kysely } from 'kysely';
import { KyselyPGlite } from 'kysely-pglite';
import { hashPassword } from '../../utils/crypto.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Database } from '../../db/types.js';
import { logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let testDb: Kysely<Database> | null = null;
let testDbDir: string | null = null;

export async function setupTestDb() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PROVIDER = 'pglite';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-32-chars-min';

  testDbDir = path.join(__dirname, '../../../..', `data/pglite-test-${uuidv4().slice(0, 8)}`);
  process.env.PGLITE_DATA_DIR = testDbDir;

  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const pglite = new PGlite({
    dataDir: testDbDir,
  });

  const pgliteWrapper = new KyselyPGlite(pglite);

  testDb = new Kysely<Database>({
    dialect: pgliteWrapper.dialect,
  });

  await runMigrationsWithDb(testDb);
  await seedDefaultRolesAndPermissionsWithDb(testDb);
}

async function runMigrationsWithDb(db: Kysely<Database>): Promise<void> {
  logger.info('Running database migrations...');

  const SQL = `
-- Permissions
CREATE TABLE IF NOT EXISTS permission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Roles
CREATE TABLE IF NOT EXISTS role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Role-Permission junction
CREATE TABLE IF NOT EXISTS role_permission (
  role_id UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permission(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id)
);

-- Organizations
CREATE TABLE IF NOT EXISTS organization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  country VARCHAR(255),
  region VARCHAR(255),
  locality VARCHAR(255),
  post_office_box_number VARCHAR(255),
  postal_code VARCHAR(20),
  street_address VARCHAR(255),
  website VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Contacts
CREATE TABLE IF NOT EXISTS contact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  organization_id UUID REFERENCES organization(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Licenses
CREATE TABLE IF NOT EXISTS license (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  text TEXT,
  url VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Standards
CREATE TABLE IF NOT EXISTS standard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner VARCHAR(255),
  version VARCHAR(20),
  license_id UUID REFERENCES license(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Requirements
CREATE TABLE IF NOT EXISTS requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES requirement(id) ON DELETE CASCADE,
  description TEXT,
  open_cre TEXT,
  standard_id UUID NOT NULL REFERENCES standard(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identifier, standard_id)
);

-- Levels (compliance tiers within a standard, e.g. ASVS L1/L2/L3)
CREATE TABLE IF NOT EXISTS level (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  description TEXT,
  standard_id UUID NOT NULL REFERENCES standard(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identifier, standard_id)
);

-- Level-Requirement junction (many-to-many)
CREATE TABLE IF NOT EXISTS level_requirement (
  level_id UUID NOT NULL REFERENCES level(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (level_id, requirement_id)
);

-- Projects
CREATE TABLE IF NOT EXISTS project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  state VARCHAR(50) NOT NULL DEFAULT 'new' CHECK(state IN ('new', 'in_progress', 'on_hold', 'complete', 'operational', 'retired')),
  workflow_type VARCHAR(50) NOT NULL DEFAULT 'evidence_driven' CHECK(workflow_type IN ('claims_driven', 'evidence_driven')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Project-Standard junction
CREATE TABLE IF NOT EXISTS project_standard (
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  standard_id UUID NOT NULL REFERENCES standard(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, standard_id)
);

-- App Users
CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'assessee' CHECK(role IN ('admin', 'assessor', 'assessee')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_app_user_username ON app_user(username);
CREATE INDEX idx_app_user_email ON app_user(email);

-- Assessments
CREATE TABLE IF NOT EXISTS assessment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  due_date TIMESTAMP WITH TIME ZONE,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  state VARCHAR(50) NOT NULL DEFAULT 'new' CHECK(state IN ('new', 'pending', 'in_progress', 'on_hold', 'cancelled', 'complete', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assessment_project_id ON assessment(project_id);

-- Assessment Assessors
CREATE TABLE IF NOT EXISTS assessment_assessor (
  assessment_id UUID NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_id, user_id)
);

-- Assessment Assessees
CREATE TABLE IF NOT EXISTS assessment_assessee (
  assessment_id UUID NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_id, user_id)
);

-- Assessment Requirements
CREATE TABLE IF NOT EXISTS assessment_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  evidence_id UUID,
  result VARCHAR(50) CHECK(result IN ('yes', 'no', 'partial', 'not_applicable')),
  rationale TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assessment_id, requirement_id)
);

-- Evidence
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_ref VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  property_name VARCHAR(255),
  description TEXT,
  state VARCHAR(50) NOT NULL DEFAULT 'in_progress' CHECK(state IN ('in_review', 'in_progress', 'claimed', 'expired')),
  author_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  expires_on TIMESTAMP WITH TIME ZONE,
  is_counter_evidence BOOLEAN NOT NULL DEFAULT FALSE,
  classification VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Assessment Requirement Evidence junction
CREATE TABLE IF NOT EXISTS assessment_requirement_evidence (
  assessment_requirement_id UUID NOT NULL REFERENCES assessment_requirement(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_requirement_id, evidence_id)
);

CREATE INDEX idx_evidence_state ON evidence(state);

-- Tags (name is the natural key, always lowercase)
CREATE TABLE IF NOT EXISTS tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE CHECK(name = LOWER(name)),
  color VARCHAR(7) DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Project-Tag junction
CREATE TABLE IF NOT EXISTS project_tag (
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, tag_id)
);

-- Assessment-Tag junction
CREATE TABLE IF NOT EXISTS assessment_tag (
  assessment_id UUID NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_id, tag_id)
);

-- Evidence-Tag junction
CREATE TABLE IF NOT EXISTS evidence_tag (
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (evidence_id, tag_id)
);

-- Evidence Notes
CREATE TABLE IF NOT EXISTS evidence_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Evidence Attachments
CREATE TABLE IF NOT EXISTS evidence_attachment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path VARCHAR(255),
  binary_content BYTEA,
  content_hash VARCHAR(64),
  storage_provider TEXT NOT NULL DEFAULT 'database',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Signatories (before attestation/affirmation which reference it)
CREATE TABLE IF NOT EXISTS signatory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(255),
  organization_id UUID REFERENCES organization(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Claims (attestation_id FK added via ALTER TABLE below)
CREATE TABLE IF NOT EXISTS claim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_ref VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  target TEXT NOT NULL,
  predicate TEXT NOT NULL,
  reasoning TEXT,
  is_counter_claim BOOLEAN NOT NULL DEFAULT FALSE,
  attestation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Claim Evidence junction
CREATE TABLE IF NOT EXISTS claim_evidence (
  claim_id UUID NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (claim_id, evidence_id)
);

-- Claim Counter Evidence junction
CREATE TABLE IF NOT EXISTS claim_counter_evidence (
  claim_id UUID NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (claim_id, evidence_id)
);

-- Claim Mitigation Strategy junction
CREATE TABLE IF NOT EXISTS claim_mitigation_strategy (
  claim_id UUID NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (claim_id, evidence_id)
);

-- Attestations
CREATE TABLE IF NOT EXISTS attestation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary TEXT,
  assessment_id UUID NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  signatory_id UUID REFERENCES signatory(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Attestation Requirements
CREATE TABLE IF NOT EXISTS attestation_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attestation_id UUID NOT NULL REFERENCES attestation(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  conformance_score DECIMAL(3, 2) NOT NULL CHECK(conformance_score >= 0 AND conformance_score <= 1),
  conformance_rationale TEXT NOT NULL,
  confidence_score DECIMAL(3, 2) CHECK(confidence_score >= 0 AND confidence_score <= 1),
  confidence_rationale TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attestation_id, requirement_id)
);

-- Attestation Requirement Mitigation junction
CREATE TABLE IF NOT EXISTS attestation_requirement_mitigation (
  attestation_requirement_id UUID NOT NULL REFERENCES attestation_requirement(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attestation_requirement_id, evidence_id)
);

-- Affirmations
CREATE TABLE IF NOT EXISTS affirmation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Affirmation Signatory junction
CREATE TABLE IF NOT EXISTS affirmation_signatory (
  affirmation_id UUID NOT NULL REFERENCES affirmation(id) ON DELETE CASCADE,
  signatory_id UUID NOT NULL REFERENCES signatory(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (affirmation_id, signatory_id)
);

-- API Keys (for programmatic / headless access)
CREATE TABLE IF NOT EXISTS api_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  prefix VARCHAR(8) NOT NULL,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_key_prefix ON api_key(prefix);
CREATE INDEX idx_api_key_user_id ON api_key(user_id);

-- Sessions
CREATE TABLE IF NOT EXISTS session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_token_hash ON session(token_hash);

-- Add foreign key constraint for assessment_requirement.evidence_id after evidence table is created
ALTER TABLE assessment_requirement DROP CONSTRAINT IF EXISTS fk_assessment_requirement_evidence_id;
ALTER TABLE assessment_requirement ADD CONSTRAINT fk_assessment_requirement_evidence_id
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE SET NULL;

-- Add foreign key constraint for claim.attestation_id after attestation table is created
ALTER TABLE claim DROP CONSTRAINT IF EXISTS fk_claim_attestation_id;
ALTER TABLE claim ADD CONSTRAINT fk_claim_attestation_id
  FOREIGN KEY (attestation_id) REFERENCES attestation(id) ON DELETE SET NULL;

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add role_id column to app_user for new RBAC system
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES role(id) ON DELETE SET NULL;

-- Webhook tables
CREATE TABLE IF NOT EXISTS webhook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  event_types TEXT[] NOT NULL DEFAULT ARRAY['*'],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhook(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'exhausted')),
  http_status INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  request_body JSONB,
  response_body TEXT,
  error_message TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Encryption at Rest
CREATE TABLE IF NOT EXISTS encryption_key_version (
  version INTEGER PRIMARY KEY,
  salt TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  retired_at TIMESTAMP WITH TIME ZONE
);
`;

  const statements = SQL.split(';').filter(stmt => stmt.trim());

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await db.executeQuery({
          sql: statement + ';',
          parameters: [],
        } as any);
      } catch (error: any) {
        if (error?.message?.includes('already exists')) {
          continue;
        }
        throw error;
      }
    }
  }

  logger.info('Database migrations completed');
}

async function seedDefaultRolesAndPermissionsWithDb(db: Kysely<Database>): Promise<void> {
  const DEFAULT_PERMISSIONS = [
    { key: 'projects.view', name: 'View Projects', description: 'View project list and details', category: 'projects' },
    { key: 'projects.create', name: 'Create Projects', description: 'Create new projects', category: 'projects' },
    { key: 'projects.edit', name: 'Edit Projects', description: 'Edit existing projects', category: 'projects' },
    { key: 'projects.delete', name: 'Delete Projects', description: 'Delete or retire projects', category: 'projects' },
    { key: 'standards.view', name: 'View Standards', description: 'View standards and requirements', category: 'standards' },
    { key: 'standards.import', name: 'Import Standards', description: 'Import standards from CycloneDX feed', category: 'standards' },
    { key: 'assessments.view', name: 'View Assessments', description: 'View assessment list and details', category: 'assessments' },
    { key: 'assessments.create', name: 'Create Assessments', description: 'Create new assessments', category: 'assessments' },
    { key: 'assessments.edit', name: 'Edit Assessments', description: 'Edit assessments', category: 'assessments' },
    { key: 'assessments.manage', name: 'Manage Assessments', description: 'Start, complete, and manage assessment lifecycle', category: 'assessments' },
    { key: 'evidence.view', name: 'View Evidence', description: 'View evidence items', category: 'evidence' },
    { key: 'evidence.create', name: 'Create Evidence', description: 'Create new evidence', category: 'evidence' },
    { key: 'evidence.edit', name: 'Edit Evidence', description: 'Edit evidence items', category: 'evidence' },
    { key: 'evidence.review', name: 'Review Evidence', description: 'Review and approve evidence', category: 'evidence' },
    { key: 'claims.view', name: 'View Claims', description: 'View claims', category: 'claims' },
    { key: 'claims.create', name: 'Create Claims', description: 'Create new claims', category: 'claims' },
    { key: 'claims.edit', name: 'Edit Claims', description: 'Edit claims', category: 'claims' },
    { key: 'attestations.view', name: 'View Attestations', description: 'View attestations', category: 'attestations' },
    { key: 'attestations.create', name: 'Create Attestations', description: 'Create attestations', category: 'attestations' },
    { key: 'attestations.sign', name: 'Sign Attestations', description: 'Sign attestations as signatory', category: 'attestations' },
    { key: 'admin.users', name: 'Manage Users', description: 'Create, edit, and manage user accounts', category: 'admin' },
    { key: 'admin.roles', name: 'Manage Roles', description: 'Create, edit, and manage roles and permissions', category: 'admin' },
    { key: 'admin.settings', name: 'Manage Settings', description: 'Manage application settings', category: 'admin' },
  ];

  const DEFAULT_ROLES = [
    {
      key: 'admin',
      name: 'Administrator',
      description: 'Full access to all features and settings',
      permissions: DEFAULT_PERMISSIONS.map(p => p.key),
    },
    {
      key: 'assessor',
      name: 'Assessor',
      description: 'Can conduct assessments, manage evidence, create claims and attestations',
      permissions: [
        'projects.view', 'standards.view',
        'assessments.view', 'assessments.create', 'assessments.edit', 'assessments.manage',
        'evidence.view', 'evidence.create', 'evidence.edit', 'evidence.review',
        'claims.view', 'claims.create', 'claims.edit',
        'attestations.view', 'attestations.create', 'attestations.sign',
      ],
    },
    {
      key: 'assessee',
      name: 'Assessee',
      description: 'Can view assessments, submit evidence, and view attestations',
      permissions: [
        'projects.view', 'standards.view',
        'assessments.view',
        'evidence.view', 'evidence.create',
        'claims.view',
        'attestations.view',
      ],
    },
  ];

  const existingPerms = await db
    .selectFrom('permission')
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow();

  if (Number(existingPerms.count) > 0) {
    logger.info('Permissions already seeded, skipping');
    return;
  }

  logger.info('Seeding default permissions and roles...');

  const permissionMap = new Map<string, string>();
  for (const perm of DEFAULT_PERMISSIONS) {
    const id = uuidv4();
    await db
      .insertInto('permission')
      .values({
        id,
        key: perm.key,
        name: perm.name,
        description: perm.description,
        category: perm.category,
      })
      .execute();
    permissionMap.set(perm.key, id);
  }

  for (const role of DEFAULT_ROLES) {
    const roleId = uuidv4();
    await db
      .insertInto('role')
      .values({
        id: roleId,
        key: role.key,
        name: role.name,
        description: role.description,
        is_system: true,
      })
      .execute();

    for (const permKey of role.permissions) {
      const permId = permissionMap.get(permKey);
      if (permId) {
        await db
          .insertInto('role_permission')
          .values({
            role_id: roleId,
            permission_id: permId,
            created_at: new Date(),
          })
          .execute();
      }
    }
  }

  logger.info('Default permissions and roles seeded successfully');
}

export async function teardownTestDb() {
  if (testDb) {
    await testDb.destroy();
    testDb = null;
  }
  if (testDbDir && fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  }
}

export function getTestDatabase(): Kysely<Database> {
  if (!testDb) {
    throw new Error('Test database not initialized. Call setupTestDb() first.');
  }
  return testDb;
}

export async function createTestUser(overrides: Partial<{
  username: string;
  email: string;
  displayName: string;
  role: string;
  password: string;
}> = {}) {
  const db = getTestDatabase();
  const userId = uuidv4();
  const passwordHash = await hashPassword(overrides.password || 'testpassword123');

  await db.insertInto('app_user').values({
    id: userId,
    username: overrides.username || `testuser_${userId.slice(0, 8)}`,
    email: overrides.email || `test_${userId.slice(0, 8)}@example.com`,
    password_hash: passwordHash,
    display_name: overrides.displayName || 'Test User',
    role: (overrides.role || 'assessee') as any,
    is_active: true,
  }).execute();

  return {
    id: userId,
    username: overrides.username || `testuser_${userId.slice(0, 8)}`,
    email: overrides.email || `test_${userId.slice(0, 8)}@example.com`,
  };
}

export async function createTestProject(overrides: Partial<{
  name: string;
  description: string;
  state: string;
}> = {}) {
  const db = getTestDatabase();
  const projectId = uuidv4();

  await db.insertInto('project').values({
    id: projectId,
    name: overrides.name || 'Test Project',
    description: overrides.description || 'A test project',
    state: (overrides.state || 'new') as any,
  }).execute();

  return {
    id: projectId,
    name: overrides.name || 'Test Project',
  };
}

export async function createTestStandard(overrides: Partial<{
  identifier: string;
  name: string;
  description: string | null;
  owner: string | null;
  version: string | null;
}> = {}) {
  const db = getTestDatabase();
  const standardId = uuidv4();
  const identifier = overrides.identifier || `STD-${uuidv4().slice(0, 8)}`;

  await db.insertInto('standard').values({
    id: standardId,
    identifier,
    name: overrides.name || 'Test Standard',
    description: 'description' in overrides ? overrides.description : 'A test standard',
    owner: 'owner' in overrides ? overrides.owner : 'Test Owner',
    version: 'version' in overrides ? overrides.version : '1.0.0',
  }).execute();

  return {
    id: standardId,
    identifier,
    name: overrides.name || 'Test Standard',
  };
}

export async function createTestRequirement(standardId: string, overrides: Partial<{
  identifier: string;
  name: string;
  description: string;
  parentId: string;
  open_cre: string;
}> = {}) {
  const db = getTestDatabase();
  const requirementId = uuidv4();
  const identifier = overrides.identifier || `REQ-${uuidv4().slice(0, 8)}`;

  await db.insertInto('requirement').values({
    id: requirementId,
    identifier,
    name: overrides.name || 'Test Requirement',
    description: overrides.description || 'A test requirement',
    standard_id: standardId,
    parent_id: overrides.parentId || null,
    open_cre: overrides.open_cre || null,
  }).execute();

  return {
    id: requirementId,
    identifier,
    name: overrides.name || 'Test Requirement',
  };
}

export async function createTestLevel(standardId: string, overrides: Partial<{
  identifier: string;
  title: string;
  description: string;
}> = {}) {
  const db = getTestDatabase();
  const levelId = uuidv4();
  const identifier = overrides.identifier || `LEVEL-${uuidv4().slice(0, 8)}`;

  await db.insertInto('level').values({
    id: levelId,
    identifier,
    title: overrides.title || 'Test Level',
    description: overrides.description || 'A test level',
    standard_id: standardId,
  }).execute();

  return {
    id: levelId,
    identifier,
    title: overrides.title || 'Test Level',
  };
}

export async function createTestAssessment(projectId: string, overrides: Partial<{
  title: string;
  description: string;
  state: string;
}> = {}) {
  const db = getTestDatabase();
  const assessmentId = uuidv4();

  await db.insertInto('assessment').values({
    id: assessmentId,
    title: overrides.title || 'Test Assessment',
    description: overrides.description || 'A test assessment',
    project_id: projectId,
    state: (overrides.state || 'new') as any,
  }).execute();

  return {
    id: assessmentId,
    title: overrides.title || 'Test Assessment',
  };
}

export async function createTestEvidence(authorId: string, overrides: Partial<{
  name: string;
  description: string;
  state: string;
}> = {}) {
  const db = getTestDatabase();
  const evidenceId = uuidv4();

  await db.insertInto('evidence').values({
    id: evidenceId,
    name: overrides.name || 'Test Evidence',
    description: overrides.description || 'A test evidence item',
    state: (overrides.state || 'in_progress') as any,
    author_id: authorId,
  }).execute();

  return {
    id: evidenceId,
    name: overrides.name || 'Test Evidence',
  };
}

export async function createTestTag(overrides: Partial<{
  name: string;
  color: string;
}> = {}) {
  const db = getTestDatabase();
  const tagId = uuidv4();
  const name = overrides.name || `tag-${uuidv4().slice(0, 8)}`.toLowerCase();
  const color = overrides.color || '#6366f1';

  await db.insertInto('tag').values({
    id: tagId,
    name,
    color,
    created_at: new Date(),
  }).execute();

  return {
    id: tagId,
    name,
    color,
  };
}

export async function createTestAttestationRequirement(
  attestationId: string,
  requirementId: string,
  overrides: Partial<{
    conformanceScore: number;
    conformanceRationale: string;
    confidenceScore: number;
    confidenceRationale: string;
  }> = {}
) {
  const db = getTestDatabase();
  const attestReqId = uuidv4();

  await db.insertInto('attestation_requirement').values({
    id: attestReqId,
    attestation_id: attestationId,
    requirement_id: requirementId,
    conformance_score: (overrides.conformanceScore ?? 0.5) as any,
    conformance_rationale: overrides.conformanceRationale || 'Test rationale',
    confidence_score: (overrides.confidenceScore ?? 0.75) as any,
    confidence_rationale: overrides.confidenceRationale || 'Test confidence',
    created_at: new Date(),
    updated_at: new Date(),
  }).execute();

  return {
    id: attestReqId,
    attestation_id: attestationId,
    requirement_id: requirementId,
  };
}
