import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
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

    // Query both and verify mixed providers
    const rows = await db
      .selectFrom('evidence_attachment')
      .select(['id', 'storage_provider'])
      .where('evidence_id', '=', evidence.id)
      .orderBy('filename', 'asc')
      .execute();

    const providers = rows.map(r => r.storage_provider);
    expect(providers).toContain('database');
    expect(providers).toContain('s3');
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
