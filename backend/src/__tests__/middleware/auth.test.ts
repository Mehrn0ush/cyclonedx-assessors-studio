import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  hashApiKey,
  requireAuth,
  requireRole,
  requirePermission,
  tryAuthenticate,
  getPermissionsForRole,
} from '../../middleware/auth.js';
import { setupTestDb, teardownTestDb, getTestDatabase, createTestUser } from '../helpers/setup.js';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Mock database connection
vi.mock('../../db/connection.js', () => ({
  getDatabase: () => getTestDatabase(),
}));

// Mock config
vi.mock('../../config/index.js', () => ({
  getConfig: () => ({
    JWT_SECRET: 'test-secret-key-for-testing-32-chars-min',
  }),
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

interface TestRequest extends Partial<Request> {
  headers: Record<string, string | string[] | undefined>;
  cookies: Record<string, string | undefined>;
  user?: any;
  requestId?: string;
}

const mockReq = (overrides: Partial<TestRequest> = {}): TestRequest => ({
  headers: {},
  cookies: {},
  ...overrides,
});

const mockRes = (): Partial<Response> & { status: any; json: any } => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const mockNext = vi.fn();

describe('Auth Middleware', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe('hashApiKey', () => {
    it('should produce consistent SHA-256 hashes', () => {
      const key = 'test-api-key-12345';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('key-one');
      const hash2 = hashApiKey('key-two');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce valid SHA-256 hex string', () => {
      const key = 'test-key';
      const hash = hashApiKey(key);

      // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should be case-sensitive', () => {
      const hash1 = hashApiKey('TestKey');
      const hash2 = hashApiKey('testkey');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('requireAuth', () => {
    it('should return 401 when no credentials are provided', async () => {
      const req = mockReq();
      const res = mockRes();

      await requireAuth(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Authentication required') })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should authenticate with valid API key', async () => {
      const user = await createTestUser({ role: 'assessor' });
      const db = getTestDatabase();

      const apiKey = 'test-api-key-' + uuidv4();
      const keyHash = hashApiKey(apiKey);
      const apiKeyId = uuidv4();

      await db.insertInto('api_key').values({
        id: apiKeyId,
        name: 'Test Key',
        prefix: apiKey.substring(0, 8),
        key_hash: keyHash,
        user_id: user.id,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      }).execute();

      const req = mockReq({
        headers: { 'x-api-key': apiKey },
      });
      const res = mockRes();

      await requireAuth(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(user.id);
      expect(req.user?.role).toBe('assessor');
    });

    it('should return 401 for expired API key', async () => {
      const user = await createTestUser();
      const db = getTestDatabase();

      const apiKey = 'expired-api-key-' + uuidv4();
      const keyHash = hashApiKey(apiKey);

      await db.insertInto('api_key').values({
        id: uuidv4(),
        name: 'Expired Key',
        prefix: apiKey.substring(0, 8),
        key_hash: keyHash,
        user_id: user.id,
        expires_at: new Date(Date.now() - 1000), // 1 second ago
      }).execute();

      const req = mockReq({
        headers: { 'x-api-key': apiKey },
      });
      const res = mockRes();

      await requireAuth(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should authenticate with valid JWT cookie', async () => {
      const user = await createTestUser({ role: 'admin' });
      const db = getTestDatabase();

      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.insertInto('session').values({
        id: sessionId,
        user_id: user.id,
        token_hash: 'dummy-hash',
        expires_at: expiresAt,
      }).execute();

      const token = jwt.sign(
        { sessionId },
        'test-secret-key-for-testing-32-chars-min'
      );

      const req = mockReq({
        cookies: { token },
      });
      const res = mockRes();

      await requireAuth(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(user.id);
      expect(req.user?.role).toBe('admin');
    });

    it('should return 401 for invalid JWT token', async () => {
      const req = mockReq({
        cookies: { token: 'invalid.token.here' },
      });
      const res = mockRes();

      await requireAuth(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for expired session', async () => {
      const user = await createTestUser();
      const db = getTestDatabase();

      const sessionId = uuidv4();
      await db.insertInto('session').values({
        id: sessionId,
        user_id: user.id,
        token_hash: 'dummy-hash',
        expires_at: new Date(Date.now() - 1000), // Expired
      }).execute();

      const token = jwt.sign(
        { sessionId },
        'test-secret-key-for-testing-32-chars-min'
      );

      const req = mockReq({
        cookies: { token },
      });
      const res = mockRes();

      await requireAuth(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should prefer API key over cookie', async () => {
      const user1 = await createTestUser({ username: 'api-user' });
      const user2 = await createTestUser({ username: 'cookie-user' });
      const db = getTestDatabase();

      // Create API key for user1
      const apiKey = 'preferred-api-key-' + uuidv4();
      const keyHash = hashApiKey(apiKey);
      await db.insertInto('api_key').values({
        id: uuidv4(),
        name: 'Preferred Key',
        prefix: apiKey.substring(0, 8),
        key_hash: keyHash,
        user_id: user1.id,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).execute();

      // Create session for user2
      const sessionId = uuidv4();
      await db.insertInto('session').values({
        id: sessionId,
        user_id: user2.id,
        token_hash: 'dummy-hash',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).execute();

      const token = jwt.sign(
        { sessionId },
        'test-secret-key-for-testing-32-chars-min'
      );

      const req = mockReq({
        headers: { 'x-api-key': apiKey },
        cookies: { token },
      });
      const res = mockRes();

      await requireAuth(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.user?.id).toBe(user1.id); // Should be API key user
    });
  });

  describe('requireRole', () => {
    it('should return 401 if no user is authenticated', () => {
      const req = mockReq();
      const res = mockRes();
      const middleware = requireRole('admin');

      middleware(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass if user role matches', () => {
      const req = mockReq({
        user: {
          id: uuidv4(),
          username: 'test',
          email: 'test@example.com',
          role: 'admin',
          displayName: 'Test User',
        },
      });
      const res = mockRes();
      const middleware = requireRole('admin');

      middleware(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 403 if user role does not match', () => {
      const req = mockReq({
        user: {
          id: uuidv4(),
          username: 'test',
          email: 'test@example.com',
          role: 'assessee',
          displayName: 'Test User',
        },
      });
      const res = mockRes();
      const middleware = requireRole('admin');

      middleware(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass if user role matches any of multiple required roles', () => {
      const req = mockReq({
        user: {
          id: uuidv4(),
          username: 'test',
          email: 'test@example.com',
          role: 'assessor',
          displayName: 'Test User',
        },
      });
      const res = mockRes();
      const middleware = requireRole('admin', 'assessor', 'standards_manager');

      middleware(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 if user role does not match any required roles', () => {
      const req = mockReq({
        user: {
          id: uuidv4(),
          username: 'test',
          email: 'test@example.com',
          role: 'assessee',
          displayName: 'Test User',
        },
      });
      const res = mockRes();
      const middleware = requireRole('admin', 'assessor');

      middleware(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getPermissionsForRole', () => {
    it('should return permission keys for a role', async () => {
      const permissions = await getPermissionsForRole('assessor');

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions).toContain('assessments.view');
      expect(permissions).toContain('evidence.create');
    });

    it('should return empty array for non-existent role', async () => {
      const permissions = await getPermissionsForRole('nonexistent_role_xyz');

      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBe(0);
    });

    it('should return all admin permissions', async () => {
      const permissions = await getPermissionsForRole('admin');

      expect(permissions.length).toBeGreaterThan(20); // Admin has many permissions
      expect(permissions).toContain('admin.users');
      expect(permissions).toContain('admin.roles');
      expect(permissions).toContain('admin.settings');
    });

    it('should return subset of permissions for assessee role', async () => {
      const adminPerms = await getPermissionsForRole('admin');
      const assesseePerms = await getPermissionsForRole('assessee');

      expect(assesseePerms.length).toBeLessThan(adminPerms.length);
      // Assessee should not have admin permissions
      expect(assesseePerms).not.toContain('admin.users');
    });
  });

  describe('requirePermission', () => {
    it('should return 401 if no user is authenticated', async () => {
      const req = mockReq();
      const res = mockRes();
      const middleware = requirePermission('projects.view');

      await middleware(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass if user has required permission', async () => {
      const user = await createTestUser({ role: 'admin' });
      const req = mockReq({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: 'admin',
          displayName: 'Admin User',
        },
      });
      const res = mockRes();
      const middleware = requirePermission('admin.users');

      await middleware(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 if user lacks required permission', async () => {
      const user = await createTestUser({ role: 'assessee' });
      const req = mockReq({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: 'assessee',
          displayName: 'Assessee User',
        },
      });
      const res = mockRes();
      const middleware = requirePermission('admin.users');

      await middleware(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass if user has any of multiple required permissions', async () => {
      const user = await createTestUser({ role: 'assessor' });
      const req = mockReq({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: 'assessor',
          displayName: 'Assessor User',
        },
      });
      const res = mockRes();
      // Assessor should have evidence.create
      const middleware = requirePermission('evidence.create', 'admin.users');

      await middleware(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle permission check errors gracefully', async () => {
      const user = await createTestUser({ role: 'admin' });
      const req = mockReq({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: 'admin',
          displayName: 'Admin User',
        },
      });
      const res = mockRes();

      // Middleware should catch and handle errors
      const middleware = requirePermission('projects.view');
      await middleware(req as any, res as any, mockNext);

      // Should either pass or return 500, not throw
      expect(res.status).not.toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('tryAuthenticate', () => {
    it('should return null when no credentials provided', async () => {
      const req = mockReq();
      const user = await tryAuthenticate(req as any);

      expect(user).toBeNull();
    });

    it('should return user when valid API key provided', async () => {
      const testUser = await createTestUser({ role: 'assessor' });
      const db = getTestDatabase();

      const apiKey = 'try-auth-api-key-' + uuidv4();
      const keyHash = hashApiKey(apiKey);

      await db.insertInto('api_key').values({
        id: uuidv4(),
        name: 'Test Key',
        prefix: apiKey.substring(0, 8),
        key_hash: keyHash,
        user_id: testUser.id,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).execute();

      const req = mockReq({
        headers: { 'x-api-key': apiKey },
      });

      const user = await tryAuthenticate(req as any);

      expect(user).not.toBeNull();
      expect(user?.id).toBe(testUser.id);
    });

    it('should return user when valid JWT cookie provided', async () => {
      const testUser = await createTestUser({ role: 'admin' });
      const db = getTestDatabase();

      const sessionId = uuidv4();
      await db.insertInto('session').values({
        id: sessionId,
        user_id: testUser.id,
        token_hash: 'dummy-hash',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).execute();

      const token = jwt.sign(
        { sessionId },
        'test-secret-key-for-testing-32-chars-min'
      );

      const req = mockReq({
        cookies: { token },
      });

      const user = await tryAuthenticate(req as any);

      expect(user).not.toBeNull();
      expect(user?.id).toBe(testUser.id);
    });

    it('should not throw on authentication error', async () => {
      const req = mockReq({
        headers: { 'x-api-key': 'invalid-key' },
        cookies: { token: 'invalid-token' },
      });

      const user = await tryAuthenticate(req as any);

      expect(user).toBeNull();
    });

    it('should prefer API key over cookie', async () => {
      const user1 = await createTestUser({ username: 'api-user' });
      const user2 = await createTestUser({ username: 'cookie-user' });
      const db = getTestDatabase();

      const apiKey = 'try-auth-pref-' + uuidv4();
      const keyHash = hashApiKey(apiKey);
      await db.insertInto('api_key').values({
        id: uuidv4(),
        name: 'Test Key',
        prefix: apiKey.substring(0, 8),
        key_hash: keyHash,
        user_id: user1.id,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }).execute();

      const sessionId = uuidv4();
      await db.insertInto('session').values({
        id: sessionId,
        user_id: user2.id,
        token_hash: 'dummy-hash',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).execute();

      const token = jwt.sign(
        { sessionId },
        'test-secret-key-for-testing-32-chars-min'
      );

      const req = mockReq({
        headers: { 'x-api-key': apiKey },
        cookies: { token },
      });

      const user = await tryAuthenticate(req as any);

      expect(user?.id).toBe(user1.id);
    });
  });
});
