import client from './client'

export type InviteStatus = 'pending' | 'consumed' | 'revoked' | 'expired'

export type InviteRole =
  | 'admin'
  | 'assessor'
  | 'assessee'
  | 'standards_manager'
  | 'standards_approver'

export interface Invite {
  id: string
  email: string | null
  intendedRole: InviteRole
  createdBy: string | null
  createdAt: string
  expiresAt: string
  consumedAt: string | null
  consumedBy: string | null
  revokedAt: string | null
  status: InviteStatus
}

/**
 * Response shape for POST /admin/invites. The plaintext token is only
 * returned on create and is never persisted in the database. Callers
 * must surface it to the user immediately and discard the in-memory
 * copy as soon as the UI is dismissed.
 */
export interface CreatedInvite {
  id: string
  token: string
  email: string | null
  intendedRole: InviteRole
  expiresAt: string
}

export interface CreateInvitePayload {
  email?: string
  intendedRole?: InviteRole
  expiresInHours?: number
}

export async function listInvites(): Promise<Invite[]> {
  const { data } = await client.get('/admin/invites')
  return data.invites ?? []
}

export async function createInvite(payload: CreateInvitePayload): Promise<CreatedInvite> {
  const { data } = await client.post('/admin/invites', payload)
  return data
}

export async function revokeInvite(id: string): Promise<void> {
  await client.delete(`/admin/invites/${encodeURIComponent(id)}`)
}

/**
 * Reports whether the server has an outbound SMTP channel configured.
 * The invite UI uses this to warn admins that invites will not be
 * emailed and must be copied and shared out of band. Callable by anyone
 * with admin.users; the response intentionally carries only a boolean
 * so SMTP host, port, and from address do not leak to user managers
 * who lack admin.settings.
 */
export async function getInviteEmailConfigured(): Promise<boolean> {
  const { data } = await client.get('/admin/invites/email-configured')
  return Boolean(data?.emailConfigured)
}
