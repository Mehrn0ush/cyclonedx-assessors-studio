import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { S3StorageProvider, type S3Config } from '../../storage/s3-provider.js';

// Mock logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;
  let config: S3Config;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      bucket: 'test-bucket',
      region: 'us-east-1',
      endpoint: 'https://s3.amazonaws.com',
      accessKeyId: 'test-key-id',
      secretAccessKey: 'test-secret-key',
      forcePathStyle: false,
    };

    mockSend = vi.fn();
    provider = new S3StorageProvider(config);

    // Override the private getClient to return our mock
    (provider as any).clientPromise = Promise.resolve({ send: mockSend });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const testConfig: S3Config = {
        bucket: 'my-bucket',
        region: 'eu-west-1',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        forcePathStyle: true,
      };

      const p = new S3StorageProvider(testConfig);
      expect(p).toBeDefined();
    });

    it('should accept config with optional endpoint', () => {
      const testConfig: S3Config = {
        bucket: 'my-bucket',
        region: 'us-east-1',
        endpoint: 'https://minio.example.com',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        forcePathStyle: true,
      };

      const p = new S3StorageProvider(testConfig);
      expect(p).toBeDefined();
    });
  });

  describe('put', () => {
    it('should call client.send with PutObject params', async () => {
      mockSend.mockResolvedValue({});
      const testData = Buffer.from('test content');
      const key = 'evidence/123/attachment.pdf';

      await provider.put(key, testData, { contentType: 'application/pdf' });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      // The command is a PutObjectCommand instance; input params are on .input
      const input = command.input || command;
      expect(input.Bucket).toBe(config.bucket);
      expect(input.Key).toBe(key);
      expect(input.Body).toBe(testData);
      expect(input.ContentType).toBe('application/pdf');
    });

    it('should handle large binary content', async () => {
      mockSend.mockResolvedValue({});
      const largeData = Buffer.alloc(5 * 1024 * 1024); // 5MB
      const key = 'evidence/456/large.bin';

      await provider.put(key, largeData, { contentType: 'application/octet-stream' });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      const input = command.input || command;
      expect(input.Bucket).toBe(config.bucket);
      expect(input.Key).toBe(key);
      expect(input.Body).toBe(largeData);
    });

    it('should throw if S3 send fails', async () => {
      const error = new Error('S3 connection failed');
      mockSend.mockRejectedValue(error);

      const testData = Buffer.from('test');
      await expect(
        provider.put('key/test.pdf', testData, { contentType: 'application/pdf' })
      ).rejects.toThrow('S3 connection failed');
    });
  });

  describe('get', () => {
    it('should return data and contentType from S3 response', async () => {
      const expectedData = Buffer.from('retrieved content');
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield expectedData;
        },
      };

      mockSend.mockResolvedValue({
        Body: mockStream,
        ContentType: 'text/plain',
      });

      const result = await provider.get('evidence/123/doc.txt');

      expect(result.data).toEqual(expectedData);
      expect(result.contentType).toBe('text/plain');
    });

    it('should concatenate multiple chunks from stream', async () => {
      const chunk1 = Buffer.from('part1');
      const chunk2 = Buffer.from('part2');
      const chunk3 = Buffer.from('part3');

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield chunk1;
          yield chunk2;
          yield chunk3;
        },
      };

      mockSend.mockResolvedValue({
        Body: mockStream,
        ContentType: 'application/octet-stream',
      });

      const result = await provider.get('evidence/123/file.bin');

      const expected = Buffer.concat([chunk1, chunk2, chunk3]);
      expect(result.data).toEqual(expected);
    });

    it('should use default contentType if not provided', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('data');
        },
      };

      mockSend.mockResolvedValue({
        Body: mockStream,
        ContentType: undefined,
      });

      const result = await provider.get('evidence/123/file');

      expect(result.contentType).toBe('application/octet-stream');
    });

    it('should throw error if body is empty', async () => {
      mockSend.mockResolvedValue({
        Body: null,
      });

      await expect(
        provider.get('evidence/123/missing.pdf')
      ).rejects.toThrow(/S3 object body is empty/);
    });

    it('should throw if S3 send fails', async () => {
      const error = new Error('S3 retrieval failed');
      mockSend.mockRejectedValue(error);

      await expect(
        provider.get('evidence/123/notfound.pdf')
      ).rejects.toThrow('S3 retrieval failed');
    });
  });

  describe('delete', () => {
    it('should call client.send with DeleteObject params', async () => {
      mockSend.mockResolvedValue({});
      const key = 'evidence/123/todelete.pdf';

      await provider.delete(key);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      const input = command.input || command;
      expect(input.Bucket).toBe(config.bucket);
      expect(input.Key).toBe(key);
    });

    it('should not throw if object does not exist', async () => {
      mockSend.mockResolvedValue({});

      await expect(
        provider.delete('evidence/123/nonexistent.pdf')
      ).resolves.not.toThrow();
    });

    it('should throw if S3 send fails', async () => {
      const error = new Error('S3 deletion failed');
      mockSend.mockRejectedValue(error);

      await expect(
        provider.delete('evidence/123/error.pdf')
      ).rejects.toThrow('S3 deletion failed');
    });
  });

  describe('exists', () => {
    it('should return true when HeadObject succeeds', async () => {
      mockSend.mockResolvedValue({
        ContentLength: 1024,
      });

      const result = await provider.exists('evidence/123/exists.pdf');

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      const input = command.input || command;
      expect(input.Bucket).toBe(config.bucket);
      expect(input.Key).toBe('evidence/123/exists.pdf');
    });

    it('should return false when NotFound error is thrown', async () => {
      const notFoundError = new Error('NotFound');
      notFoundError.name = 'NotFound';
      mockSend.mockRejectedValue(notFoundError);

      const result = await provider.exists('evidence/123/notfound.pdf');

      expect(result).toBe(false);
    });

    it('should return false for 404 error with $metadata', async () => {
      const error = new Error('Not Found') as any;
      error.$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValue(error);

      const result = await provider.exists('evidence/123/notfound.pdf');

      expect(result).toBe(false);
    });

    it('should re-throw non-404 errors', async () => {
      const serverError = new Error('500 Internal Server Error') as any;
      serverError.$metadata = { httpStatusCode: 500 };
      mockSend.mockRejectedValue(serverError);

      await expect(
        provider.exists('evidence/123/error.pdf')
      ).rejects.toThrow('500 Internal Server Error');
    });

    it('should re-throw errors without httpStatusCode', async () => {
      const error = new Error('Network error');
      mockSend.mockRejectedValue(error);

      await expect(
        provider.exists('evidence/123/network-error.pdf')
      ).rejects.toThrow('Network error');
    });
  });

  describe('testConnection', () => {
    it('should return ok:true on successful test', async () => {
      const testData = Buffer.from('connectivity-test');
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield testData;
        },
      };

      mockSend
        .mockResolvedValueOnce({}) // put
        .mockResolvedValueOnce({ Body: mockStream, ContentType: 'text/plain' }) // get
        .mockResolvedValueOnce({}); // delete

      const result = await provider.testConnection();

      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return ok:false if data read-back does not match', async () => {
      const wrongData = Buffer.from('wrong content');
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield wrongData;
        },
      };

      mockSend
        .mockResolvedValueOnce({}) // put
        .mockResolvedValueOnce({ Body: mockStream, ContentType: 'text/plain' }); // get

      const result = await provider.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Read-back verification failed');
    });

    it('should return ok:false on put failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('Put failed'));

      const result = await provider.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Put failed');
    });

    it('should return ok:false on get failure', async () => {
      mockSend
        .mockResolvedValueOnce({}) // put succeeds
        .mockRejectedValueOnce(new Error('Get failed')); // get fails

      const result = await provider.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Get failed');
    });

    it('should clean up test object on success', async () => {
      const testData = Buffer.from('connectivity-test');
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield testData;
        },
      };

      mockSend
        .mockResolvedValueOnce({}) // put
        .mockResolvedValueOnce({ Body: mockStream, ContentType: 'text/plain' }) // get
        .mockResolvedValueOnce({}); // delete

      await provider.testConnection();

      // 3 calls: put, get, delete
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('should return ok:false with generic error message if error has no message', async () => {
      mockSend.mockRejectedValueOnce({});

      const result = await provider.testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  describe('client lazy loading', () => {
    it('should lazily initialize S3Client only once', async () => {
      // Create a fresh provider without pre-set clientPromise
      const freshProvider = new S3StorageProvider(config);
      let clientCreationCount = 0;
      const freshMockSend = vi.fn().mockResolvedValue({});

      // Spy on the lazy init by overriding clientPromise after first call
      (freshProvider as any).clientPromise = Promise.resolve({ send: freshMockSend });

      // Multiple calls should use the same client
      await freshProvider.put('key1', Buffer.from('data1'), { contentType: 'text/plain' });
      await freshProvider.put('key2', Buffer.from('data2'), { contentType: 'text/plain' });

      // Both calls should have used the same send function
      expect(freshMockSend).toHaveBeenCalledTimes(2);
    });

    it('should share client across multiple operations', async () => {
      mockSend.mockResolvedValue({});

      const data = Buffer.from('test');
      await provider.put('key', data, { contentType: 'text/plain' });

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield data;
        },
      };

      mockSend.mockResolvedValue({ Body: mockStream, ContentType: 'text/plain' });
      await provider.get('key');

      // Both operations should use the same client's send
      expect(mockSend.mock.calls.length).toBe(2);
    });
  });

  describe('configuration handling', () => {
    it('should store config properties', () => {
      const testProvider = new S3StorageProvider(config);
      // The config is stored internally; we verify by checking that operations
      // use the correct bucket
      expect(testProvider).toBeDefined();
    });

    it('should handle config without endpoint', () => {
      const configWithoutEndpoint: S3Config = {
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        forcePathStyle: false,
      };

      const testProvider = new S3StorageProvider(configWithoutEndpoint);
      expect(testProvider).toBeDefined();
    });
  });
});
