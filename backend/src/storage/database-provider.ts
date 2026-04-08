import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import type { StorageProvider } from './types.js';

/**
 * Stores evidence attachment content directly in the database as BYTEA.
 *
 * This is the default provider and requires no external dependencies.
 * The binary_content column on the evidence_attachment table holds the
 * raw bytes and the content_type column holds the MIME type.
 */
export class DatabaseStorageProvider implements StorageProvider {
  async put(key: string, data: Buffer, metadata: { contentType: string }): Promise<void> {
    // The actual INSERT happens in the evidence route. This provider is
    // used for migration scenarios where we need to write content into
    // the binary_content column of an existing record.
    const db = getDatabase();
    const attachmentId = this.extractAttachmentId(key);

    if (!attachmentId) {
      throw new Error(`Cannot derive attachment id from key: ${key}`);
    }

    await db
      .updateTable('evidence_attachment')
      .set({
        binary_content: data as any,
        storage_provider: 'database',
        storage_path: key,
        updated_at: new Date(),
      })
      .where('id', '=', attachmentId)
      .execute();

    logger.debug('DatabaseStorageProvider.put', { key });
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string }> {
    const db = getDatabase();
    const attachmentId = this.extractAttachmentId(key);

    if (!attachmentId) {
      throw new Error(`Cannot derive attachment id from key: ${key}`);
    }

    const row = await db
      .selectFrom('evidence_attachment')
      .select(['binary_content', 'content_type'])
      .where('id', '=', attachmentId)
      .executeTakeFirst();

    if (!row || !row.binary_content) {
      throw new Error(`Attachment content not found in database for key: ${key}`);
    }

    // binary_content is stored as BYTEA; Kysely / pg returns it as a Buffer.
    const data = Buffer.isBuffer(row.binary_content)
      ? row.binary_content
      : Buffer.from(row.binary_content as any, 'base64');

    return { data, contentType: row.content_type };
  }

  async delete(key: string): Promise<void> {
    // Database content is deleted when the evidence_attachment row is deleted.
    // This is a no-op for the database provider since CASCADE handles it.
    logger.debug('DatabaseStorageProvider.delete (no-op)', { key });
  }

  async exists(key: string): Promise<boolean> {
    const db = getDatabase();
    const attachmentId = this.extractAttachmentId(key);

    if (!attachmentId) return false;

    const row = await db
      .selectFrom('evidence_attachment')
      .select('id')
      .where('id', '=', attachmentId)
      .where('binary_content', 'is not', null)
      .executeTakeFirst();

    return !!row;
  }

  /**
   * Extract the attachment UUID from a storage key.
   * Keys follow the pattern: evidence/{evidenceId}/{attachmentId}-{filename}
   * or: evidence/{evidenceId}/{attachmentId}/{filename}
   */
  private extractAttachmentId(key: string): string | null {
    const parts = key.split('/');
    if (parts.length < 3) return null;
    // The third segment is either "{attachmentId}-{filename}" or just "{attachmentId}"
    const segment = parts[2];
    // UUID is 36 chars
    if (segment.length >= 36) {
      return segment.substring(0, 36);
    }
    return null;
  }
}
