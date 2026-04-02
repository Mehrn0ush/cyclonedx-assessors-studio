import client from './client'
import type { Standard, PaginatedResponse } from '@/types'

export async function getStandards(page = 1, pageSize = 20): Promise<PaginatedResponse<Standard>> {
  const { data } = await client.get('/standards', { params: { page, pageSize } })
  return data
}

export async function getStandard(id: string): Promise<Standard> {
  const { data } = await client.get(`/standards/${id}`)
  return data
}

export async function createStandard(standard: Omit<Standard, 'id' | 'requirements' | 'createdAt'>): Promise<Standard> {
  const { data } = await client.post('/standards', standard)
  return data
}

export async function updateStandard(id: string, standard: Partial<Standard>): Promise<Standard> {
  const { data } = await client.put(`/standards/${id}`, standard)
  return data
}

export async function deleteStandard(id: string): Promise<void> {
  await client.delete(`/standards/${id}`)
}

export async function importStandard(file: File): Promise<Standard> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await client.post('/standards/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data
}
