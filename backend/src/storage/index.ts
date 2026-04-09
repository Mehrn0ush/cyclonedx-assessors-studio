import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { StorageProvider, StorageProviderName } from './types.js';
import { DatabaseStorageProvider } from './database-provider.js';
import { S3StorageProvider } from './s3-provider.js';

export type { StorageProvider, StorageProviderName } from './types.js';
export { DatabaseStorageProvider } from './database-provider.js';
export { S3StorageProvider } from './s3-provider.js';

let activeProvider: StorageProvider | null = null;
let activeProviderName: StorageProviderName = 'database';

/**
 * Initialize the storage provider based on the current configuration.
 * Must be called after the database is initialized (the database
 * provider depends on the Kysely connection).
 */
export function initializeStorage(): void {
  const config = getConfig();
  activeProviderName = config.STORAGE_PROVIDER as StorageProviderName;

  switch (activeProviderName) {
    case 's3': {
      if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
        throw new Error(
          'S3 storage provider requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY environment variables'
        );
      }
      activeProvider = new S3StorageProvider({
        bucket: config.S3_BUCKET,
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT || undefined,
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
      });
      logger.info('Storage provider initialized: S3', {
        bucket: config.S3_BUCKET,
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT || '(default)',
      });
      break;
    }
    case 'database':
    default: {
      activeProvider = new DatabaseStorageProvider();
      logger.info('Storage provider initialized: database');
      break;
    }
  }
}

/**
 * Get the currently active storage provider (for new uploads).
 */
export function getStorageProvider(): StorageProvider {
  if (!activeProvider) {
    throw new Error('Storage not initialized. Call initializeStorage() first.');
  }
  return activeProvider;
}

/**
 * Get the name of the currently active storage provider.
 */
export function getStorageProviderName(): StorageProviderName {
  return activeProviderName;
}

/**
 * Resolve a storage provider by name. Used by the download handler to
 * serve attachments from whichever backend they were originally stored
 * in, regardless of the currently configured provider.
 */
export function resolveProvider(name: StorageProviderName): StorageProvider {
  switch (name) {
    case 's3': {
      const config = getConfig();
      return new S3StorageProvider({
        bucket: config.S3_BUCKET || '',
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT || undefined,
        accessKeyId: config.S3_ACCESS_KEY_ID || '',
        secretAccessKey: config.S3_SECRET_ACCESS_KEY || '',
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
      });
    }
    case 'database':
    default:
      return new DatabaseStorageProvider();
  }
}

/**
 * Get the configured maximum upload file size in bytes.
 */
export function getMaxFileSize(): number {
  const config = getConfig();
  return config.UPLOAD_MAX_FILE_SIZE;
}
