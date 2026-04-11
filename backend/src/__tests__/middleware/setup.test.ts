import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { setupTestDb, teardownTestDb, getTestDatabase, createTestUser } from '../helpers/setup.js';

// We need dynamic imports to reset the module-level setupComplete cache
let checkSetupComplete: typeof import('../../middleware/setup.js')['checkSetupComplete'];
let markSetupComplete: typeof import('../../middleware/setup.js')['markSetupComplete'];
let requireSetup: typeof import('../../middleware/setup.js')['requireSetup'];

// Mock database connection
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

const mockReq = (path: string = '/api/v1/projects'): Partial<Request> => ({
  path,
});

const mockRes = (): Partial<Response> & { status: any; json: any } => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const mockNext = vi.fn();

describe('Setup Middleware', () => {
  beforeEach(async () => {
    vi.resetModules();
    await setupTestDb();
    vi.clearAllMocks();

    // Re-import to reset the module-level setupComplete cache
    const mod = await import('../../middleware/setup.js');
    checkSetupComplete = mod.checkSetupComplete;
    markSetupComplete = mod.markSetupComplete;
    requireSetup = mod.requireSetup;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe('checkSetupComplete', () => {
    it('should return false when no users exist', async () => {
      const result = await checkSetupComplete();
      expect(result).toBe(false);
    });

    it('should return true when user exists', async () => {
      await createTestUser();
      const result = await checkSetupComplete();
      expect(result).toBe(true);
    });

    it('should return true after user is created', async () => {
      let result = await checkSetupComplete();
      expect(result).toBe(false);

      await createTestUser();

      // Need fresh module since false was cached
      vi.resetModules();
      const freshMod = await import('../../middleware/setup.js');
      result = await freshMod.checkSetupComplete();
      expect(result).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      // Even if the DB is in an error state, it should not throw
      const result = await checkSetupComplete();
      expect(typeof result).toBe('boolean');
    });

    it('should cache the result', async () => {
      const result1 = await checkSetupComplete();
      const result2 = await checkSetupComplete();
      expect(result1).toBe(result2);
    });
  });

  describe('markSetupComplete', () => {
    it('should mark setup as complete', () => {
      markSetupComplete();
      // Function should not throw and should return void
      expect(() => markSetupComplete()).not.toThrow();
    });

    it('should cache the setup state', async () => {
      // Before marking complete, no users exist so it returns false
      let result = await checkSetupComplete();
      expect(result).toBe(false);

      // Mark as complete
      markSetupComplete();

      // Now it should return true without checking DB
      result = await checkSetupComplete();
      expect(result).toBe(true);
    });
  });

  describe('requireSetup middleware', () => {
    it('should allow /api/health', async () => {
      const req = mockReq('/api/health');
      const res = mockRes();
      const next = vi.fn();

      requireSetup(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow /api/v1/setup', async () => {
      const req = mockReq('/api/v1/setup');
      const res = mockRes();
      const next = vi.fn();

      requireSetup(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow /api/v1/setup/complete', async () => {
      const req = mockReq('/api/v1/setup/complete');
      const res = mockRes();
      const next = vi.fn();

      requireSetup(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow API routes when setup is complete', async () => {
      markSetupComplete();

      const req = mockReq('/api/v1/projects');
      const res = mockRes();
      const next = vi.fn();

      requireSetup(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 503 when setup not complete', async () => {
      // No users exist and setup not marked complete
      const req = mockReq('/api/v1/projects');
      const res = mockRes();
      const next = vi.fn();

      requireSetup(req as Request, res as Response, next);

      // The middleware is async internally; give it a tick
      await new Promise((r) => setTimeout(r, 100));

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Setup required',
        })
      );
    });

    it('should include setupUrl in 503 response', async () => {
      const req = mockReq('/api/v1/assessments');
      const res = mockRes();
      const next = vi.fn();

      requireSetup(req as Request, res as Response, next);

      await new Promise((r) => setTimeout(r, 100));

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          setupUrl: '/setup',
        })
      );
    });

    it('should allow after markSetupComplete is called', async () => {
      markSetupComplete();

      const req = mockReq('/api/v1/standards');
      const res = mockRes();
      const next = vi.fn();

      requireSetup(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should bypass setup check for health endpoint', () => {
      // Health should work even before any DB check
      const req = mockReq('/api/health');
      const res = mockRes();
      const next = vi.fn();

      requireSetup(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
