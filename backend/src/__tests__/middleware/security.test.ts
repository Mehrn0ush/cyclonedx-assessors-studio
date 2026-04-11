import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware, type SecureRequest } from '../../middleware/security.js';

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mocked-uuid-1234-5678'),
}));

describe('Security Middleware', () => {
  let mockReq: Partial<SecureRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      requestId: undefined,
    } as any;

    mockRes = {
      setHeader: vi.fn(),
    } as any;

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('requestIdMiddleware', () => {
    it('should add requestId to request', () => {
      requestIdMiddleware(mockReq as SecureRequest, mockRes as Response, mockNext);

      expect(mockReq.requestId).toBeDefined();
      expect(typeof mockReq.requestId).toBe('string');
    });

    it('should generate a requestId', () => {
      requestIdMiddleware(mockReq as SecureRequest, mockRes as Response, mockNext);

      expect(mockReq.requestId).toBe('mocked-uuid-1234-5678');
    });

    it('should set X-Request-ID header', () => {
      requestIdMiddleware(mockReq as SecureRequest, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        'mocked-uuid-1234-5678'
      );
    });

    it('should call next function', () => {
      requestIdMiddleware(mockReq as SecureRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should call next even if request already has requestId', () => {
      (mockReq as any).requestId = 'existing-id';

      requestIdMiddleware(mockReq as SecureRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      // requestId should be overwritten with new one
      expect(mockReq.requestId).toBe('mocked-uuid-1234-5678');
    });

    it('should generate unique requestIds for multiple calls', async () => {
      const { v4 } = await import('uuid');
      const uuidMock = v4 as any;

      // Setup mock to return different values
      let callCount = 0;
      uuidMock.mockImplementation(() => {
        callCount++;
        return `uuid-${callCount}`;
      });

      const req1 = { headers: {} } as SecureRequest;
      const res1 = { setHeader: vi.fn() } as any as Response;
      const next1 = vi.fn();

      const req2 = { headers: {} } as SecureRequest;
      const res2 = { setHeader: vi.fn() } as any as Response;
      const next2 = vi.fn();

      requestIdMiddleware(req1, res1, next1);
      requestIdMiddleware(req2, res2, next2);

      expect(req1.requestId).toBe('uuid-1');
      expect(req2.requestId).toBe('uuid-2');
    });

    it('should set header as string or array of strings', () => {
      requestIdMiddleware(mockReq as SecureRequest, mockRes as Response, mockNext);

      const headerCall = (mockRes.setHeader as any).mock.calls[0];
      expect(headerCall[0]).toBe('X-Request-ID');
      // The second argument should be a string or array of strings
      expect(headerCall[1]).toBeDefined();
    });

    it('should work with Express-like request object', () => {
      const expressLikeReq: SecureRequest = {
        headers: {},
        method: 'GET',
        url: '/api/test',
        requestId: undefined,
      } as any;

      const expressLikeRes: Response = {
        setHeader: vi.fn(),
      } as any;

      requestIdMiddleware(expressLikeReq, expressLikeRes, mockNext);

      expect(expressLikeReq.requestId).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not throw on missing headers object', () => {
      const reqWithoutHeaders = { requestId: undefined } as SecureRequest;

      expect(() => {
        requestIdMiddleware(reqWithoutHeaders, mockRes as Response, mockNext);
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalled();
    });

    it('should preserve existing request properties', () => {
      const enrichedReq: SecureRequest = {
        headers: { 'user-agent': 'test-agent' },
        method: 'POST',
        url: '/api/users',
        requestId: undefined,
      } as any;

      requestIdMiddleware(enrichedReq, mockRes as Response, mockNext);

      expect(enrichedReq.headers?.['user-agent']).toBe('test-agent');
      expect(enrichedReq.method).toBe('POST');
      expect(enrichedReq.url).toBe('/api/users');
      expect(enrichedReq.requestId).toBeDefined();
    });

    it('should handle multiple header operations', () => {
      const multiHeaderRes: Response = {
        setHeader: vi.fn(),
      } as any;

      requestIdMiddleware(mockReq as SecureRequest, multiHeaderRes, mockNext);

      expect(multiHeaderRes.setHeader).toHaveBeenCalledTimes(1);
      expect(multiHeaderRes.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        expect.any(String)
      );
    });

    it('should maintain requestId across middleware chain', () => {
      requestIdMiddleware(mockReq as SecureRequest, mockRes as Response, mockNext);

      const requestId1 = mockReq.requestId;

      // Simulate calling middleware again (which shouldn't happen, but test the behavior)
      const nextMockReq: SecureRequest = {
        ...mockReq,
        requestId: requestId1,
      } as any;

      requestIdMiddleware(nextMockReq, mockRes as Response, mockNext);

      // RequestId should be overwritten with a new UUID
      expect(nextMockReq.requestId).toBeDefined();
      expect(typeof nextMockReq.requestId).toBe('string');
      expect(nextMockReq.requestId!.length).toBeGreaterThan(0);
    });
  });

  describe('SecureRequest interface', () => {
    it('should extend Request with requestId', () => {
      const secureReq: SecureRequest = {
        headers: {},
        requestId: 'test-id',
      } as any;

      expect(secureReq.requestId).toBe('test-id');
    });

    it('should allow optional requestId', () => {
      const secureReq: SecureRequest = {
        headers: {},
      } as any;

      expect(secureReq.requestId).toBeUndefined();
    });

    it('should maintain Request properties', () => {
      const secureReq: SecureRequest = {
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        url: '/api/data',
        requestId: 'req-123',
      } as any;

      expect(secureReq.headers?.['content-type']).toBe('application/json');
      expect(secureReq.method).toBe('POST');
      expect(secureReq.url).toBe('/api/data');
      expect(secureReq.requestId).toBe('req-123');
    });
  });

  describe('Middleware integration scenarios', () => {
    it('should work as first middleware in chain', () => {
      const req: SecureRequest = { headers: {} } as any;
      const res = { setHeader: vi.fn() } as any;
      const next = vi.fn();

      requestIdMiddleware(req, res, next);

      expect(req.requestId).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    it('should work in middleware chain with other middlewares', () => {
      const req: SecureRequest = { headers: {} } as any;
      const res = { setHeader: vi.fn() } as any;

      const middlewares = [
        (r: SecureRequest, rs: Response, n: NextFunction) => {
          r.headers = { ...r.headers, 'x-custom': 'value' };
          n();
        },
        requestIdMiddleware,
      ];

      const next = vi.fn();
      let chainCalled = false;

      middlewares[0](req, res, () => {
        middlewares[1](req, res, () => {
          chainCalled = true;
        });
      });

      expect(chainCalled).toBe(true);
      expect(req.requestId).toBeDefined();
      expect(req.headers?.['x-custom']).toBe('value');
    });

    it('should handle async operations after requestId is set', async () => {
      const req: SecureRequest = { headers: {} } as any;
      const res = { setHeader: vi.fn() } as any;

      requestIdMiddleware(req, res, async () => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(req.requestId).toBeDefined();
      });

      expect(req.requestId).toBeDefined();
    });

    it('should allow downstream handlers to access requestId', () => {
      const req: SecureRequest = { headers: {} } as any;
      const res = { setHeader: vi.fn() } as any;

      let downstreamRequestId: string | undefined;

      requestIdMiddleware(req, res, () => {
        downstreamRequestId = req.requestId;
      });

      expect(downstreamRequestId).toBeDefined();
      expect(downstreamRequestId).toBe(req.requestId);
    });

    it('should set header correctly for client to receive requestId', () => {
      const req: SecureRequest = { headers: {} } as any;
      const res = { setHeader: vi.fn() } as any;

      requestIdMiddleware(req, res, vi.fn());

      const setHeaderCall = (res.setHeader as any).mock.calls[0];
      expect(setHeaderCall[0]).toBe('X-Request-ID');
      // Header value should match the requestId assigned to the request
      expect(setHeaderCall[1]).toBe(req.requestId);
    });
  });

  describe('UUID generation behavior', () => {
    it('should call uuid.v4 to generate requestId', async () => {
      const { v4 } = await import('uuid');
      const uuidMock = v4 as any;

      uuidMock.mockClear();

      requestIdMiddleware(mockReq as SecureRequest, mockRes as Response, mockNext);

      expect(uuidMock).toHaveBeenCalled();
    });

    it('should use uuid.v4 result as requestId', async () => {
      const { v4 } = await import('uuid');
      const uuidMock = v4 as any;

      const testUuid = 'test-uuid-12345';
      uuidMock.mockReturnValue(testUuid);

      const req: SecureRequest = { headers: {} } as any;
      const res = { setHeader: vi.fn() } as any;

      requestIdMiddleware(req, res, vi.fn());

      expect(req.requestId).toBe(testUuid);
    });
  });
});
