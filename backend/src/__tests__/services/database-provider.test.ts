import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseStorageProvider } from '../../storage/database-provider.js';
import { setupTestDb, teardownTestDb, getTestDatabase, createTestUser, createTestEvidence } from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

// Mock the database connection
vi.mock('../../db/connection.js', () => ({
  getDatabase: () => getTestDatabase(),
}));

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DatabaseStorageProvider', () => {
  let provider: DatabaseStorageProvider;

  beforeEach(async () => {
    await setupTestDb();
    provider = new DatabaseStorageProvider();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe('put', () => {
    it('should store attachment content with correct metadata', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const evidence = await createTestEvidence(user.id);

      // Create an attachment to update
      const attachmentId = uuidv4();
      await db
        .insertInto('evidence_attachment')
        .values({
          id: attachmentId,
          evidence_id: evidence.id,
          filename: 'test.pdf',
          content_type: 'application/pdf',
          size_bytes: 100,
          storage_provider: 'database',
        })
        .execute();

      const testData = Buffer.from('test content data');
      const key = `evidence/${evidence.id}/${attachmentId}-test.pdf`;

      await provider.put(key, testData, { contentType: 'application/pdf' });

      // Verify the content was stored
      const row = await db
        .selectFrom('evidence_attachment')
        .select(['binary_content', 'storage_provider', 'storage_path'])
        .where('id', '=', attachmentId)
        .executeTakeFirst();

      expect(row).toBeDefined();
      expect(row?.storage_provider).toBe('database');
      expect(row?.storage_path).toBe(key);
      expect(Buffer.from(row?.binary_content as any)).toEqual(testData);
    });

    it('should throw error if attachment id cannot be extracted', async () => {
      const invalidKey = 'invalid-key-format';
      const testData = Buffer.from('test content');

      await expect(
        provider.put(invalidKey, testData, { contentType: 'text/plain' })
      ).rejects.toThrow(/Cannot derive attachment id from key/);
    });

    it('should throw error for key with insufficient path segments', async () => {
      const invalidKey = 'evidence/evidenceId';
      const testData = Buffer.from('test content');

      await expect(
        provider.put(invalidKey, testData, { contentType: 'text/plain' })
      ).rejects.toThrow(/Cannot derive attachment id from key/);
    });
  });

  describe('get', () => {
    it('should retrieve stored attachment content', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const evidence = await createTestEvidence(user.id);

      const attachmentId = uuidv4();
      const testData = Buffer.from('stored test content');
      const contentType = 'application/json';

      await db
        .insertInto('evidence_attachment')
        .values({
          id: attachmentId,
          evidence_id: evidence.id,
          filename: 'test.json',
          content_type: contentType,
          size_bytes: testData.length,
          binary_content: testData,
          storage_provider: 'database',
        })
        .execute();

      const key = `evidence/${evidence.id}/${attachmentId}-test.json`;
      const result = await provider.get(key);

      expect(result.data).toEqual(testData);
      expect(result.contentType).toBe(contentType);
    });

    it('should throw error when attachment not found', async () => {
      const fakeId = uuidv4();
      const key = `evidence/fake-evidence/${fakeId}-notfound.pdf`;

      await expect(
        provider.get(key)
      ).rejects.toThrow(/Attachment content not found in database/);
    });

    it('should throw error when binary_content is null', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const evidence = await createTestEvidence(user.id);

      const attachmentId = uuidv4();
      await db
        .insertInto('evidence_attachment')
        .values({
          id: attachmentId,
          evidence_id: evidence.id,
          filename: 'empty.pdf',
          content_type: 'application/pdf',
          size_bytes: 0,
          binary_content: null,
          storage_provider: 'database',
        })
        .execute();

      const key = `evidence/${evidence.id}/${attachmentId}-empty.pdf`;

      await expect(
        provider.get(key)
      ).rejects.toThrow(/Attachment content not found in database/);
    });

    it('should throw error if attachment id cannot be extracted', async () => {
      const invalidKey = 'invalid-key';

      await expect(
        provider.get(invalidKey)
      ).rejects.toThrow(/Cannot derive attachment id from key/);
    });
  });

  describe('delete', () => {
    it('should be a no-op', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const evidence = await createTestEvidence(user.id);

      const attachmentId = uuidv4();
      const testData = Buffer.from('data to not delete');

      await db
        .insertInto('evidence_attachment')
        .values({
          id: attachmentId,
          evidence_id: evidence.id,
          filename: 'test.pdf',
          content_type: 'application/pdf',
          size_bytes: testData.length,
          binary_content: testData,
          storage_provider: 'database',
        })
        .execute();

      const key = `evidence/${evidence.id}/${attachmentId}-test.pdf`;

      // Delete should not throw
      await provider.delete(key);

      // Verify content is still there (no-op behavior)
      const row = await db
        .selectFrom('evidence_attachment')
        .select('binary_content')
        .where('id', '=', attachmentId)
        .executeTakeFirst();

      expect(Buffer.from(row?.binary_content as any)).toEqual(testData);
    });
  });

  describe('exists', () => {
    it('should return true when attachment exists with content', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const evidence = await createTestEvidence(user.id);

      const attachmentId = uuidv4();
      const testData = Buffer.from('exists test data');

      await db
        .insertInto('evidence_attachment')
        .values({
          id: attachmentId,
          evidence_id: evidence.id,
          filename: 'exists.pdf',
          content_type: 'application/pdf',
          size_bytes: testData.length,
          binary_content: testData,
          storage_provider: 'database',
        })
        .execute();

      const key = `evidence/${evidence.id}/${attachmentId}-exists.pdf`;
      const result = await provider.exists(key);

      expect(result).toBe(true);
    });

    it('should return false when attachment does not exist', async () => {
      const fakeId = uuidv4();
      const key = `evidence/fake-evidence/${fakeId}-notexist.pdf`;

      const result = await provider.exists(key);

      expect(result).toBe(false);
    });

    it('should return false when attachment exists but has no binary_content', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const evidence = await createTestEvidence(user.id);

      const attachmentId = uuidv4();
      await db
        .insertInto('evidence_attachment')
        .values({
          id: attachmentId,
          evidence_id: evidence.id,
          filename: 'empty.pdf',
          content_type: 'application/pdf',
          size_bytes: 0,
          binary_content: null,
          storage_provider: 'database',
        })
        .execute();

      const key = `evidence/${evidence.id}/${attachmentId}-empty.pdf`;
      const result = await provider.exists(key);

      expect(result).toBe(false);
    });

    it('should return false for invalid key format', async () => {
      const invalidKey = 'invalid-format';
      const result = await provider.exists(invalidKey);

      expect(result).toBe(false);
    });
  });

  describe('extractAttachmentId', () => {
    it('should extract UUID from standard key format with filename suffix', () => {
      const attachmentId = uuidv4();
      const key = `evidence/some-evidence-id/${attachmentId}-document.pdf`;

      // Use reflection to call private method for testing
      const result = (provider as any).extractAttachmentId(key);

      expect(result).toBe(attachmentId);
    });

    it('should extract UUID from key with slash separator', () => {
      const attachmentId = uuidv4();
      const key = `evidence/some-evidence-id/${attachmentId}/document.pdf`;

      const result = (provider as any).extractAttachmentId(key);

      expect(result).toBe(attachmentId);
    });

    it('should extract UUID that is exactly 36 characters', () => {
      const attachmentId = uuidv4(); // Standard UUID is 36 chars
      const key = `evidence/eid/${attachmentId}-file.pdf`;

      const result = (provider as any).extractAttachmentId(key);

      expect(result).toBe(attachmentId);
      expect(result?.length).toBe(36);
    });

    it('should return null for key with fewer than 3 segments', () => {
      const key = 'evidence/only-two';

      const result = (provider as any).extractAttachmentId(key);

      expect(result).toBeNull();
    });

    it('should return null for key with short third segment', () => {
      const key = 'evidence/eid/short';

      const result = (provider as any).extractAttachmentId(key);

      expect(result).toBeNull();
    });

    it('should handle complex filenames', () => {
      const attachmentId = uuidv4();
      const key = `evidence/evidence-123/${attachmentId}-my-important-document-2024.pdf`;

      const result = (provider as any).extractAttachmentId(key);

      expect(result).toBe(attachmentId);
    });

    it('should extract UUID even with multiple dashes in filename', () => {
      const attachmentId = uuidv4();
      const key = `evidence/eid/${attachmentId}-file-name-with-many-dashes.pdf`;

      const result = (provider as any).extractAttachmentId(key);

      expect(result).toBe(attachmentId);
    });
  });

  describe('round-trip', () => {
    it('should put and get data successfully', async () => {
      const db = getTestDatabase();
      const user = await createTestUser();
      const evidence = await createTestEvidence(user.id);

      const attachmentId = uuidv4();
      const originalData = Buffer.from('Round trip test content with special chars: äöü');
      const contentType = 'text/plain;charset=utf-8';

      // Create attachment
      await db
        .insertInto('evidence_attachment')
        .values({
          id: attachmentId,
          evidence_id: evidence.id,
          filename: 'roundtrip.txt',
          content_type: contentType,
          size_bytes: originalData.length,
          storage_provider: 'database',
        })
        .execute();

      const key = `evidence/${evidence.id}/${attachmentId}-roundtrip.txt`;

      // Put
      await provider.put(key, originalData, { contentType });

      // Get
      const result = await provider.get(key);

      expect(result.data).toEqual(originalData);
      expect(result.contentType).toBe(contentType);
    });
  });
});
