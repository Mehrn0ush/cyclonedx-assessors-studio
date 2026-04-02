import client from './client'
import type { User } from '@/types'

export interface LoginResponse {
  user: User
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await client.post('/auth/login', { username, password })
  return data
}

export async function logout(): Promise<void> {
  await client.post('/auth/logout')
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await client.get('/auth/me')
  return data.user
}
