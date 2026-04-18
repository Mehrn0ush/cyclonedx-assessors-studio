import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { v4 as uuidv4 } from 'uuid';

export async function logAudit(
  db: Kysely<Database>,
  params: {
    entityType: string;
    entityId: string;
    action: 'create' | 'create_for_other' | 'update' | 'delete' | 'state_change' | 'link' | 'unlink' | 'authz_denied' | 'config_change';
    // Nullable so system-originated events (startup config drift,
    // background job actions) can be recorded without inventing a
    // synthetic service account. Application code running inside a
    // request handler should always pass the authenticated user's id.
    userId: string | null;
    changes?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db
      .insertInto('audit_log')
      .values({
        id: uuidv4(),
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        user_id: params.userId,
        changes: params.changes || null,
      })
      .execute();
  } catch (error) {
    console.error('Failed to log audit entry', error);
  }
}
