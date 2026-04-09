import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import {
  setupTestDb,
  teardownTestDb,
  createTestUser,
  createTestEvidence,
  getTestDatabase,
} from '../helpers/setup.js';

// ---------------------------------------------------------------------------
// DatabaseStorageProvider
// ---------------------------------------------------------------------------
describe('DatabaseStorageProvider', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should put and get binary content via the database', async () => {
    const db = getTestDatabase();
    const author = await createTestUser();
    const evidence = await createTestEvidence(author.id);
    const attachmentId = uuidv4();
    const content = Buffer.from('hello world');
    const storageKey = `evidence/${evidence.id}/${attachmentId}-test.txt`;

    // Pre-insert a row so the provider can update it
    await db.insertInto('evidence_attachment').values({
      id: attachmentId,
      evidence_id: evidence.id,
      filename: 'test.txt',
      content_type: 'text/plain',
      size_bytes: content.length,
      storage_path: storageKey,
      storage_provider: 'database',
      binary_content: content as any,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();

    // Read it back
    const row = await db
      .selectFrom('evidence_attachment')
      .select(['binary_content', 'content_type'])
      .where('id', '=', attachmentId)
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.content_type).toBe('text/plain');

    // binary_content should come back as a Buffer (BYTEA)
    const data = Buffer.isBuffer(row!.binary_content)
      ? row!.binary_content
      : Buffer.from(row!.binary_content as any, 'base64');
    expect(data.toString()).toBe('hello world');
  });

  it('should store and retrieve large binary content', async () => {
    const db = getTestDatabase();
    const author = await createTestUser();
    const evidence = await createTestEvidence(author.id);
    const attachmentId = uuidv4();

    // 100 KB of random-ish bytes
    const content = Buffer.alloc(100 * 1024, 0xAB);
    const storageKey = `evidence/${evidence.id}/${attachmentId}-large.bin`;

    await db.insertInto('evidence_attachment').values({
      id: attachmentId,
      evidence_id: evidence.id,
      filename: 'large.bin',
      content_type: 'application/octet-stream',
      size_bytes: content.length,
      storage_path: storageKey,
      storage_provider: 'database',
      binary_content: content as any,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();

    const row = await db
      .selectFrom('evidence_attachment')
      .select(['binary_content', 'size_bytes'])
      .where('id', '=', attachmentId)
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.size_bytes).toBe(100 * 1024);

    const data = Buffer.isBuffer(row!.binary_content)
      ? row!.binary_content
      : Buffer.from(row!.binary_content as any, 'base64');
    expect(data.length).toBe(100 * 1024);
    expect(data[0]).toBe(0xAB);
  });

  it('should store NULL binary_content for S3 provider records', async () => {
    const db = getTestDatabase();
    const author = await createTestUser();
    const evidence = await createTestEvidence(author.id);
    const attachmentId = uuidv4();
    const storageKey = `evidence/${evidence.id}/${attachmentId}-s3file.pdf`;

    await db.insertInto('evidence_attachment').values({
      id: attachmentId,
      evidence_id: evidence.id,
      filename: 's3file.pdf',
      content_type: 'application/pdf',
      size_bytes: 2048,
      storage_path: storageKey,
      storage_provider: 's3',
      binary_content: null,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();

    const row = await db
      .selectFrom('evidence_attachment')
      .select(['binary_content', 'storage_provider', 'storage_path'])
      .where('id', '=', attachmentId)
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.storage_provider).toBe('s3');
    expect(row!.storage_path).toBe(storageKey);
    expect(row!.binary_content).toBeNull();
  });

  it('should support mixed storage_provider values in the same table', async () => {
    const db = getTestDatabase();
    const author = await createTestUser();
    const evidence = await createTestEvidence(author.id);

    const dbAttachmentId = uuidv4();
    const s3AttachmentId = uuidv4();
    const fsAttachmentId = uuidv4();

    // Database stored
    await db.insertInto('evidence_attachment').values({
      id: dbAttachmentId,
      evidence_id: evidence.id,
      filename: 'db.txt',
      content_type: 'text/plain',
      size_bytes: 5,
      storage_path: null,
      storage_provider: 'database',
      binary_content: Buffer.from('dbdat') as any,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();

    // S3 stored
    await db.insertInto('evidence_attachment').values({
      id: s3AttachmentId,
      evidence_id: evidence.id,
      filename: 's3.txt',
      content_type: 'text/plain',
      size_bytes: 5,
      storage_path: `evidence/${evidence.id}/${s3AttachmentId}-s3.txt`,
      storage_provider: 's3',
      binary_content: null,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();

    // Legacy filesystem
    await db.insertInto('evidence_attachment').values({
      id: fsAttachmentId,
      evidence_id: evidence.id,
      filename: 'fs.txt',
      content_type: 'text/plain',
      size_bytes: 5,
      storage_path: `evidence/${evidence.id}/${fsAttachmentId}-fs.txt`,
      storage_provider: 'filesystem',
      binary_content: null,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();

    // Query all three and verify mixed providers
    const rows = await db
      .selectFrom('evidence_attachment')
      .select(['id', 'storage_provider'])
      .where('evidence_id', '=', evidence.id)
      .orderBy('filename', 'asc')
      .execute();

    const providers = rows.map(r => r.storage_provider);
    expect(providers).toContain('database');
    expect(providers).toContain('s3');
    expect(providers).toContain('filesystem');
  });

  it('should delete attachment content when the row is deleted (CASCADE)', async () => {
    const db = getTestDatabase();
    const author = await createTestUser();
    const evidence = await createTestEvidence(author.id);
    const attachmentId = uuidv4();

    await db.insertInto('evidence_attachment').values({
      id: attachmentId,
      evidence_id: evidence.id,
      filename: 'cascade.txt',
      content_type: 'text/plain',
      size_bytes: 4,
      storage_provider: 'database',
      binary_content: Buffer.from('test') as any,
      created_at: new Date(),
      updated_at: new Date(),
    }).execute();

    // Delete the evidence (should CASCADE to the attachment)
    await db.deleteFrom('evidence').where('id', '=', evidence.id).execute();

    const row = await db
      .selectFrom('evidence_attachment')
      .where('id', '=', attachmentId)
      .selectAll()
      .executeTakeFirst();

    expect(row).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FilesystemStorageProvider
// ---------------------------------------------------------------------------
describe('FilesystemStorageProvider', () => {
  // Use /tmp for filesystem tests to avoid sandbox permission issues on mounted dirs
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = `/tmp/fs-test-${uuidv4().slice(0, 8)}`;
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors in sandboxed environments
    }
  });

  it('should put and get a file', async () => {
    // Lazy import to avoid loading before env vars are set
    const { FilesystemStorageProvider } = await import('../../storage/filesystem-provider.js');
    const provider = new FilesystemStorageProvider(tmpDir);

    const key = 'evidence/abc/123-test.txt';
    const data = Buffer.from('filesystem test content');

    await provider.put(key, data, { contentType: 'text/plain' });

    const exists = await provider.exists(key);
    expect(exists).toBe(true);

    const result = await provider.get(key);
    expect(result.data.toString()).toBe('filesystem test content');
  });

  it('should return false for exists when file does not exist', async () => {
    const { FilesystemStorageProvider } = await import('../../storage/filesystem-provider.js');
    const provider = new FilesystemStorageProvider(tmpDir);

    const exists = await provider.exists('evidence/nonexistent/file.txt');
    expect(exists).toBe(false);
  });

  it('should delete a file', async () => {
    const { FilesystemStorageProvider } = await import('../../storage/filesystem-provider.js');
    const provider = new FilesystemStorageProvider(tmpDir);

    const key = 'evidence/abc/456-to-delete.txt';
    await provider.put(key, Buffer.from('delete me'), { contentType: 'text/plain' });

    expect(await provider.exists(key)).toBe(true);

    await provider.delete(key);

    expect(await provider.exists(key)).toBe(false);
  });

  it('should not throw when deleting a nonexistent file', async () => {
    const { FilesystemStorageProvider } = await import('../../storage/filesystem-provider.js');
    const provider = new FilesystemStorageProvider(tmpDir);

    // Should not throw
    await provider.delete('evidence/nonexistent/ghost.txt');
  });

  it('should create nested directories as needed', async () => {
    const { FilesystemStorageProvider } = await import('../../storage/filesystem-provider.js');
    const provider = new FilesystemStorageProvider(tmpDir);

    const key = 'evidence/deep/nested/path/file.bin';
    await provider.put(key, Buffer.from([0x00, 0xFF]), { contentType: 'application/octet-stream' });

    const result = await provider.get(key);
    expect(result.data.length).toBe(2);
    expect(result.data[0]).toBe(0x00);
    expect(result.data[1]).toBe(0xFF);
  });
});

// ---------------------------------------------------------------------------
// S3StorageProvider (constructor and config validation)
// ---------------------------------------------------------------------------
describe('S3StorageProvider', () => {
  it('should construct with valid config', async () => {
    const { S3StorageProvider } = await import('../../storage/s3-provider.js');

    // Should not throw
    const provider = new S3StorageProvider({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      forcePathStyle: false,
    });

    expect(provider).toBeDefined();
  });

  it('should accept optional endpoint for S3-compatible services', async () => {
    const { S3StorageProvider } = await import('../../storage/s3-provider.js');

    const provider = new S3StorageProvider({
      bucket: 'local-bucket',
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
      accessKeyId: 'minioadmin',
      secretAccessKey: 'minioadmin',
      forcePathStyle: true,
    });

    expect(provider).toBeDefined();
  });
});
