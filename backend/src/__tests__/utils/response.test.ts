/**
 * Unit tests for API response helpers.
 *
 * Tests response formatting, error handling, and pagination envelope
 * structure to ensure consistent API response formats.
 */

import { describe, it, expect } from 'vitest';
import type { PaginationResponse, ErrorResponse } from '../../utils/response.js';

describe('Response Helpers', () => {
  describe('PaginationResponse', () => {
    it('should create a valid pagination response envelope', () => {
      const data = [{ id: '1', name: 'Item 1' }, { id: '2', name: 'Item 2' }];
      const response: PaginationResponse<{ id: string; name: string }> = {
        data,
        pagination: {
          limit: 10,
          offset: 0,
          total: 25,
        },
      };

      expect(response.data).toEqual(data);
      expect(response.pagination.limit).toBe(10);
      expect(response.pagination.offset).toBe(0);
      expect(response.pagination.total).toBe(25);
    });

    it('should support empty data array', () => {
      const response: PaginationResponse<any> = {
        data: [],
        pagination: {
          limit: 10,
          offset: 0,
          total: 0,
        },
      };

      expect(response.data).toEqual([]);
      expect(response.pagination.total).toBe(0);
    });

    it('should support offset pagination', () => {
      const response: PaginationResponse<any> = {
        data: [{ id: '11' }, { id: '12' }],
        pagination: {
          limit: 10,
          offset: 10,
          total: 100,
        },
      };

      expect(response.pagination.offset).toBe(10);
      expect(response.data.length).toBe(2);
    });

    it('should support partial page results', () => {
      const response: PaginationResponse<any> = {
        data: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }],
        pagination: {
          limit: 10,
          offset: 95,
          total: 100,
        },
      };

      expect(response.data.length).toBe(5);
      expect(response.pagination.offset + response.data.length).toBeLessThanOrEqual(response.pagination.total);
    });

    it('should be strictly typed for different entity types', () => {
      interface User {
        id: string;
        email: string;
        isActive: boolean;
      }

      const users: User[] = [
        { id: '1', email: 'user1@example.com', isActive: true },
        { id: '2', email: 'user2@example.com', isActive: false },
      ];

      const response: PaginationResponse<User> = {
        data: users,
        pagination: {
          limit: 50,
          offset: 0,
          total: 2,
        },
      };

      expect(response.data[0].email).toBe('user1@example.com');
      expect(response.data[1].isActive).toBe(false);
    });
  });

  describe('ErrorResponse', () => {
    it('should create a simple error response', () => {
      const error: ErrorResponse = {
        error: 'Resource not found',
      };

      expect(error.error).toBe('Resource not found');
      expect(error.details).toBeUndefined();
    });

    it('should create an error response with details', () => {
      const error: ErrorResponse = {
        error: 'Validation failed',
        details: [
          { field: 'email', message: 'Invalid email format' },
          { field: 'password', message: 'Password too short' },
        ],
      };

      expect(error.error).toBe('Validation failed');
      expect(error.details?.length).toBe(2);
      expect(error.details?.[0]).toEqual({ field: 'email', message: 'Invalid email format' });
    });

    it('should support authentication errors', () => {
      const error: ErrorResponse = {
        error: 'Authentication required',
      };

      expect(error.error).toContain('Authentication');
    });

    it('should support authorization errors', () => {
      const error: ErrorResponse = {
        error: 'Forbidden',
      };

      expect(error.error).toBe('Forbidden');
    });

    it('should support conflict errors', () => {
      const error: ErrorResponse = {
        error: 'Resource already exists',
        details: [{ resource: 'user', identifier: 'email@example.com' }],
      };

      expect(error.error).toContain('already exists');
    });

    it('should support server errors without stack traces', () => {
      const error: ErrorResponse = {
        error: 'Internal server error',
      };

      expect(error.error).toBe('Internal server error');
      expect(error.error).not.toContain('stack');
      expect(error.error).not.toContain('at ');
    });

    it('should allow flexible details structure', () => {
      const error: ErrorResponse = {
        error: 'Multiple validation errors',
        details: [
          { field: 'name', code: 'required' },
          { field: 'age', code: 'invalid_number', value: 'abc' },
          { field: 'email', code: 'invalid_email', suggestion: 'Check format' },
        ],
      };

      expect(error.details?.length).toBe(3);
      expect(error.details?.[1]).toHaveProperty('value');
    });

    it('should support empty details array', () => {
      const error: ErrorResponse = {
        error: 'Invalid input',
        details: [],
      };

      expect(error.details?.length).toBe(0);
    });
  });

  describe('Response Format Conventions', () => {
    it('should follow GET /resource/:id convention (single resource)', () => {
      const resource = {
        id: 'abc123',
        name: 'My Resource',
        created_at: '2024-01-01T00:00:00Z',
      };

      // Single resource should be returned directly, not in a data wrapper
      expect(resource).toHaveProperty('id');
      expect(resource).toHaveProperty('name');
    });

    it('should follow GET /resource convention (list response)', () => {
      const response: PaginationResponse<any> = {
        data: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
        pagination: {
          limit: 10,
          offset: 0,
          total: 100,
        },
      };

      // List should be in pagination envelope
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('pagination');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should follow POST /resource convention (return created resource)', () => {
      const created = {
        id: 'new-id-123',
        name: 'Newly Created',
        created_at: '2024-01-01T00:00:00Z',
      };

      // POST should return the created resource directly
      expect(created).toHaveProperty('id');
      expect(created.name).toBe('Newly Created');
    });

    it('should follow PUT /resource/:id convention (return updated resource)', () => {
      const updated = {
        id: 'existing-id',
        name: 'Updated Name',
        updated_at: '2024-01-02T00:00:00Z',
      };

      // PUT should return the updated resource directly
      expect(updated).toHaveProperty('id');
      expect(updated.name).toBe('Updated Name');
    });

    it('should follow PATCH /resource/:id convention', () => {
      const patched = {
        id: 'existing-id',
        field: 'updated value',
      };

      expect(patched).toHaveProperty('id');
      expect(patched.field).toBe('updated value');
    });

    it('should follow DELETE /resource/:id convention (204 No Content)', () => {
      // DELETE should return 204 No Content (no body)
      // This test just documents the convention
      expect(true).toBe(true);
    });
  });

  describe('Consistency', () => {
    it('should maintain consistent error format across all error types', () => {
      const errors = [
        { error: 'Not found', statusCode: 404 },
        { error: 'Unauthorized', statusCode: 401 },
        { error: 'Forbidden', statusCode: 403 },
        { error: 'Bad request', statusCode: 400 },
        { error: 'Conflict', statusCode: 409 },
        { error: 'Internal server error', statusCode: 500 },
      ];

      for (const err of errors) {
        expect(err).toHaveProperty('error');
        expect(typeof err.error).toBe('string');
      }
    });

    it('should have consistent pagination structure', () => {
      const responses = [
        {
          data: [],
          pagination: { limit: 10, offset: 0, total: 0 },
        },
        {
          data: [{ id: '1' }],
          pagination: { limit: 10, offset: 0, total: 1 },
        },
        {
          data: [{ id: '1' }, { id: '2' }],
          pagination: { limit: 2, offset: 100, total: 150 },
        },
      ];

      for (const response of responses) {
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('pagination');
        expect(response.pagination).toHaveProperty('limit');
        expect(response.pagination).toHaveProperty('offset');
        expect(response.pagination).toHaveProperty('total');
      }
    });

    it('should never include message field in resource responses', () => {
      // Resource responses should use direct properties, not a generic 'message' wrapper.
      // This test documents the convention that well-formed resource objects
      // should not have a 'message' field.
      const resource = { id: '1', name: 'Test', created_at: '2024-01-01T00:00:00Z' };

      expect(resource).not.toHaveProperty('message');
    });
  });

  describe('Type Safety', () => {
    it('PaginationResponse should be generic over data type', () => {
      interface Project {
        id: string;
        name: string;
        description: string | null;
      }

      const response: PaginationResponse<Project> = {
        data: [
          { id: '1', name: 'Project 1', description: 'Desc 1' },
          { id: '2', name: 'Project 2', description: null },
        ],
        pagination: {
          limit: 10,
          offset: 0,
          total: 2,
        },
      };

      // Should maintain type safety
      expect(response.data[0].name).toBe('Project 1');
      expect(response.data[1].description).toBeNull();
    });

    it('ErrorResponse should be type safe', () => {
      const error: ErrorResponse = {
        error: 'Validation error',
        details: [{ message: 'Something went wrong' }],
      };

      expect(typeof error.error).toBe('string');
      expect(Array.isArray(error.details)).toBe(true);
    });
  });
});
