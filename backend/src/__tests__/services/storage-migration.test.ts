/**
 * Tests for the storage migration logic.
 *
 * These tests exercise the migration paths between storage backends
 * at the data layer (database + filesystem), without invoking the CLI
 * entrypoint directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  setupTestDb,
  teardownTestDb,
  createTestUser,
  createTestEvidence,
  getTestDatabase,
} from '../helpers/setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Storage Migration', () => {
  let tmpDir: string;

  beforeAll(async () => {
    await setupTestDb();
    tmpDir = `/tmp/migration-test-${uuidv4().slice(0, 8)}`;
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors in sandboxed environments
    }
    await teardownTestDb();
  });

  // -----------------------------------------------------------------------
  // Filesystem to Database migration
  // -----------------------------------------------------------------------
  describe('filesystem -> database', () => {
    it('should migrate a file from disk to the binary_content column', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);
      const attachmentId = uuidv4();
      const storageKey = `evidence/${evidence.id}/${attachmentId}-report.txt`;
      const fileContent = 'legacy filesystem content';

      // Simulate a legacy filesystem attachment
      const filePath = path.join(tmpDir, storageKey);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, fileContent);

      await db.insertInto('evidence_attachment').values({
        id: attachmentId,
        evidence_id: evidence.id,
        filename: 'report.txt',
        content_type: 'text/plain',
        size_bytes: fileContent.length,
        storage_path: storageKey,
        storage_provider: 'filesystem',
        binary_content: null,
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();

      // Perform migration: read from filesystem, write to database
      const { FilesystemStorageProvider } = await import('../../storage/filesystem-provider.js');
      const fsProvider = new FilesystemStorageProvider(tmpDir);

      const result = await fsProvider.get(storageKey);
      expect(result.data.toString()).toBe(fileContent);

      // Write into the database
      await db
        .updateTable('evidence_attachment')
        .set({
          binary_content: result.data as any,
          storage_provider: 'database',
          updated_at: new Date(),
        })
        .where('id', '=', attachmentId)
        .execute();

      // Verify the migration
      const row = await db
        .selectFrom('evidence_attachment')
        .select(['binary_content', 'storage_provider'])
        .where('id', '=', attachmentId)
        .executeTakeFirst();

      expect(row).toBeDefined();
      expect(row!.storage_provider).toBe('database');

      const data = Buffer.isBuffer(row!.binary_content)
        ? row!.binary_content
        : Buffer.from(row!.binary_content as any, 'base64');
      expect(data.toString()).toBe(fileContent);
    });
  });

  // -----------------------------------------------------------------------
  // Database to Filesystem migration
  // -----------------------------------------------------------------------
  describe('database -> filesystem', () => {
    it('should migrate content from database to a file on disk', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);
      const attachmentId = uuidv4();
      const storageKey = `evidence/${evidence.id}/${attachmentId}-db-to-fs.txt`;
      const content = Buffer.from('database content to filesystem');

      await db.insertInto('evidence_attachment').values({
        id: attachmentId,
        evidence_id: evidence.id,
        filename: 'db-to-fs.txt',
        content_type: 'text/plain',
        size_bytes: content.length,
        storage_path: storageKey,
        storage_provider: 'database',
        binary_content: content as any,
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();

      // Read from database
      const row = await db
        .selectFrom('evidence_attachment')
        .select(['binary_content'])
        .where('id', '=', attachmentId)
        .executeTakeFirst();

      const data = Buffer.isBuffer(row!.binary_content)
        ? row!.binary_content
        : Buffer.from(row!.binary_content as any, 'base64');

      // Write to filesystem
      const { FilesystemStorageProvider } = await import('../../storage/filesystem-provider.js');
      const fsProvider = new FilesystemStorageProvider(tmpDir);
      await fsProvider.put(storageKey, data, { contentType: 'text/plain' });

      // Update the record
      await db
        .updateTable('evidence_attachment')
        .set({
          storage_provider: 'filesystem',
          storage_path: storageKey,
          binary_content: null,
          updated_at: new Date(),
        } as any)
        .where('id', '=', attachmentId)
        .execute();

      // Verify the migration
      const updated = await db
        .selectFrom('evidence_attachment')
        .select(['storage_provider', 'binary_content'])
        .where('id', '=', attachmentId)
        .executeTakeFirst();

      expect(updated!.storage_provider).toBe('filesystem');
      expect(updated!.binary_content).toBeNull();

      // Verify the file on disk
      const fileResult = await fsProvider.get(storageKey);
      expect(fileResult.data.toString()).toBe('database content to filesystem');
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency
  // -----------------------------------------------------------------------
  describe('idempotency', () => {
    it('should skip records that are already at the target provider', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);
      const attachmentId = uuidv4();
      const content = Buffer.from('already migrated');

      await db.insertInto('evidence_attachment').values({
        id: attachmentId,
        evidence_id: evidence.id,
        filename: 'already-db.txt',
        content_type: 'text/plain',
        size_bytes: content.length,
        storage_provider: 'database',
        binary_content: content as any,
        created_at: new Date(),
        updated_at: new Date(),
      }).execute();

      // Query for records with storage_provider = 'filesystem' (source)
      const toMigrate = await db
        .selectFrom('evidence_attachment')
        .where('id', '=', attachmentId)
        .where('storage_provider', '=', 'filesystem')
        .selectAll()
        .execute();

      // No records to migrate since this is already 'database'
      expect(toMigrate).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Batch processing
  // -----------------------------------------------------------------------
  describe('batch processing', () => {
    it('should handle multiple attachments across batches', async () => {
      const db = getTestDatabase();
      const author = await createTestUser();
      const evidence = await createTestEvidence(author.id);

      // Create 5 filesystem attachments
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const id = uuidv4();
        ids.push(id);
        const storageKey = `evidence/${evidence.id}/${id}-batch${i}.txt`;
        const content = `batch file ${i}`;

        // Write to filesystem
        const filePath = path.join(tmpDir, storageKey);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);

        await db.insertInto('evidence_attachment').values({
          id,
          evidence_id: evidence.id,
          filename: `batch${i}.txt`,
          content_type: 'text/plain',
          size_bytes: content.length,
          storage_path: storageKey,
          storage_provider: 'filesystem',
          binary_content: null,
          created_at: new Date(),
          updated_at: new Date(),
        }).execute();
      }

      // Simulate batch migration (batch size = 2).
      // Always query offset 0 because migrated records drop out of the
      // WHERE clause once their storage_provider changes.
      const BATCH_SIZE = 2;
      let migrated = 0;

      while (true) {
        const batch = await db
          .selectFrom('evidence_attachment')
          .where('evidence_id', '=', evidence.id)
          .where('storage_provider', '=', 'filesystem')
          .selectAll()
          .limit(BATCH_SIZE)
          .execute();

        if (batch.length === 0) break;

        const { FilesystemStorageProvider } = await import('../../storage/filesystem-provider.js');
        const fsProvider = new FilesystemStorageProvider(tmpDir);

        for (const record of batch) {
          const result = await fsProvider.get(record.storage_path!);
          await db
            .updateTable('evidence_attachment')
            .set({
              binary_content: result.data as any,
              storage_provider: 'database',
              updated_at: new Date(),
            })
            .where('id', '=', record.id)
            .execute();
          migrated++;
        }
      }

      expect(migrated).toBe(5);

      // Verify all were migrated
      const remaining = await db
        .selectFrom('evidence_attachment')
        .where('evidence_id', '=', evidence.id)
        .where('storage_provider', '=', 'filesystem')
        .selectAll()
        .execute();

      expect(remaining).toHaveLength(0);

      // Verify content integrity
      for (let i = 0; i < 5; i++) {
        const row = await db
          .selectFrom('evidence_attachment')
          .select(['binary_content'])
          .where('id', '=', ids[i])
          .executeTakeFirst();

        const data = Buffer.isBuffer(row!.binary_content)
          ? row!.binary_content
          : Buffer.from(row!.binary_content as any, 'base64');
        expect(data.toString()).toBe(`batch file ${i}`);
      }
    });
  });
});
