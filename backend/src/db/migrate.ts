import { initializeDatabase, closeDatabase, getDatabase } from './connection.js';
import { logger } from '../utils/logger.js';

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
  state VARCHAR(20) NOT NULL DEFAULT 'published' CHECK(state IN ('draft', 'in_review', 'published', 'retired')),
  authored_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  submitted_at TIMESTAMP WITH TIME ZONE,
  is_imported BOOLEAN NOT NULL DEFAULT FALSE,
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
  role VARCHAR(50) NOT NULL DEFAULT 'assessee' CHECK(role IN ('admin', 'assessor', 'assessee', 'standards_manager', 'standards_approver')),
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
  state VARCHAR(50) NOT NULL DEFAULT 'new' CHECK(state IN ('new', 'pending', 'in_progress', 'on_hold', 'cancelled', 'complete')),
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

CREATE INDEX idx_evidence_state ON evidence(state);

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
  storage_path VARCHAR(255) NOT NULL,
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

-- Add foreign key constraints for standard.authored_by and standard.approved_by after app_user table is created
ALTER TABLE standard DROP CONSTRAINT IF EXISTS fk_standard_authored_by;
ALTER TABLE standard ADD CONSTRAINT fk_standard_authored_by
  FOREIGN KEY (authored_by) REFERENCES app_user(id) ON DELETE SET NULL;

ALTER TABLE standard DROP CONSTRAINT IF EXISTS fk_standard_approved_by;
ALTER TABLE standard ADD CONSTRAINT fk_standard_approved_by
  FOREIGN KEY (approved_by) REFERENCES app_user(id) ON DELETE SET NULL;

-- Add foreign key constraint for assessment_requirement.evidence_id after evidence table is created
ALTER TABLE assessment_requirement DROP CONSTRAINT IF EXISTS fk_assessment_requirement_evidence_id;
ALTER TABLE assessment_requirement ADD CONSTRAINT fk_assessment_requirement_evidence_id
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE SET NULL;

-- Add foreign key constraint for claim.attestation_id after attestation table is created
ALTER TABLE claim DROP CONSTRAINT IF EXISTS fk_claim_attestation_id;
ALTER TABLE claim ADD CONSTRAINT fk_claim_attestation_id
  FOREIGN KEY (attestation_id) REFERENCES attestation(id) ON DELETE SET NULL;

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

-- Assessment Requirement Evidence junction (many-to-many, replaces single evidence_id FK)
CREATE TABLE IF NOT EXISTS assessment_requirement_evidence (
  assessment_requirement_id UUID NOT NULL REFERENCES assessment_requirement(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_requirement_id, evidence_id)
);

-- Entity table (replaces rigid project-only hierarchy)
CREATE TABLE IF NOT EXISTS entity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  entity_type VARCHAR(50) NOT NULL CHECK(entity_type IN ('organization', 'business_unit', 'team', 'product', 'product_version', 'component', 'supplier', 'project')),
  state VARCHAR(50) NOT NULL DEFAULT 'active' CHECK(state IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entity_type ON entity(entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_state ON entity(state);

-- Entity Relationship table (typed directional connections)
CREATE TABLE IF NOT EXISTS entity_relationship (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL CHECK(relationship_type IN ('owns', 'supplies', 'depends_on', 'governs', 'contains', 'consumes')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_entity_id, target_entity_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_entity_rel_source ON entity_relationship(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_rel_target ON entity_relationship(target_entity_id);

-- Entity Tag junction
CREATE TABLE IF NOT EXISTS entity_tag (
  entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_id, tag_id)
);

-- Compliance Policy table
CREATE TABLE IF NOT EXISTS compliance_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  standard_id UUID NOT NULL REFERENCES standard(id) ON DELETE CASCADE,
  description TEXT,
  is_inherited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_id, standard_id)
);

-- Entity Standard junction (which standards are applicable to an entity)
CREATE TABLE IF NOT EXISTS entity_standard (
  entity_id UUID NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  standard_id UUID NOT NULL REFERENCES standard(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_id, standard_id)
);

-- Add role_id column to app_user for new RBAC system
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES role(id) ON DELETE SET NULL;

-- Assessment changes
ALTER TABLE assessment ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE assessment ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entity(id) ON DELETE SET NULL;
ALTER TABLE assessment ADD COLUMN IF NOT EXISTS standard_id UUID REFERENCES standard(id) ON DELETE SET NULL;
ALTER TABLE assessment ADD COLUMN IF NOT EXISTS conformance_score DECIMAL(5, 2);

CREATE INDEX IF NOT EXISTS idx_assessment_entity_id ON assessment(entity_id);
CREATE INDEX IF NOT EXISTS idx_assessment_standard_id ON assessment(standard_id);

-- Affirmation update
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entity(id) ON DELETE SET NULL;

-- Work Notes (per assessment requirement)
CREATE TABLE IF NOT EXISTS work_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_requirement_id UUID NOT NULL REFERENCES assessment_requirement(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_note_assessment_requirement ON work_note(assessment_requirement_id);

-- Audit Trail
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL CHECK(action IN ('create', 'update', 'delete', 'state_change', 'link', 'unlink')),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(500),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_read ON notification(user_id, is_read);

-- Add archived_at to project for project archival
ALTER TABLE project ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add onboarding flag to app_user
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE;

-- Dashboard configurations (user-created dashboards with widget layouts)
CREATE TABLE IF NOT EXISTS dashboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  layout JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dashboard_owner ON dashboard(owner_id);
`;

export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...');

  const db = getDatabase();

  // CREATE INDEX IF NOT EXISTS is not standard SQL, so wrap indexes
  // to ignore "already exists" errors gracefully.
  const statements = SQL.split(';').filter(stmt => stmt.trim());

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await db.executeQuery({
          sql: statement + ';',
          parameters: [],
        } as any);
      } catch (error: any) {
        // Ignore "already exists" errors from CREATE INDEX / ALTER TABLE
        if (error?.message?.includes('already exists')) {
          continue;
        }
        throw error;
      }
    }
  }

  logger.info('Database migrations completed');
}

// Allow running as standalone script: npx tsx src/db/migrate.ts
const isMainModule = process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');
if (isMainModule) {
  (async () => {
    try {
      await initializeDatabase();
      await runMigrations();
      await closeDatabase();
    } catch (error) {
      logger.error('Database migration failed', { error });
      process.exit(1);
    }
  })();
}
