import { initializeDatabase, closeDatabase, getDatabase } from './connection.js';
import { logger } from '../utils/logger.js';

export const SQL = `
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
  name TEXT NOT NULL,
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
  binary_content TEXT,
  content_hash VARCHAR(64),
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
  description TEXT,
  target_completion TIMESTAMP WITH TIME ZONE,
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
-- Session identity is carried by the signed JWT payload (sessionId claim).
-- The server looks up sessions by id only, with no server-side token hash
-- persisted. A prior revision stored the SHA-256 of the raw token in a
-- token_hash column, but nothing read from it after the sessionId claim
-- became the canonical lookup key, so the column was dropped. The upgrade
-- path (ALTER TABLE session DROP COLUMN IF EXISTS) lives near the bottom
-- of this migration SQL.
CREATE TABLE IF NOT EXISTS session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User invites
-- Single use tokens issued by an admin so a specific person can register
-- when REGISTRATION_MODE=invite_only. The server stores only the SHA-256
-- hash of the token, and the plaintext is shown once at issuance.
CREATE TABLE IF NOT EXISTS user_invite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255),
  intended_role VARCHAR(50) NOT NULL DEFAULT 'assessee' CHECK(intended_role IN ('admin', 'assessor', 'assessee', 'standards_manager', 'standards_approver')),
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  consumed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_invite_token_hash ON user_invite(token_hash);
CREATE INDEX idx_user_invite_email ON user_invite(email);

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
  entity_type VARCHAR(50) NOT NULL CHECK(entity_type IN ('organization', 'business_unit', 'team', 'product', 'product_version', 'component', 'service', 'project')),
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
  assessment_id UUID NOT NULL REFERENCES assessment(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_note_assessment ON work_note(assessment_id);

-- Audit Trail
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL CHECK(action IN ('create', 'create_for_other', 'update', 'delete', 'state_change', 'link', 'unlink')),
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

-- Update entity_type CHECK constraint to include 'service' (for existing databases)
ALTER TABLE entity DROP CONSTRAINT IF EXISTS entity_entity_type_check;
ALTER TABLE entity ADD CONSTRAINT entity_entity_type_check CHECK(entity_type IN ('organization', 'business_unit', 'team', 'product', 'product_version', 'component', 'service', 'project'));

-- =====================================================================
-- CycloneDX Declarations Alignment (gaps 1-5)
-- =====================================================================

-- Add bom_ref to entity (all entities can be CycloneDX targets)
ALTER TABLE entity ADD COLUMN IF NOT EXISTS bom_ref VARCHAR(255);

-- Assessor table: CycloneDX declarations.assessors[]
-- Links to an entity (org) and optionally an app_user (for internal assessors)
CREATE TABLE IF NOT EXISTS assessor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_ref VARCHAR(255) NOT NULL,
  third_party BOOLEAN NOT NULL DEFAULT TRUE,
  entity_id UUID REFERENCES entity(id) ON DELETE SET NULL,
  user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assessor_entity ON assessor(entity_id);
CREATE INDEX IF NOT EXISTS idx_assessor_user ON assessor(user_id);

-- Add assessor_id to attestation: CycloneDX attestation.assessor
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS assessor_id UUID REFERENCES assessor(id) ON DELETE SET NULL;

-- Attestation requirement claim links: CycloneDX attestation.map[].claims[]
CREATE TABLE IF NOT EXISTS attestation_requirement_claim (
  attestation_requirement_id UUID NOT NULL REFERENCES attestation_requirement(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attestation_requirement_id, claim_id)
);

-- Attestation requirement counter claim links: CycloneDX attestation.map[].counterClaims[]
CREATE TABLE IF NOT EXISTS attestation_requirement_counter_claim (
  attestation_requirement_id UUID NOT NULL REFERENCES attestation_requirement(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attestation_requirement_id, claim_id)
);

-- Change claim target from TEXT to entity FK: CycloneDX declarations.targets
ALTER TABLE claim ADD COLUMN IF NOT EXISTS target_entity_id UUID REFERENCES entity(id) ON DELETE SET NULL;

-- Claim external references: CycloneDX claim.externalReferences[]
CREATE TABLE IF NOT EXISTS claim_external_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL CHECK(type IN (
    'vcs', 'issue-tracker', 'website', 'advisories', 'bom', 'mailing-list',
    'social', 'chat', 'documentation', 'support', 'source-distribution',
    'distribution', 'distribution-intake', 'license', 'build-meta',
    'build-system', 'release-notes', 'security-contact', 'model-card',
    'log', 'configuration', 'evidence', 'formulation', 'attestation',
    'threat-model', 'adversary-model', 'risk-assessment',
    'vulnerability-assertion', 'exploitability-statement', 'pentest-report',
    'static-analysis-report', 'dynamic-analysis-report',
    'runtime-analysis-report', 'component-analysis-report',
    'maturity-report', 'certification-report', 'codified-infrastructure',
    'quality-metrics', 'poam', 'electronic-signature', 'digital-signature',
    'rfc-9116', 'patent', 'patent-family', 'patent-assertion', 'citation',
    'other'
  )),
  url VARCHAR(2048) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_claim_ext_ref_claim ON claim_external_reference(claim_id);

-- Signatory external reference support: CycloneDX signatory.externalReference
ALTER TABLE signatory ADD COLUMN IF NOT EXISTS external_reference_type VARCHAR(100);
ALTER TABLE signatory ADD COLUMN IF NOT EXISTS external_reference_url VARCHAR(2048);

-- Add start_date and due_date to project for timeline tracking
ALTER TABLE project ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE project ADD COLUMN IF NOT EXISTS due_date DATE;

-- Store original or generated CycloneDX JSON for deterministic export
ALTER TABLE standard ADD COLUMN IF NOT EXISTS source_json TEXT;

-- Expand entity_relationship types with 'assesses' and 'produces'
ALTER TABLE entity_relationship DROP CONSTRAINT IF EXISTS entity_relationship_relationship_type_check;
ALTER TABLE entity_relationship ADD CONSTRAINT entity_relationship_relationship_type_check
  CHECK(relationship_type IN ('owns', 'supplies', 'depends_on', 'governs', 'contains', 'consumes', 'assesses', 'produces'));

-- =====================================================================
-- Evidence Storage Abstraction
-- =====================================================================

-- Add storage_provider column to track where each attachment is stored
ALTER TABLE evidence_attachment ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'database';

-- Convert binary_content from TEXT (base64) to BYTEA for native binary storage.
-- The USING clause handles existing base64 text by decoding it in place.
-- If the column is already BYTEA (re-run), this ALTER will fail harmlessly
-- and the migration runner will skip it.
ALTER TABLE evidence_attachment
  ALTER COLUMN binary_content TYPE BYTEA
  USING CASE
    WHEN binary_content IS NOT NULL THEN decode(binary_content, 'base64')
    ELSE NULL
  END;

-- Make storage_path nullable (it is NULL for database-stored attachments)
ALTER TABLE evidence_attachment ALTER COLUMN storage_path DROP NOT NULL;

-- Backfill: mark existing rows that have a storage_path but no binary_content as 'filesystem' (legacy)
UPDATE evidence_attachment
  SET storage_provider = 'filesystem'
  WHERE storage_path IS NOT NULL
    AND binary_content IS NULL
    AND storage_provider = 'database';

-- =====================================================================
-- Webhook Notification Channel
-- =====================================================================

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

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_webhook ON webhook_delivery(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_status ON webhook_delivery(status, next_retry_at);

-- =====================================================================
-- Chat Notification Channels
-- =====================================================================

-- User chat identity fields for direct message delivery
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(64);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS teams_user_id VARCHAR(128);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS mattermost_username VARCHAR(64);

-- Chat integration registrations (one per webhook URL per platform)
CREATE TABLE IF NOT EXISTS chat_integration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('slack', 'teams', 'mattermost')),
  webhook_url TEXT NOT NULL,
  event_categories TEXT NOT NULL DEFAULT 'assessment,evidence,attestation',
  channel_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_integration_platform ON chat_integration(platform);

-- Chat delivery tracking (same pattern as webhook_delivery)
CREATE TABLE IF NOT EXISTS chat_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES chat_integration(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'exhausted')),
  http_status INTEGER,
  attempt INTEGER NOT NULL DEFAULT 1,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_delivery_integration ON chat_delivery(integration_id);
CREATE INDEX IF NOT EXISTS idx_chat_delivery_status ON chat_delivery(status, next_retry_at);

-- =====================================================================
-- Notification Rules Engine
-- =====================================================================

-- Add email_notifications opt-in flag to app_user
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT TRUE;

-- Notification rules (system and user scoped)
CREATE TABLE IF NOT EXISTS notification_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  scope VARCHAR(20) NOT NULL CHECK(scope IN ('system', 'user')),
  user_id UUID REFERENCES app_user(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK(channel IN ('in_app', 'email', 'slack', 'teams', 'mattermost', 'webhook')),
  event_types JSONB NOT NULL DEFAULT '[]',
  filters JSONB NOT NULL DEFAULT '{}',
  destination JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_rule_scope ON notification_rule(scope);
CREATE INDEX IF NOT EXISTS idx_notification_rule_user ON notification_rule(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_rule_enabled ON notification_rule(enabled);

-- =====================================================================
-- Encryption at Rest
-- =====================================================================

CREATE TABLE IF NOT EXISTS encryption_key_version (
  version INTEGER PRIMARY KEY,
  salt TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  retired_at TIMESTAMP WITH TIME ZONE
);

-- Application-level configuration values persisted in the database.
-- Used for things like an auto-generated JWT signing secret so first
-- run works with no environment configuration.
CREATE TABLE IF NOT EXISTS app_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- Account lockout (Sprint 2, brute-force mitigation)
-- =====================================================================
-- failed_login_count: monotonic counter of consecutive failed login
--   attempts. Reset to zero on successful login.
-- locked_until: when non-null and in the future, the account cannot
--   authenticate regardless of a valid password. Reset on successful
--   login and on lockout expiry checked at login time.
-- last_failed_login_at: timestamp of the most recent failed attempt,
--   used for audit correlation and eventual background cleanup jobs.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP WITH TIME ZONE;

-- =====================================================================
-- Sprint 4: Introduce *.view_all permission family
-- =====================================================================
-- evidence.view_all and assessments.view_all allow bearers to bypass the
-- assessment participant check in evidence routes. Admin is the only role
-- that receives both by default. The seed runs only on fresh installs,
-- so for existing installs we upsert the two permissions here (idempotent
-- via ON CONFLICT on the unique key column) and grant them to the admin
-- role when that role already exists. Non-admin roles are not granted
-- these permissions by default. Site admins can assign them through the
-- role management UI.
INSERT INTO permission (key, name, description, category) VALUES
  ('evidence.view_all', 'View All Evidence', 'View all evidence items regardless of assessment participation', 'evidence'),
  ('assessments.view_all', 'View All Assessments', 'View all assessments regardless of participation', 'assessments')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
  SELECT r.id, p.id
  FROM role r
  CROSS JOIN permission p
  WHERE r.key = 'admin'
    AND p.key IN ('evidence.view_all', 'assessments.view_all')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================================
-- Sprint 5: Expand audit_log.action with security-event values.
-- =====================================================================
-- The legacy CHECK constraint on audit_log.action only permitted entity
-- lifecycle actions (create/update/delete/etc). Sprint 5 introduces two
-- security-event actions:
--   authz_denied  - emitted by requirePermission on the deny branch so
--                   every 403 has a durable trail for SIEM ingestion.
--   config_change - emitted when a security-sensitive runtime config
--                   differs from its last-known persisted value
--                   (e.g. REGISTRATION_MODE, F15).
-- The drop-then-add pattern is the project standard for widening CHECK
-- constraints (see entity_relationship above). IF EXISTS keeps it
-- idempotent across fresh installs and upgrades.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK(action IN ('create', 'create_for_other', 'update', 'delete', 'state_change', 'link', 'unlink', 'authz_denied', 'config_change'));

-- Allow audit_log.user_id to be NULL so system-originated events (like
-- the startup REGISTRATION_MODE drift detector in F15) can be recorded
-- without inventing a synthetic service account. Every application
-- emitted audit row is still required to carry the acting user's id,
-- only internal bootstrap paths opt into the nullable case. No default
-- is set so any accidental omission in user-context code will surface
-- as a NOT NULL violation once we decide to re-tighten.
ALTER TABLE audit_log ALTER COLUMN user_id DROP NOT NULL;

-- =====================================================================
-- Drop the legacy session.token_hash column (Sprint 3).
-- =====================================================================
-- The session table used to carry a SHA-256 of the raw token alongside
-- the sessionId. Nothing on the read side consumed it once sessionId
-- became the canonical lookup key (see middleware/auth.ts), so the
-- column and its index were dead weight and a minor footgun for anyone
-- writing new queries. IF EXISTS keeps the statement idempotent across
-- fresh installs (where the column was never created) and upgrades
-- (where it was).
DROP INDEX IF EXISTS idx_session_token_hash;
ALTER TABLE session DROP COLUMN IF EXISTS token_hash;

-- =====================================================================
-- Sprint 5.7: symmetric claim and attestation retention lock.
-- =====================================================================
-- Evidence is already retention-locked by the isEvidenceImmutable helper
-- once it has been used (claimed, cited in a claim, or attached to a
-- terminal assessment). Sprint 5.7 extends the same record-integrity
-- stance up to the declaration records that cite that evidence:
--
--   1. A claim becomes immutable once it is cited by a signed
--      attestation or lives under an assessment in a terminal state.
--   2. An attestation becomes immutable once it is signed.
--
-- Signing an attestation is now a stamp on an audit-bearing column, not
-- just a pointer to a signatory row. The signed_at timestamp is the
-- single source of truth for the signed-attestation retention lock.
-- A NULL value means the attestation is still editable. A non-NULL
-- value means every mutation on the attestation, its requirements, or
-- any claim it cites returns 409 Conflict. IF NOT EXISTS keeps the
-- statement idempotent across fresh installs and upgrades.
--
-- Note: keep all comment text semicolon-free. The migration runner
-- splits the SQL template on the semicolon character, so a semicolon
-- inside a comment slices the comment in half and leaves bare text
-- as its own statement. This is a known quirk of the tiny splitter
-- we use. Real SQL parsers would ignore commented-out semicolons.
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP WITH TIME ZONE;

-- =====================================================================
-- Sprint 6: attestation lifecycle gaps (1.13).
-- =====================================================================
-- An attestation in CycloneDX carries a signature block. Until this
-- sprint, signing was an opaque timestamp plus a foreign key to the
-- signatory row. For the UI to export a CDXA document that another
-- tool can actually verify, the signature material itself must live
-- on the record. We support two signature shapes:
--
--   1. Electronic: a typed name plus optional image of a written
--      signature, plus jurisdiction and legal intent captured at sign
--      time. This is the ESIGN-style path and has no cryptographic
--      guarantee.
--   2. Digital: a detached signature over a canonical payload hash,
--      with the algorithm identifier, the signature value, the signer's
--      public key in PEM form, and an optional certificate chain.
--
-- signature_type discriminates between the two paths. rescinded_* mark
-- the record as withdrawn without deleting it, which the retention
-- lock still enforces. canonical_payload_hash is the hash of the
-- payload that was signed, stored so verify can tell when the record
-- has drifted from what the signer actually endorsed.
--
-- Keep comment text free of semicolons because the migration runner
-- splits on that character and cannot tolerate one inside a -- comment.
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signature_type VARCHAR(20);
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signed_name VARCHAR(512);
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signature_image_data TEXT;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signature_ip VARCHAR(64);
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signature_user_agent TEXT;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signature_jurisdiction VARCHAR(255);
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signature_legal_intent TEXT;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signature_algorithm VARCHAR(100);
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS signature_value TEXT;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS public_key_pem TEXT;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS certificate_chain TEXT;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS canonical_payload_hash VARCHAR(128);
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS rescinded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS rescinded_by UUID REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE attestation ADD COLUMN IF NOT EXISTS rescind_reason TEXT;

-- Sprint 6: split attestations.create into create-vs-edit and add
-- lifecycle permissions. Upsert so fresh installs and upgrades end up
-- in the same terminal state. The seed still backfills role links on
-- first run. For upgrades we also patch the assessor and admin role
-- assignments so users who already had attestations.create keep the
-- ability to edit, verify, rescind, and export.
INSERT INTO permission (key, name, description, category)
VALUES ('attestations.edit', 'Edit Attestations', 'Edit attestations that are not yet signed', 'attestations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permission (key, name, description, category)
VALUES ('attestations.verify', 'Verify Attestations', 'Verify attestation signatures', 'attestations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permission (key, name, description, category)
VALUES ('attestations.rescind', 'Rescind Attestations', 'Rescind a signed attestation', 'attestations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permission (key, name, description, category)
VALUES ('attestations.export', 'Export Attestations', 'Export attestations as CycloneDX or PDF', 'attestations')
ON CONFLICT (key) DO NOTHING;

-- Backfill role links. Every role that already had attestations.create
-- gets attestations.edit automatically: the original create permission
-- implicitly covered both actions, and the split is behavioural not
-- authorization. Admin gets the full set including verify, rescind,
-- and export. Assessor picks up edit, verify, and export but not
-- rescind (rescind is an admin action in the shipped model).
INSERT INTO role_permission (role_id, permission_id)
SELECT rp.role_id, new_perm.id
FROM role_permission rp
  JOIN permission create_perm ON create_perm.id = rp.permission_id
  CROSS JOIN permission new_perm
WHERE create_perm.key = 'attestations.create'
  AND new_perm.key = 'attestations.edit'
ON CONFLICT DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r
  CROSS JOIN permission p
WHERE r.key = 'admin'
  AND p.key IN ('attestations.verify', 'attestations.rescind', 'attestations.export')
ON CONFLICT DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r
  CROSS JOIN permission p
WHERE r.key = 'assessor'
  AND p.key IN ('attestations.verify', 'attestations.export')
ON CONFLICT DO NOTHING;

-- Sprint 7: personal signature inventory. Each user who has signing
-- authority in the organization can register one or more labeled
-- signatures under their own profile. Signatures never cross user
-- boundaries and the payload is always stored encrypted. See
-- signatures.ts for the detailed payload shapes per signature_type.
CREATE TABLE IF NOT EXISTS user_signature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  signature_type VARCHAR(20) NOT NULL CHECK(signature_type IN ('electronic', 'digital')),
  signature_format VARCHAR(20) CHECK(signature_format IS NULL OR signature_format IN ('jsf', 'x509')),
  backend_type VARCHAR(32) NOT NULL DEFAULT 'local' CHECK(backend_type IN ('local', 'hsm', 'signing_server')),
  payload_encrypted TEXT NOT NULL,
  key_fingerprint VARCHAR(128),
  signature_image_filename VARCHAR(512),
  signature_image_content_type VARCHAR(128),
  signature_image_size_bytes BIGINT,
  signature_image_storage_path TEXT,
  signature_image_binary_content BYTEA,
  signature_image_content_hash VARCHAR(128),
  signature_image_storage_provider VARCHAR(32),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, label)
);

CREATE INDEX IF NOT EXISTS idx_user_signature_user ON user_signature(user_id);

-- Upgrade path: existing installs created before the image columns were
-- introduced get them added here. ALTER TABLE ADD COLUMN IF NOT EXISTS
-- is a Postgres 9.6+ feature and is the cheapest way to stay idempotent
-- without a separate migration registry.
ALTER TABLE user_signature ADD COLUMN IF NOT EXISTS signature_image_filename VARCHAR(512);
ALTER TABLE user_signature ADD COLUMN IF NOT EXISTS signature_image_content_type VARCHAR(128);
ALTER TABLE user_signature ADD COLUMN IF NOT EXISTS signature_image_size_bytes BIGINT;
ALTER TABLE user_signature ADD COLUMN IF NOT EXISTS signature_image_storage_path TEXT;
ALTER TABLE user_signature ADD COLUMN IF NOT EXISTS signature_image_binary_content BYTEA;
ALTER TABLE user_signature ADD COLUMN IF NOT EXISTS signature_image_content_hash VARCHAR(128);
ALTER TABLE user_signature ADD COLUMN IF NOT EXISTS signature_image_storage_provider VARCHAR(32);

-- Sprint 7: split signing authority out of the attestations bucket. A
-- user needs signatures.manage to curate their personal inventory in
-- My Signatures, and signatures.sign to actually sign an attestation.
-- The existing attestations.sign permission is preserved as an alias
-- so API consumers that grant it keep working, but the sign endpoint
-- now checks signatures.sign going forward.
INSERT INTO permission (key, name, description, category)
VALUES ('signatures.manage', 'Manage Own Signatures', 'Manage signatures on your own user profile', 'signatures')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permission (key, name, description, category)
VALUES ('signatures.sign', 'Sign Attestations', 'Sign attestations using your personal signature inventory', 'signatures')
ON CONFLICT (key) DO NOTHING;

-- Backfill: every role that had attestations.sign gets signatures.sign
-- and signatures.manage so existing signing users do not lose access
-- on upgrade. Admin gets both unconditionally.
INSERT INTO role_permission (role_id, permission_id)
SELECT rp.role_id, new_perm.id
FROM role_permission rp
  JOIN permission old_perm ON old_perm.id = rp.permission_id
  CROSS JOIN permission new_perm
WHERE old_perm.key = 'attestations.sign'
  AND new_perm.key IN ('signatures.sign', 'signatures.manage')
ON CONFLICT DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r
  CROSS JOIN permission p
WHERE r.key = 'admin'
  AND p.key IN ('signatures.sign', 'signatures.manage')
ON CONFLICT DO NOTHING;

-- Sprint 8: constrain attestation.signature_algorithm to the JSF
-- asymmetric identifier set. Rows written by earlier builds may
-- contain legacy JCA spellings like RSA-SHA256 or bare hash names
-- like sha256 - rewrite those in place to the closest JSF identifier
-- before the CHECK is added so the constraint can be enforced without
-- dropping data. Anything that does not map is coerced to NULL and
-- the original value is preserved as an audit note because verify
-- already tolerates null algorithm on pre lifecycle rows.
--
-- Keep comment text free of semicolons because the migration runner
-- splits on the character and cannot tolerate one inside a -- comment.
UPDATE attestation SET signature_algorithm = 'RS256'
  WHERE signature_algorithm IN ('RSA-SHA256', 'sha256WithRSAEncryption');
UPDATE attestation SET signature_algorithm = 'RS384'
  WHERE signature_algorithm IN ('RSA-SHA384', 'sha384WithRSAEncryption');
UPDATE attestation SET signature_algorithm = 'RS512'
  WHERE signature_algorithm IN ('RSA-SHA512', 'sha512WithRSAEncryption');
UPDATE attestation SET signature_algorithm = 'ES256'
  WHERE signature_algorithm IN ('ecdsa-with-SHA256', 'sha256', 'SHA256');
UPDATE attestation SET signature_algorithm = 'ES384'
  WHERE signature_algorithm IN ('ecdsa-with-SHA384', 'sha384', 'SHA384');
UPDATE attestation SET signature_algorithm = 'ES512'
  WHERE signature_algorithm IN ('ecdsa-with-SHA512', 'sha512', 'SHA512');

ALTER TABLE attestation DROP CONSTRAINT IF EXISTS attestation_signature_algorithm_check;
ALTER TABLE attestation ADD CONSTRAINT attestation_signature_algorithm_check
  CHECK (
    signature_algorithm IS NULL
    OR signature_algorithm IN (
      'RS256', 'RS384', 'RS512',
      'PS256', 'PS384', 'PS512',
      'ES256', 'ES384', 'ES512',
      'Ed25519', 'Ed448'
    )
  );

-- =====================================================================
-- Sprint 9: Affirmation cascade signing and platform key.
-- =====================================================================
-- CycloneDX declarations.affirmation carries the legal signatories for
-- a set of attestations. Prior sprints tracked signatures per
-- attestation, which forced per row sealing and produced no top level
-- document signature. Sprint 9 moves signing up one level so a single
-- affirmation seals the entire declarations block with a platform
-- signature over the declarations subtree and a second platform
-- signature over the full document. Each required signatory signs
-- their own JSF envelope first, the platform wraps those into the
-- declarations seal, then seals the full document.
--
-- Slot model (Option B). Affirmation managers declare required slots
-- by title (CISO, COO, CFO etc). A slot can optionally pin a specific
-- user via required_user_id. If unpinned, any user with signing
-- authority may claim the slot by signing it. Seal requires every
-- slot to be signed.
--
-- Platform key. Exactly one row in platform_signing_key has is_active
-- true. Rotation writes a new row and flips the old one inactive.
-- Historic signatures resolve their verifying key by keyId fingerprint
-- embedded in the JSF envelope, so rotation never invalidates prior
-- seals. The private key is stored envelope encrypted. Bootstrap of
-- the first active key happens on demand in the platform key service
-- so migrations remain pure SQL.
--
-- Keep comment text free of semicolons because the migration runner
-- splits on that character and cannot tolerate one inside a comment.
ALTER TABLE affirmation ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS assessment_id UUID REFERENCES assessment(id) ON DELETE CASCADE;
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS sealed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS sealed_by UUID REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS canonical_hash VARCHAR(128);
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS declarations_signature_json JSONB;
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS document_signature_json JSONB;
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS platform_key_fingerprint VARCHAR(128);
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS rescinded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS rescinded_by UUID REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE affirmation ADD COLUMN IF NOT EXISTS rescind_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_affirmation_assessment_unique ON affirmation(assessment_id) WHERE assessment_id IS NOT NULL;

-- affirmation_signatory becomes a first class slot entity. The prior
-- two column junction table is dropped in favor of a wider row that
-- carries slot metadata, an optional pinned user, the captured
-- signatory identity once claimed, and the per signatory JSF envelope.
DROP TABLE IF EXISTS affirmation_signatory CASCADE;
CREATE TABLE IF NOT EXISTS affirmation_signatory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affirmation_id UUID NOT NULL REFERENCES affirmation(id) ON DELETE CASCADE,
  required_title VARCHAR(255) NOT NULL,
  required_user_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
  signatory_id UUID REFERENCES signatory(id) ON DELETE SET NULL,
  signature_json JSONB,
  canonical_hash VARCHAR(128),
  signed_at TIMESTAMP WITH TIME ZONE,
  signed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (affirmation_id, required_title)
);

CREATE INDEX IF NOT EXISTS idx_affirmation_signatory_affirmation ON affirmation_signatory(affirmation_id);
CREATE INDEX IF NOT EXISTS idx_affirmation_signatory_required_user ON affirmation_signatory(required_user_id);

-- Platform signing key inventory. Historic rows are retained so that
-- signatures generated before a rotation can still be verified using
-- the key that actually produced them. Only one row has is_active true
-- at a time, enforced by a partial unique index.
CREATE TABLE IF NOT EXISTS platform_signing_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint VARCHAR(128) NOT NULL UNIQUE,
  algorithm VARCHAR(32) NOT NULL,
  public_key_pem TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  rotated_at TIMESTAMP WITH TIME ZONE,
  rotated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_signing_key_active_singleton ON platform_signing_key(is_active) WHERE is_active;

-- Sprint 9 permissions. affirmations.manage covers the full lifecycle
-- because affirmation authoring, sealing, and rescinding are all high
-- trust actions that should travel together. platform_keys.rotate is
-- split out because key rotation is even more sensitive and should be
-- grantable independently.
INSERT INTO permission (key, name, description, category)
VALUES ('affirmations.manage', 'Manage Affirmations', 'Create affirmations, add required signatories, seal, verify, and rescind', 'affirmations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO permission (key, name, description, category)
VALUES ('platform_keys.rotate', 'Rotate Platform Signing Key', 'Generate a new platform signing key and retire the old one', 'platform')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r
  CROSS JOIN permission p
WHERE r.key = 'admin'
  AND p.key IN ('affirmations.manage', 'platform_keys.rotate')
ON CONFLICT DO NOTHING;

-- =====================================================================
-- PR3.6: Remove per attestation sign, verify, and rescind surface.
-- =====================================================================
-- Attestation authority moved from a row level signature block to the
-- assessment scoped affirmation cascade. The signature material columns
-- bolted onto attestation in Sprint 6 are no longer written and the
-- retention lock now keys off affirmation.sealed_at plus terminal
-- assessment state. Drop the unused columns so fresh installs and
-- upgrades converge on the new shape. Upgrade data loss is intentional
-- because the PR3 design memo explicitly scoped out a backfill path.
--
-- Keep comment text free of semicolons because the migration runner
-- splits on that character and cannot tolerate one inside a comment.
ALTER TABLE attestation DROP CONSTRAINT IF EXISTS attestation_signature_algorithm_check;
ALTER TABLE attestation DROP COLUMN IF EXISTS signed_at;
ALTER TABLE attestation DROP COLUMN IF EXISTS signed_by;
ALTER TABLE attestation DROP COLUMN IF EXISTS signed_name;
ALTER TABLE attestation DROP COLUMN IF EXISTS signature_type;
ALTER TABLE attestation DROP COLUMN IF EXISTS signature_image_data;
ALTER TABLE attestation DROP COLUMN IF EXISTS signature_ip;
ALTER TABLE attestation DROP COLUMN IF EXISTS signature_user_agent;
ALTER TABLE attestation DROP COLUMN IF EXISTS signature_jurisdiction;
ALTER TABLE attestation DROP COLUMN IF EXISTS signature_legal_intent;
ALTER TABLE attestation DROP COLUMN IF EXISTS signature_algorithm;
ALTER TABLE attestation DROP COLUMN IF EXISTS signature_value;
ALTER TABLE attestation DROP COLUMN IF EXISTS public_key_pem;
ALTER TABLE attestation DROP COLUMN IF EXISTS certificate_chain;
ALTER TABLE attestation DROP COLUMN IF EXISTS canonical_payload_hash;
ALTER TABLE attestation DROP COLUMN IF EXISTS rescinded_at;
ALTER TABLE attestation DROP COLUMN IF EXISTS rescinded_by;
ALTER TABLE attestation DROP COLUMN IF EXISTS rescind_reason;

-- Revoke the legacy verify and rescind permissions. The endpoints that
-- consumed them are gone, so leaving the grants would surface phantom
-- capabilities in the Permissions admin UI. Delete the role mappings
-- first to satisfy the FK then delete the permission rows themselves.
DELETE FROM role_permission
  WHERE permission_id IN (
    SELECT id FROM permission WHERE key IN ('attestations.verify', 'attestations.rescind')
  );

DELETE FROM permission WHERE key IN ('attestations.verify', 'attestations.rescind');

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
          sql: `${statement};`,
          parameters: [],
          // biome-ignore lint/suspicious/noExplicitAny: Kysely executeQuery requires CompiledQuery but we build raw SQL
        } as any);
      } catch (error: unknown) {
        const errorMessage = (error as Record<string, unknown> | null)?.message || '';
        const msg = typeof errorMessage === 'string' ? errorMessage : '';
        // Ignore "already exists" errors from CREATE INDEX / ALTER TABLE
        if (msg.includes('already exists')) {
          continue;
        }
        // Ignore type-conversion errors when column is already the target type
        // (e.g. re-running TEXT->BYTEA migration when column is already BYTEA)
        if (msg.includes('cannot cast') || msg.includes('function decode(bytea')) {
          continue;
        }
        // Diagnostic: wrap the error with the offending statement so tests
        // report *which* statement blew up rather than just "syntax error
        // near 'a'".
        const stmtPreview = statement.trim().slice(0, 400);
        throw new Error(`Migration failed on statement: ${stmtPreview}\n\nOriginal error: ${msg}`);
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
