import client from './client'
import type { Assessment, AssessmentRequirement, PaginatedResponse } from '@/types'

export async function getAssessments(page = 1, pageSize = 20): Promise<PaginatedResponse<Assessment>> {
  const { data } = await client.get('/assessments', { params: { page, pageSize } })
  return data
}

export async function getAssessment(id: string): Promise<Assessment> {
  const { data } = await client.get(`/assessments/${id}`)
  return data
}

export async function createAssessment(assessment: Omit<Assessment, 'id' | 'createdAt' | 'progress'>): Promise<Assessment> {
  const { data } = await client.post('/assessments', assessment)
  return data
}

export async function updateAssessment(id: string, assessment: Partial<Assessment>): Promise<Assessment> {
  const { data } = await client.put(`/assessments/${id}`, assessment)
  return data
}

export async function deleteAssessment(id: string): Promise<void> {
  await client.delete(`/assessments/${id}`)
}

export async function getAssessmentRequirements(assessmentId: string): Promise<AssessmentRequirement[]> {
  const { data } = await client.get(`/assessments/${assessmentId}/requirements`)
  return data
}

export async function updateAssessmentRequirement(assessmentId: string, id: string, requirement: Partial<AssessmentRequirement>): Promise<AssessmentRequirement> {
  const { data } = await client.put(`/assessments/${assessmentId}/requirements/${id}`, requirement)
  return data
}

export async function startAssessment(id: string): Promise<Assessment> {
  const { data } = await client.post(`/assessments/${id}/start`)
  return data
}

export async function completeAssessment(id: string): Promise<Assessment> {
  const { data } = await client.post(`/assessments/${id}/complete`)
  return data
}
