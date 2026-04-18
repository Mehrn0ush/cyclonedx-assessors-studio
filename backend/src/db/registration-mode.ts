import { getDatabase } from './connection.js';
import { getConfig } from '../config/index.js';
import { logAudit } from '../utils/audit.js';
import { logger } from '../utils/logger.js';

const CONFIG_KEY = 'registration_mode_last_known';

/**
 * Reconcile the runtime REGISTRATION_MODE with the last-known value
 * persisted in the database.
 *
 * Background (F15): REGISTRATION_MODE is one of three security
 * sensitive runtime settings (alongside METRICS_ENABLED and
 * STORAGE_PROVIDER) that materially changes who can create accounts
 * on the tenant. An operator flipping the value through a container
 * restart should leave an audit trail that a SIEM can correlate with
 * subsequent account creation activity. The app_config table is the
 * only durable place we control, so we record the last value we saw
 * and compare on each boot.
 *
 * Behavior:
 *   - First run (no row): seed the row with the current mode and do
 *     not emit an audit row. There is nothing to compare against, and
 *     the CHECK constraint on audit_log.action already allows
 *     `config_change` so a future drift will record cleanly.
 *   - Subsequent runs where the stored value matches the runtime:
 *     no-op. Cheap enough on every startup.
 *   - Subsequent runs where the value differs: emit a `config_change`
 *     audit row with the old and new values and update the stored row.
 *     The audit row has user_id=NULL because the change was made
 *     outside a request context (env var, compose file, systemd unit).
 *
 * The logAudit helper swallows its own errors, so a failed audit
 * write will log and continue rather than block the boot.
 */
export async function bootstrapRegistrationModeTracking(): Promise<void> {
  const config = getConfig();
  const db = getDatabase();
  const runtimeMode = config.REGISTRATION_MODE;

  const existing = await db
    .selectFrom('app_config')
    .select(['value'])
    .where('key', '=', CONFIG_KEY)
    .executeTakeFirst();

  const now = new Date();

  if (!existing) {
    // First run or upgrade from a pre-F15 build. Seed the row and
    // move on; there is nothing to compare against. We deliberately
    // do not emit an audit entry because "unknown -> X" is not a
    // meaningful change event.
    await db
      .insertInto('app_config')
      .values({
        key: CONFIG_KEY,
        value: runtimeMode,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          value: runtimeMode,
          updated_at: now,
        }),
      )
      .execute();
    logger.info('Registration mode tracking initialized', {
      mode: runtimeMode,
    });
    return;
  }

  if (existing.value === runtimeMode) {
    return;
  }

  // Drift detected. Emit the audit row before we overwrite the value
  // so the log retains the transition even if the subsequent update
  // fails. A failed update is self healing on the next boot (we will
  // detect and record the same drift again) but a missed audit row is
  // not, which is the opposite of what we want for SIEM integration.
  const previousMode = existing.value;
  logger.warn('REGISTRATION_MODE changed since last boot', {
    from: previousMode,
    to: runtimeMode,
  });

  // Use a fixed entity id derived from the config key so multiple
  // drift events are queryable together in the audit_log. Any valid
  // UUID that is stable across runs works; we use a deterministic
  // namespace constant so operators can filter the table.
  const REGISTRATION_MODE_ENTITY_ID = '00000000-0000-0000-0000-000000000f15';

  await logAudit(db, {
    entityType: 'config',
    entityId: REGISTRATION_MODE_ENTITY_ID,
    action: 'config_change',
    userId: null,
    changes: {
      key: 'REGISTRATION_MODE',
      from: previousMode,
      to: runtimeMode,
      source: 'startup_reconciliation',
    },
  });

  await db
    .updateTable('app_config')
    .set({
      value: runtimeMode,
      updated_at: now,
    })
    .where('key', '=', CONFIG_KEY)
    .execute();
}
