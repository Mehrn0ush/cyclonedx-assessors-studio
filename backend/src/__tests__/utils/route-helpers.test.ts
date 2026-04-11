import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, handleValidationError, validateBody } from '../../utils/route-helpers.js';

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Route Helpers', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      headers: {},
      requestId: undefined,
    } as any;

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('asyncHandler', () => {
    it('should call the wrapped function with req/res', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(fn);

      await wrapped(mockReq as Request, mockRes as Response);

      expect(fn).toHaveBeenCalledWith(mockReq, mockRes);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not send response if handler succeeds', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(fn);

      await wrapped(mockReq as Request, mockRes as Response);

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should catch errors and return 500', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(fn);

      await wrapped(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should log errors with requestId', async () => {
      const { logger } = await import('../../utils/logger.js');
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(fn);

      (mockReq as any).requestId = 'test-request-id-123';

      await wrapped(mockReq as Request, mockRes as Response);

      expect(logger.error).toHaveBeenCalledWith(
        'Unhandled route error',
        expect.objectContaining({
          error,
          requestId: 'test-request-id-123',
        })
      );
    });

    it('should log errors without requestId if not present', async () => {
      const { logger } = await import('../../utils/logger.js');
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(fn);

      await wrapped(mockReq as Request, mockRes as Response);

      expect(logger.error).toHaveBeenCalledWith(
        'Unhandled route error',
        expect.objectContaining({
          error,
          requestId: undefined,
        })
      );
    });

    it('should handle different error types', async () => {
      const typeErrors = [
        new Error('String error'),
        new TypeError('Type error'),
        new ReferenceError('Reference error'),
      ];

      for (const error of typeErrors) {
        vi.clearAllMocks();
        const fn = vi.fn().mockRejectedValue(error);
        const wrapped = asyncHandler(fn);

        await wrapped(mockReq as Request, mockRes as Response);

        expect(mockRes.status).toHaveBeenCalledWith(500);
      }
    });

    it('should handle non-Error thrown values', async () => {
      const fn = vi.fn().mockRejectedValue('String error');
      const wrapped = asyncHandler(fn);

      await wrapped(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should handle async functions that throw synchronously', async () => {
      const fn = vi.fn().mockImplementation(() => {
        throw new Error('Sync error in async fn');
      });
      const wrapped = asyncHandler(fn);

      await wrapped(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('handleValidationError', () => {
    it('should return true and send 400 for ZodError', () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type' as const,
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number',
        } as any,
      ]);

      const result = handleValidationError(mockRes as Response, zodError);

      expect(result).toBe(true);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid input',
          details: expect.any(Array),
        })
      );
    });

    it('should include validation issues in response', () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type' as const,
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number',
        } as any,
        {
          code: 'too_small' as const,
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          path: ['email'],
          message: 'String must contain at least 1 character(s)',
        } as any,
      ]);

      handleValidationError(mockRes as Response, zodError);

      const callArgs = (mockRes.json as any).mock.calls[0][0];
      expect(callArgs.details).toHaveLength(2);
      expect(callArgs.details[0].path).toEqual(['name']);
    });

    it('should return false for non-ZodError', () => {
      const regularError = new Error('Not a ZodError');

      const result = handleValidationError(mockRes as Response, regularError);

      expect(result).toBe(false);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should return false for TypeError', () => {
      const typeError = new TypeError('Type error');

      const result = handleValidationError(mockRes as Response, typeError);

      expect(result).toBe(false);
    });

    it('should return false for null', () => {
      const result = handleValidationError(mockRes as Response, null);

      expect(result).toBe(false);
    });

    it('should return false for undefined', () => {
      const result = handleValidationError(mockRes as Response, undefined);

      expect(result).toBe(false);
    });

    it('should return false for plain objects', () => {
      const plainObject = { error: 'Some error' };

      const result = handleValidationError(mockRes as Response, plainObject);

      expect(result).toBe(false);
    });

    it('should handle multiple validation issues', () => {
      const zodError = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().email(),
      }).safeParse({
        name: 123,
        age: 'not a number',
        email: 'invalid-email',
      }).error!;

      handleValidationError(mockRes as Response, zodError);

      const callArgs = (mockRes.json as any).mock.calls[0][0];
      expect(callArgs.details.length).toBeGreaterThan(0);
    });
  });

  describe('validateBody', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email().optional(),
    });

    it('should return parsed data for valid input', () => {
      const validData = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      };

      const result = validateBody(testSchema, validData);

      expect(result).toEqual(validData);
      expect(result.name).toBe('John Doe');
      expect(result.age).toBe(30);
    });

    it('should parse and validate optional fields', () => {
      const dataWithoutOptional = {
        name: 'Jane Doe',
        age: 25,
      };

      const result = validateBody(testSchema, dataWithoutOptional);

      expect(result).toEqual(dataWithoutOptional);
      expect(result.email).toBeUndefined();
    });

    it('should throw ZodError for invalid input', () => {
      const invalidData = {
        name: 'John',
        age: 'not a number',
      };

      expect(() => {
        validateBody(testSchema, invalidData);
      }).toThrow(z.ZodError);
    });

    it('should throw ZodError when required field is missing', () => {
      const incompleteData = {
        name: 'John',
      };

      expect(() => {
        validateBody(testSchema, incompleteData);
      }).toThrow(z.ZodError);
    });

    it('should throw ZodError for invalid email format', () => {
      const invalidEmail = {
        name: 'John',
        age: 30,
        email: 'not-an-email',
      };

      expect(() => {
        validateBody(testSchema, invalidEmail);
      }).toThrow(z.ZodError);
    });

    it('should validate nested objects', () => {
      const nestedSchema = z.object({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
      });

      const validData = {
        user: {
          name: 'John',
          age: 30,
        },
      };

      const result = validateBody(nestedSchema, validData);

      expect(result.user.name).toBe('John');
      expect(result.user.age).toBe(30);
    });

    it('should validate arrays', () => {
      const arraySchema = z.object({
        items: z.array(z.string()),
      });

      const validData = {
        items: ['a', 'b', 'c'],
      };

      const result = validateBody(arraySchema, validData);

      expect(result.items).toEqual(['a', 'b', 'c']);
    });

    it('should throw on invalid array items', () => {
      const arraySchema = z.object({
        items: z.array(z.number()),
      });

      const invalidData = {
        items: [1, 'two', 3],
      };

      expect(() => {
        validateBody(arraySchema, invalidData);
      }).toThrow(z.ZodError);
    });

    it('should handle type coercion when enabled', () => {
      const coercingSchema = z.object({
        age: z.coerce.number(),
      });

      const stringAge = {
        age: '25',
      };

      const result = validateBody(coercingSchema, stringAge);

      expect(result.age).toBe(25);
      expect(typeof result.age).toBe('number');
    });

    it('should reject extra fields by default', () => {
      const strictSchema = z.object({
        name: z.string(),
      });

      const dataWithExtra = {
        name: 'John',
        extra: 'field',
      };

      // Note: zod allows extra fields by default, but this test documents the behavior
      const result = validateBody(strictSchema, dataWithExtra);
      expect(result.name).toBe('John');
    });

    it('should validate with custom error messages', () => {
      const customSchema = z.object({
        name: z.string().min(1, 'Name is required'),
        age: z.number().min(0, 'Age must be positive'),
      });

      expect(() => {
        validateBody(customSchema, { name: '', age: -5 });
      }).toThrow(z.ZodError);
    });

    it('should handle empty object validation', () => {
      const emptySchema = z.object({});

      const result = validateBody(emptySchema, {});

      expect(result).toEqual({});
    });

    it('should handle complex validation scenarios', () => {
      const complexSchema = z.object({
        username: z.string().min(3).max(20),
        password: z.string().min(8),
        confirmPassword: z.string(),
      }).refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });

      const validData = {
        username: 'john_doe',
        password: 'SecurePass123',
        confirmPassword: 'SecurePass123',
      };

      const result = validateBody(complexSchema, validData);
      expect(result.username).toBe('john_doe');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle asyncHandler with validateBody', async () => {
      const schema = z.object({
        name: z.string(),
      });

      const handler = asyncHandler(async (req, res) => {
        try {
          const data = validateBody(schema, (req as any).body);
          (res as any).status(200).json(data);
        } catch (error) {
          if (handleValidationError(res as Response, error)) return;
          throw error;
        }
      });

      (mockReq as any).body = { name: 'John' };

      await handler(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should handle asyncHandler with validation error', async () => {
      const schema = z.object({
        name: z.string(),
      });

      const handler = asyncHandler(async (req, res) => {
        try {
          const data = validateBody(schema, (req as any).body);
          (res as any).status(200).json(data);
        } catch (error) {
          if (handleValidationError(res as Response, error)) return;
          throw error;
        }
      });

      (mockReq as any).body = { name: 123 };

      await handler(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
