import client from './client'

// All /api/v1 responses pass through the backend's camelCaseResponse
// middleware, so the shapes here intentionally mirror camelCase even
// though the underlying Postgres columns are snake_case. Keep this in
// sync with the server DTOs in backend/src/routes/assessors.ts.
export interface Assessor {
  id: string
  bomRef: string
  thirdParty: boolean
  entityId: string | null
  userId: string | null
  entityName: string | null
  entityType: string | null
  userDisplayName: string | null
  createdAt: string
  updatedAt: string
}

export interface AssessorAttestation {
  id: string
  summary: string | null
  assessmentId: string
  assessmentTitle: string | null
  createdAt: string
}

export interface AssessorDetail extends Assessor {
  attestations: AssessorAttestation[]
}

export interface CreateAssessorPayload {
  thirdParty: boolean
  entityId?: string | null
  userId?: string | null
}

export type UpdateAssessorPayload = Partial<CreateAssessorPayload>

export async function listAssessors(): Promise<Assessor[]> {
  const { data } = await client.get('/assessors')
  return data.data ?? []
}

export async function getAssessor(id: string): Promise<AssessorDetail> {
  const { data } = await client.get(`/assessors/${encodeURIComponent(id)}`)
  return data
}

export async function createAssessor(payload: CreateAssessorPayload): Promise<{ id: string; bomRef: string }> {
  const { data } = await client.post('/assessors', payload)
  return data
}

export async function updateAssessor(id: string, payload: UpdateAssessorPayload): Promise<void> {
  await client.put(`/assessors/${encodeURIComponent(id)}`, payload)
}

export async function deleteAssessor(id: string): Promise<void> {
  await client.delete(`/assessors/${encodeURIComponent(id)}`)
}
