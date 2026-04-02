import client from './client'
import type { Evidence, PaginatedResponse } from '@/types'

export async function getEvidence(page = 1, pageSize = 20): Promise<PaginatedResponse<Evidence>> {
  const { data } = await client.get('/evidence', { params: { page, pageSize } })
  return data
}

export async function getEvidenceItem(id: string): Promise<Evidence> {
  const { data } = await client.get(`/evidence/${id}`)
  return data
}

export async function createEvidence(evidence: Omit<Evidence, 'id' | 'createdAt' | 'updatedAt' | 'attachments'>): Promise<Evidence> {
  const { data } = await client.post('/evidence', evidence)
  return data
}

export async function updateEvidence(id: string, evidence: Partial<Evidence>): Promise<Evidence> {
  const { data } = await client.put(`/evidence/${id}`, evidence)
  return data
}

export async function deleteEvidence(id: string): Promise<void> {
  await client.delete(`/evidence/${id}`)
}

export async function uploadAttachment(evidenceId: string, file: File): Promise<any> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await client.post(`/evidence/${evidenceId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data
}

export async function deleteAttachment(evidenceId: string, attachmentId: string): Promise<void> {
  await client.delete(`/evidence/${evidenceId}/attachments/${attachmentId}`)
}
