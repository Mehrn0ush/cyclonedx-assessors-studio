import type {
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from 'kysely';

/**
 * Refuse any UPDATE or DELETE that targets `audit_log`. The same
 * invariant is enforced in production Postgres by a BEFORE trigger
 * installed in migrate.ts; this plugin is the always-on companion
 * that survives DB backends without PL/pgSQL trigger support (PGlite
 * being the relevant case) and catches any direct ORM-level call
 * that tries to mutate the log.
 *
 * Errors here are not silenceable — there is no admin override,
 * no permission bypass. INSERT and SELECT continue to work normally.
 *
 * Lives in its own module so test suites that `vi.mock` connection.ts
 * don't need to know about it; the plugin attaches when Kysely is
 * built, which happens in connection.ts and in test helpers, both of
 * which import this directly.
 */
export class AuditLogAppendOnlyPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const node = args.node;
    if (node.kind === 'UpdateQueryNode' || node.kind === 'DeleteQueryNode') {
      if (referencesAuditLog(node)) {
        const op = node.kind === 'UpdateQueryNode' ? 'UPDATE' : 'DELETE';
        throw new Error(`audit_log is append-only (${op} refused)`);
      }
    }
    return node;
  }

  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return args.result;
  }
}

function referencesAuditLog(node: RootOperationNode): boolean {
  const n = node as unknown as {
    from?: { froms?: Array<{ table?: { identifier?: { name?: string } } }> };
    table?: { table?: { identifier?: { name?: string } } };
  };
  // Delete: `from.froms[].table.identifier.name`
  if (n.from?.froms) {
    return n.from.froms.some((f) => f.table?.identifier?.name === 'audit_log');
  }
  // Update: `table.table.identifier.name`
  if (n.table?.table?.identifier?.name === 'audit_log') return true;
  return false;
}
