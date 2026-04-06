// Shared TypeScript types for all entities

export interface User {
  id: string
  username: string
  email: string
  displayName: string
  role: 'admin' | 'assessor' | 'assessee' | 'standards_manager' | 'standards_approver'
  active: boolean
  hasCompletedOnboarding?: boolean
  lastLogin?: string
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description: string
  state: ProjectState
  standards: Standard[]
  createdAt: string
  updatedAt: string
  createdBy: string
}

export type ProjectState = 'new' | 'in_progress' | 'on_hold' | 'complete' | 'operational' | 'retired'
export type WorkflowType = 'evidence_based' | 'interview_based' | 'mixed'

export interface Standard {
  id: string
  name: string
  version: string
  description: string
  owner: string
  requirementsCount: number
  requirements: Requirement[]
  createdAt: string
}

export interface Requirement {
  id: string
  identifier: string
  name: string
  description: string
  openCre: string | null
  parentId: string | null
  standardId: string
}

export interface Level {
  id: string
  identifier: string
  title: string | null
  description: string | null
  standardId: string
}

export interface Assessment {
  id: string
  title: string
  description: string
  projectId: string
  project?: Project
  entityId?: string | null
  entity?: Entity
  standardId?: string | null
  standard?: Standard
  state: AssessmentState
  startDate: string
  endDate?: string
  dueDate: string
  assessors: User[]
  assessees: User[]
  requirementCount: number
  completedCount: number
  progress: number
  conformanceScore?: number | null
  createdAt: string
}

export type AssessmentState = 'new' | 'pending' | 'in_progress' | 'on_hold' | 'complete' | 'cancelled'

export interface AssessmentRequirement {
  id: string
  assessmentId: string
  requirementId: string
  requirement?: Requirement
  result?: 'yes' | 'no' | 'na'
  rationale: string
  evidenceLink?: string
  status: 'pending' | 'assessed' | 'confirmed'
}

export interface Evidence {
  id: string
  name: string
  description: string
  state: EvidenceState
  classification: string
  author: string
  reviewer?: string
  isCounterEvidence: boolean
  createdAt: string
  updatedAt: string
  expiresAt?: string
  attachments: Attachment[]
}

export type EvidenceState = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'archived'

export interface Attachment {
  id: string
  filename: string
  contentType: string
  size: number
  url: string
  uploadedAt: string
}

export interface Claim {
  id: string
  name: string
  target: string
  predicate: string
  evidenceCount: number
  isCounterClaim: boolean
  attestationId?: string
}

export interface Attestation {
  id: string
  summary: string
  assessmentId: string
  assessment?: Assessment
  signatories: Signatory[]
  requirementMappings: AttestationRequirement[]
  conformanceScore: number
  confidenceScore: number
  createdAt: string
}

export interface AttestationRequirement {
  id: string
  attestationId: string
  requirementId: string
  requirement?: Requirement
  conformanceScore: number
  confidenceScore: number
  affirmations: Affirmation[]
}

export interface Signatory {
  id: string
  name: string
  title: string
  organization: string
  email: string
  signatureDate?: string
}

export interface Affirmation {
  id: string
  statement: string
  confidenceLevel: 'high' | 'medium' | 'low'
  supportingEvidence: string[]
}

export interface WorkNote {
  id: string
  assessmentId: string
  author: string
  content: string
  createdAt: string
  updatedAt?: string
}

// Entity types for flexible hierarchy model
export type EntityType = 'organization' | 'business_unit' | 'team' | 'product' | 'product_version' | 'component' | 'service' | 'project'
export type EntityState = 'active' | 'inactive' | 'archived'
export type RelationshipType = 'owns' | 'supplies' | 'depends_on' | 'governs' | 'contains' | 'consumes' | 'assesses' | 'produces'

export interface Entity {
  id: string
  name: string
  description: string | null
  entityType: EntityType
  state: EntityState
  tags?: Tag[]
  standards?: Standard[]
  childCount?: number
  assessmentCount?: number
  createdAt: string
  updatedAt: string
}

export interface EntityRelationship {
  id: string
  sourceEntityId: string
  targetEntityId: string
  relationshipType: RelationshipType
  sourceEntity?: Entity
  targetEntity?: Entity
  createdAt: string
}

export interface CompliancePolicy {
  id: string
  entityId: string
  standardId: string
  description: string | null
  isInherited: boolean
  standard?: Standard
  entity?: Entity
  createdAt: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface AssessmentProgress {
  standardName: string
  standardVersion: string
  assessments: {
    id: string
    title: string
    completedAt: string
    conformanceScore: number | null
    state: AssessmentState
  }[]
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
