import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface Organization {
  id: Generated<string>;
  name: string;
  country?: string | null;
  region?: string | null;
  locality?: string | null;
  post_office_box_number?: string | null;
  postal_code?: string | null;
  street_address?: string | null;
  website?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Contact {
  id: Generated<string>;
  name: string;
  email: string;
  phone?: string | null;
  organization_id?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface License {
  id: Generated<string>;
  name: string;
  text?: string | null;
  url?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Standard {
  id: Generated<string>;
  identifier: string;
  name: string;
  description?: string | null;
  owner?: string | null;
  version?: string | null;
  license_id?: string | null;
  state: 'draft' | 'in_review' | 'published' | 'retired';
  authored_by?: string | null;
  approved_by?: string | null;
  approved_at?: Date | null;
  submitted_at?: Date | null;
  is_imported: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Requirement {
  id: Generated<string>;
  identifier: string;
  name: string;
  parent_id?: string | null;
  description?: string | null;
  open_cre?: string | null;
  standard_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Level {
  id: Generated<string>;
  identifier: string;
  title?: string | null;
  description?: string | null;
  standard_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LevelRequirement {
  level_id: string;
  requirement_id: string;
  created_at?: Generated<Date>;
}

export interface Project {
  id: Generated<string>;
  name: string;
  description?: string | null;
  state: 'new' | 'in_progress' | 'on_hold' | 'complete' | 'operational' | 'retired';
  workflow_type: 'claims_driven' | 'evidence_driven';
  archived_at?: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProjectStandard {
  project_id: string;
  standard_id: string;
  created_at: Generated<Date>;
}

export interface Permission {
  id: Generated<string>;
  key: string;
  name: string;
  description?: string | null;
  category: string;
  created_at: Generated<Date>;
}

export interface Role {
  id: Generated<string>;
  key: string;
  name: string;
  description?: string | null;
  is_system: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
  created_at: Generated<Date>;
}

export interface AppUser {
  id: Generated<string>;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: 'admin' | 'assessor' | 'assessee' | 'standards_manager' | 'standards_approver';
  role_id?: string | null;
  is_active: boolean;
  has_completed_onboarding: boolean;
  last_login_at?: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Assessment {
  id: Generated<string>;
  title: string;
  description?: string | null;
  project_id?: string | null;
  entity_id?: string | null;
  standard_id?: string | null;
  conformance_score?: number | null;
  due_date?: Date | null;
  start_date?: Date | null;
  end_date?: Date | null;
  state: 'new' | 'pending' | 'in_progress' | 'on_hold' | 'cancelled' | 'complete';
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AssessmentAssessor {
  assessment_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export interface AssessmentAssessee {
  assessment_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export interface AssessmentRequirement {
  id: Generated<string>;
  assessment_id: string;
  requirement_id: string;
  evidence_id?: string | null;
  result?: 'yes' | 'no' | 'partial' | 'not_applicable' | null;
  rationale?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Evidence {
  id: Generated<string>;
  bom_ref?: string | null;
  name: string;
  property_name?: string | null;
  description?: string | null;
  state: 'in_review' | 'in_progress' | 'claimed' | 'expired';
  author_id: string;
  reviewer_id?: string | null;
  expires_on?: Date | null;
  is_counter_evidence: boolean;
  classification?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EvidenceNote {
  id: Generated<string>;
  evidence_id: string;
  user_id: string;
  content: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EvidenceAttachment {
  id: Generated<string>;
  evidence_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Claim {
  id: Generated<string>;
  bom_ref?: string | null;
  name: string;
  target: string;
  predicate: string;
  reasoning?: string | null;
  is_counter_claim: boolean;
  attestation_id?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ClaimEvidence {
  claim_id: string;
  evidence_id: string;
  created_at: Generated<Date>;
}

export interface ClaimCounterEvidence {
  claim_id: string;
  evidence_id: string;
  created_at: Generated<Date>;
}

export interface ClaimMitigationStrategy {
  claim_id: string;
  evidence_id: string;
  created_at: Generated<Date>;
}

export interface Attestation {
  id: Generated<string>;
  summary?: string | null;
  assessment_id: string;
  signatory_id?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AttestationRequirement {
  id: Generated<string>;
  attestation_id: string;
  requirement_id: string;
  conformance_score: number;
  conformance_rationale: string;
  confidence_score?: number | null;
  confidence_rationale?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AttestationRequirementMitigation {
  attestation_requirement_id: string;
  evidence_id: string;
  created_at: Generated<Date>;
}

export interface Signatory {
  id: Generated<string>;
  name: string;
  role?: string | null;
  organization_id?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Affirmation {
  id: Generated<string>;
  statement: string;
  project_id: string;
  entity_id?: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AffirmationSignatory {
  affirmation_id: string;
  signatory_id: string;
  created_at: Generated<Date>;
}

export interface Tag {
  id: Generated<string>;
  name: string;
  color: string;
  created_at: Generated<Date>;
}

export interface ProjectTag {
  project_id: string;
  tag_id: string;
  created_at: Generated<Date>;
}

export interface AssessmentTag {
  assessment_id: string;
  tag_id: string;
  created_at: Generated<Date>;
}

export interface EvidenceTag {
  evidence_id: string;
  tag_id: string;
  created_at: Generated<Date>;
}

export interface AssessmentRequirementEvidence {
  assessment_requirement_id: string;
  evidence_id: string;
  created_at: Generated<Date>;
}

export interface WorkNote {
  id: Generated<string>;
  assessment_requirement_id: string;
  user_id: string;
  content: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AuditLog {
  id: Generated<string>;
  entity_type: string;
  entity_id: string;
  action: 'create' | 'update' | 'delete' | 'state_change' | 'link' | 'unlink';
  user_id: string;
  changes?: any;
  created_at: Generated<Date>;
}

export interface Notification {
  id: Generated<string>;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  is_read: boolean;
  created_at: Generated<Date>;
}

export interface ApiKey {
  id: Generated<string>;
  name: string;
  prefix: string;
  key_hash: string;
  user_id: string;
  expires_at?: Date | null;
  last_used_at?: Date | null;
  created_at: Generated<Date>;
}

export interface Session {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  ip_address?: string | null;
  user_agent?: string | null;
  expires_at: Date;
  created_at: Generated<Date>;
}

export interface Entity {
  id: Generated<string>;
  name: string;
  description?: string | null;
  entity_type: 'organization' | 'business_unit' | 'team' | 'product' | 'product_version' | 'component' | 'supplier' | 'project';
  state: 'active' | 'inactive' | 'archived';
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EntityRelationship {
  id: Generated<string>;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: 'owns' | 'supplies' | 'depends_on' | 'governs' | 'contains' | 'consumes';
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EntityTag {
  entity_id: string;
  tag_id: string;
  created_at: Generated<Date>;
}

export interface EntityStandard {
  entity_id: string;
  standard_id: string;
  created_at: Generated<Date>;
}

export interface CompliancePolicy {
  id: Generated<string>;
  entity_id: string;
  standard_id: string;
  description?: string | null;
  is_inherited: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Dashboard {
  id: Generated<string>;
  name: string;
  description?: string | null;
  owner_id: string;
  is_default: Generated<boolean>;
  is_shared: Generated<boolean>;
  layout: any; // JSONB: array of widget layout items
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  permission: Selectable<Permission>;
  permission_insert: Insertable<Permission>;

  role: Selectable<Role>;
  role_insert: Insertable<Role>;
  role_update: Updateable<Role>;

  role_permission: Selectable<RolePermission>;
  role_permission_insert: Insertable<RolePermission>;

  organization: Selectable<Organization>;
  organization_insert: Insertable<Organization>;
  organization_update: Updateable<Organization>;

  contact: Selectable<Contact>;
  contact_insert: Insertable<Contact>;
  contact_update: Updateable<Contact>;

  license: Selectable<License>;
  license_insert: Insertable<License>;
  license_update: Updateable<License>;

  standard: Selectable<Standard>;
  standard_insert: Insertable<Standard>;
  standard_update: Updateable<Standard>;

  requirement: Selectable<Requirement>;
  requirement_insert: Insertable<Requirement>;
  requirement_update: Updateable<Requirement>;

  level: Selectable<Level>;
  level_insert: Insertable<Level>;
  level_update: Updateable<Level>;

  level_requirement: Selectable<LevelRequirement>;
  level_requirement_insert: Insertable<LevelRequirement>;

  project: Selectable<Project>;
  project_insert: Insertable<Project>;
  project_update: Updateable<Project>;

  project_standard: Selectable<ProjectStandard>;
  project_standard_insert: Insertable<ProjectStandard>;

  app_user: Selectable<AppUser>;
  app_user_insert: Insertable<AppUser>;
  app_user_update: Updateable<AppUser>;

  assessment: Selectable<Assessment>;
  assessment_insert: Insertable<Assessment>;
  assessment_update: Updateable<Assessment>;

  assessment_assessor: Selectable<AssessmentAssessor>;
  assessment_assessor_insert: Insertable<AssessmentAssessor>;

  assessment_assessee: Selectable<AssessmentAssessee>;
  assessment_assessee_insert: Insertable<AssessmentAssessee>;

  assessment_requirement: Selectable<AssessmentRequirement>;
  assessment_requirement_insert: Insertable<AssessmentRequirement>;
  assessment_requirement_update: Updateable<AssessmentRequirement>;

  evidence: Selectable<Evidence>;
  evidence_insert: Insertable<Evidence>;
  evidence_update: Updateable<Evidence>;

  evidence_note: Selectable<EvidenceNote>;
  evidence_note_insert: Insertable<EvidenceNote>;

  evidence_attachment: Selectable<EvidenceAttachment>;
  evidence_attachment_insert: Insertable<EvidenceAttachment>;

  claim: Selectable<Claim>;
  claim_insert: Insertable<Claim>;
  claim_update: Updateable<Claim>;

  claim_evidence: Selectable<ClaimEvidence>;
  claim_evidence_insert: Insertable<ClaimEvidence>;

  claim_counter_evidence: Selectable<ClaimCounterEvidence>;
  claim_counter_evidence_insert: Insertable<ClaimCounterEvidence>;

  claim_mitigation_strategy: Selectable<ClaimMitigationStrategy>;
  claim_mitigation_strategy_insert: Insertable<ClaimMitigationStrategy>;

  attestation: Selectable<Attestation>;
  attestation_insert: Insertable<Attestation>;
  attestation_update: Updateable<Attestation>;

  attestation_requirement: Selectable<AttestationRequirement>;
  attestation_requirement_insert: Insertable<AttestationRequirement>;
  attestation_requirement_update: Updateable<AttestationRequirement>;

  attestation_requirement_mitigation: Selectable<AttestationRequirementMitigation>;
  attestation_requirement_mitigation_insert: Insertable<AttestationRequirementMitigation>;

  signatory: Selectable<Signatory>;
  signatory_insert: Insertable<Signatory>;
  signatory_update: Updateable<Signatory>;

  affirmation: Selectable<Affirmation>;
  affirmation_insert: Insertable<Affirmation>;
  affirmation_update: Updateable<Affirmation>;

  affirmation_signatory: Selectable<AffirmationSignatory>;
  affirmation_signatory_insert: Insertable<AffirmationSignatory>;

  tag: Selectable<Tag>;
  tag_insert: Insertable<Tag>;

  project_tag: Selectable<ProjectTag>;
  project_tag_insert: Insertable<ProjectTag>;

  assessment_tag: Selectable<AssessmentTag>;
  assessment_tag_insert: Insertable<AssessmentTag>;

  evidence_tag: Selectable<EvidenceTag>;
  evidence_tag_insert: Insertable<EvidenceTag>;

  assessment_requirement_evidence: Selectable<AssessmentRequirementEvidence>;
  assessment_requirement_evidence_insert: Insertable<AssessmentRequirementEvidence>;

  work_note: Selectable<WorkNote>;
  work_note_insert: Insertable<WorkNote>;

  audit_log: Selectable<AuditLog>;
  audit_log_insert: Insertable<AuditLog>;

  notification: Selectable<Notification>;
  notification_insert: Insertable<Notification>;

  api_key: Selectable<ApiKey>;
  api_key_insert: Insertable<ApiKey>;
  api_key_update: Updateable<ApiKey>;

  session: Selectable<Session>;
  session_insert: Insertable<Session>;
  session_update: Updateable<Session>;

  entity: Selectable<Entity>;
  entity_insert: Insertable<Entity>;
  entity_update: Updateable<Entity>;

  entity_relationship: Selectable<EntityRelationship>;
  entity_relationship_insert: Insertable<EntityRelationship>;
  entity_relationship_update: Updateable<EntityRelationship>;

  entity_tag: Selectable<EntityTag>;
  entity_tag_insert: Insertable<EntityTag>;

  entity_standard: Selectable<EntityStandard>;
  entity_standard_insert: Insertable<EntityStandard>;

  compliance_policy: Selectable<CompliancePolicy>;
  compliance_policy_insert: Insertable<CompliancePolicy>;
  compliance_policy_update: Updateable<CompliancePolicy>;

  dashboard: Selectable<Dashboard>;
  dashboard_insert: Insertable<Dashboard>;
  dashboard_update: Updateable<Dashboard>;
}
