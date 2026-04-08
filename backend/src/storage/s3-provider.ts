import { logger } from '../utils/logger.js';
import type { StorageProvider } from './types.js';

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Stores evidence attachment content in an S3-compatible object store.
 *
 * Works with AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, and any
 * other service that exposes the S3 API.
 *
 * The @aws-sdk/client-s3 package is loaded lazily so that deployments
 * using only the database provider do not need the dependency installed.
 */
export class S3StorageProvider implements StorageProvider {
  private config: S3Config;
  private clientPromise: Promise<any> | null = null;

  constructor(config: S3Config) {
    this.config = config;
  }

  private async getClient(): Promise<any> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        try {
          const { S3Client } = await import('@aws-sdk/client-s3');
          const clientConfig: any = {
            region: this.config.region,
            credentials: {
              accessKeyId: this.config.accessKeyId,
              secretAccessKey: this.config.secretAccessKey,
            },
            forcePathStyle: this.config.forcePathStyle,
          };

          if (this.config.endpoint) {
            clientConfig.endpoint = this.config.endpoint;
          }

          return new S3Client(clientConfig);
        } catch (error) {
          throw new Error(
            'Failed to initialize S3 client. Ensure @aws-sdk/client-s3 is installed: npm install @aws-sdk/client-s3'
          );
        }
      })();
    }
    return this.clientPromise;
  }

  async put(key: string, data: Buffer, metadata: { contentType: string }): Promise<void> {
    const client = await this.getClient();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    await client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: metadata.contentType,
      })
    );

    logger.debug('S3StorageProvider.put', { key, bucket: this.config.bucket });
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string }> {
    const client = await this.getClient();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');

    const response = await client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    );

    const stream = response.Body;
    if (!stream) {
      throw new Error(`S3 object body is empty for key: ${key}`);
    }

    // Convert the readable stream to a Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return {
      data: Buffer.concat(chunks),
      contentType: response.ContentType || 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    const client = await this.getClient();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    );

    logger.debug('S3StorageProvider.delete', { key, bucket: this.config.bucket });
  }

  async exists(key: string): Promise<boolean> {
    const client = await this.getClient();
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Write and then read a small test object to verify connectivity.
   * Returns an object describing success or failure.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const testKey = `_assessors-studio-test/${Date.now()}.txt`;
    const testData = Buffer.from('connectivity-test');

    try {
      await this.put(testKey, testData, { contentType: 'text/plain' });
      const result = await this.get(testKey);

      if (result.data.toString() !== 'connectivity-test') {
        return { ok: false, error: 'Read-back verification failed' };
      }

      await this.delete(testKey);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message || 'Unknown error' };
    }
  }
}
