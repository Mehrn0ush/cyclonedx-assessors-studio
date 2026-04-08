import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';
import type { StorageProvider } from './types.js';

/**
 * Legacy filesystem provider for reading attachments that were written
 * to disk under ./uploads/ before the storage abstraction was introduced.
 *
 * This provider is read-only in the sense that new uploads should not
 * target it. It exists solely so that the migration utility can read
 * old files and the download handler can fall back to it for records
 * whose storage_provider is still 'filesystem'.
 */
export class FilesystemStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(process.cwd(), 'uploads');
  }

  async put(key: string, data: Buffer, _metadata: { contentType: string }): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    logger.debug('FilesystemStorageProvider.put', { key });
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string }> {
    const fullPath = path.join(this.basePath, key);
    const data = await fs.readFile(fullPath);
    // The filesystem provider does not store content type alongside the
    // file. The caller is expected to read it from the database record.
    return { data, contentType: 'application/octet-stream' };
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    try {
      await fs.unlink(fullPath);
      logger.debug('FilesystemStorageProvider.delete', { key });
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
