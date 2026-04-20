import client from './client'

export interface ApiKey {
  id: string
  name: string
  prefix: string
  user_id: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

/**
 * Response shape for POST /apikeys. Includes the plaintext key once;
 * the server only stores a SHA-256 hash thereafter. UI callers must
 * present the key to the user with copy-to-clipboard affordance and
 * discard the in-memory copy on dialog close.
 */
export interface CreatedApiKey {
  id: string
  name: string
  prefix: string
  key: string
  expiresAt: string | null
  createdAt: string
}

export interface CreateApiKeyPayload {
  name: string
  expiresInDays?: number
  userId?: string
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const { data } = await client.get('/apikeys')
  return data.data ?? []
}

export async function createApiKey(payload: CreateApiKeyPayload): Promise<CreatedApiKey> {
  const { data } = await client.post('/apikeys', payload)
  return data
}

export async function revokeApiKey(id: string): Promise<void> {
  await client.delete(`/apikeys/${encodeURIComponent(id)}`)
}
