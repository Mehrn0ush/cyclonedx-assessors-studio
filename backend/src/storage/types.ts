/**
 * Storage provider abstraction for evidence attachments.
 *
 * Each provider implements read, write, delete, and existence checks
 * against a particular backend (database, S3, etc.).
 */
export interface StorageProvider {
  /** Write content to the given key. */
  put(key: string, data: Buffer, metadata: { contentType: string }): Promise<void>;

  /** Read content from the given key. */
  get(key: string): Promise<{ data: Buffer; contentType: string }>;

  /** Delete content at the given key. */
  delete(key: string): Promise<void>;

  /** Check whether content exists at the given key. */
  exists(key: string): Promise<boolean>;
}

export type StorageProviderName = 'database' | 's3' | 'filesystem';
