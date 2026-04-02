import client from './client'
import type { Project, PaginatedResponse } from '@/types'

export async function getProjects(page = 1, pageSize = 20): Promise<PaginatedResponse<Project>> {
  const { data } = await client.get('/projects', { params: { page, pageSize } })
  return data
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await client.get(`/projects/${id}`)
  return data
}

export async function createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<Project> {
  const { data } = await client.post('/projects', project)
  return data
}

export async function updateProject(id: string, project: Partial<Project>): Promise<Project> {
  const { data } = await client.put(`/projects/${id}`, project)
  return data
}

export async function deleteProject(id: string): Promise<void> {
  await client.delete(`/projects/${id}`)
}
