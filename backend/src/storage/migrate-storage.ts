/**
 * CLI utility to migrate evidence attachments between storage backends.
 *
 * Usage:
 *   npm run storage:migrate -- --from filesystem --to database
 *   npm run storage:migrate -- --from database --to s3
 *   npm run storage:migrate -- --from s3 --to database
 *
 * The migration is idempotent: re-running it skips records that have
 * already been migrated to the target provider.
 */

import { initializeDatabase, closeDatabase, getDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { initializeStorage, resolveProvider } from './index.js';
import { logger } from '../utils/logger.js';
import type { StorageProviderName } from './types.js';

const BATCH_SIZE = 50;

const VALID_PROVIDERS: StorageProviderName[] = ['filesystem', 'database', 's3'];

function parseArgs(): { from: StorageProviderName; to: StorageProviderName } {
  const args = process.argv.slice(2);
  let from: string | undefined;
  let to: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      from = args[++i];
    } else if (args[i] === '--to' && args[i + 1]) {
      to = args[++i];
    }
  }

  if (!from || !to) {
    console.error('Usage: npm run storage:migrate -- --from <provider> --to <provider>');
    console.error('Providers: filesystem, database, s3');
    process.exit(1);
  }

  if (!VALID_PROVIDERS.includes(from as StorageProviderName)) {
    console.error(`Invalid --from provider: ${from}. Valid options: ${VALID_PROVIDERS.join(', ')}`);
    process.exit(1);
  }

  if (!VALID_PROVIDERS.includes(to as StorageProviderName)) {
    console.error(`Invalid --to provider: ${to}. Valid options: ${VALID_PROVIDERS.join(', ')}`);
    process.exit(1);
  }

  if (from === to) {
    console.error('Source and destination providers must be different.');
    process.exit(1);
  }

  return { from: from as StorageProviderName, to: to as StorageProviderName };
}

async function migrateStorage(): Promise<void> {
  const { from, to } = parseArgs();

  logger.info(`Starting storage migration: ${from} -> ${to}`);
  console.log(`Migrating evidence attachments from "${from}" to "${to}"...`);

  // Initialize database and storage
  await initializeDatabase();
  await runMigrations();
  initializeStorage();

  const db = getDatabase();
  const sourceProvider = resolveProvider(from);
  const destProvider = resolveProvider(to);

  // Count total records to migrate
  const countResult = await db
    .selectFrom('evidence_attachment')
    .where('storage_provider', '=', from)
    .select(db.fn.countAll().as('count'))
    .executeTakeFirst();

  const totalCount = Number(countResult?.count || 0);

  if (totalCount === 0) {
    console.log(`No attachments found with storage_provider="${from}". Nothing to migrate.`);
    await closeDatabase();
    return;
  }

  console.log(`Found ${totalCount} attachment(s) to migrate.`);

  let migrated = 0;
  let failed = 0;

  // Always query without offset because migrated records drop out of the
  // WHERE clause once their storage_provider is updated. Using offset
  // would skip records as the result set shrinks.
  while (true) {
    const batch = await db
      .selectFrom('evidence_attachment')
      .where('storage_provider', '=', from)
      .selectAll()
      .limit(BATCH_SIZE)
      .execute();

    if (batch.length === 0) break;

    for (const record of batch) {
      try {
        const storageKey = record.storage_path || `evidence/${record.evidence_id}/${record.id}-${record.filename}`;

        // Read from source
        let data: Buffer;
        if (from === 'database') {
          if (!record.binary_content) {
            logger.warn(`Skipping attachment ${record.id}: no binary_content in database`);
            failed++;
            continue;
          }
          data = Buffer.isBuffer(record.binary_content)
            ? record.binary_content
            : Buffer.from(record.binary_content as any, 'base64');
        } else {
          const result = await sourceProvider.get(storageKey);
          data = result.data;
        }

        // Write to destination
        if (to === 'database') {
          await db
            .updateTable('evidence_attachment')
            .set({
              binary_content: data as any,
              storage_provider: 'database',
              updated_at: new Date(),
            })
            .where('id', '=', record.id)
            .execute();
        } else {
          await destProvider.put(storageKey, data, { contentType: record.content_type });
          await db
            .updateTable('evidence_attachment')
            .set({
              storage_provider: to,
              storage_path: storageKey,
              binary_content: to === 's3' ? null : undefined,
              updated_at: new Date(),
            } as any)
            .where('id', '=', record.id)
            .execute();
        }

        migrated++;

        if (migrated % 10 === 0) {
          console.log(`  Progress: ${migrated}/${totalCount} migrated`);
        }
      } catch (error: any) {
        logger.error(`Failed to migrate attachment ${record.id}`, { error: error?.message });
        console.error(`  Failed: attachment ${record.id} (${record.filename}): ${error?.message}`);
        failed++;
      }
    }

  }

  console.log('');
  console.log('Migration complete.');
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${totalCount}`);

  if (from === 'filesystem' && migrated > 0) {
    console.log('');
    console.log('The ./uploads/ directory can now be safely deleted if all files were migrated successfully.');
  }

  await closeDatabase();
}

// Run
migrateStorage().catch((error) => {
  logger.error('Storage migration failed', { error });
  console.error('Migration failed:', error.message);
  process.exit(1);
});
