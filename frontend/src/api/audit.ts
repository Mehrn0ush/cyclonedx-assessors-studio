import client from './client'

/**
 * Audit log row shape as returned by the backend. Keys are camelCase
 * because the `/api/v1` response pipeline runs every row through
 * `camelCaseResponse` middleware before it reaches the wire. The DB
 * column names are snake_case (`entity_type`, `created_at`, etc.) but
 * the frontend never sees those.
 */
export interface AuditLogEntry {
  id: string
  entityType: string
  entityId: string | null
  action: string
  userId: string | null
  changes: Record<string, unknown> | null
  createdAt: string
  /**
   * Display name for the user that produced the row, resolved against
   * `app_user.display_name` server side. `null` when the row has no
   * user (system events) or the user has been deleted.
   */
  userDisplayName?: string | null
  /**
   * Display name for the entity the row refers to, resolved against
   * whichever table backs `entityType`. `null` when the entity is
   * unknown or has been deleted. Falls through to the raw `entityId`
   * at the UI level.
   */
  entityName?: string | null
}

/**
 * Shape returned by GET /audit/options. Feeds the typeahead filters on
 * the Admin Audit view so the user only sees entity types that have
 * actually produced rows and every action the codebase can emit.
 */
export interface AuditOptions {
  entityTypes: string[]
  actions: string[]
}

export interface AuditLogPage {
  data: AuditLogEntry[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
}

export interface AuditListParams {
  limit?: number
  offset?: number
  entityType?: string
  entityId?: string
  userId?: string
  action?: string
  from?: string
  to?: string
}

/**
 * List audit log rows. Only callers with the admin.audit permission
 * can reach this endpoint; 403 from the server surfaces as an axios
 * error the caller is expected to handle.
 */
export async function listAuditLogs(params: AuditListParams = {}): Promise<AuditLogPage> {
  const { data } = await client.get('/audit', { params })
  return data
}

/**
 * Fetch the discoverable filter options for the Admin Audit view. The
 * entity type list is whatever is actually present in the log, so users
 * cannot select a type that would return zero rows; the action list
 * covers every value the server can emit, not just what has already
 * happened.
 */
export async function getAuditOptions(): Promise<AuditOptions> {
  const { data } = await client.get('/audit/options')
  return data
}

/**
 * Fetch audit rows scoped to one entity (the embedded Activity tab).
 * The server also requires admin.audit for this path.
 */
export async function listEntityAuditLogs(
  entityType: string,
  entityId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<AuditLogPage> {
  const { data } = await client.get(
    `/audit/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    { params },
  )
  return data
}
