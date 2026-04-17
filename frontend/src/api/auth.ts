import client from './client'
import type { User } from '@/types'

export interface LoginResponse {
  user: User
  permissions?: string[]
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await client.post('/auth/login', { username, password })
  return data
}

export async function logout(): Promise<void> {
  await client.post('/auth/logout')
}

export async function getCurrentUser(): Promise<User & { permissions?: string[] }> {
  const { data } = await client.get('/auth/me')
  return data.user
}

export interface PasswordPolicy {
  minLength: number
  maxLength: number
}

// Public endpoint. Intentionally exposes only the bounds the UI
// needs for placeholder copy and client-side length validation.
// The server keeps the deny list and breach check configuration
// private so an attacker cannot pre filter their guessing corpus.
export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const { data } = await client.get('/auth/password-policy')
  return data
}
