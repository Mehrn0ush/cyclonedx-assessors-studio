import { describe, it, expect } from 'vitest';
import { validatePagination, paginationSchema } from '../../utils/pagination.js';
import { z } from 'zod';

describe('Pagination Utils', () => {
  describe('paginationSchema', () => {
    it('should have default limit of 20', () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(20);
    });

    it('should have default offset of 0', () => {
      const result = paginationSchema.parse({});
      expect(result.offset).toBe(0);
    });

    it('should accept numeric limit', () => {
      const result = paginationSchema.parse({ limit: 50 });
      expect(result.limit).toBe(50);
    });

    it('should coerce string limit to number', () => {
      const result = paginationSchema.parse({ limit: '30' });
      expect(result.limit).toBe(30);
      expect(typeof result.limit).toBe('number');
    });

    it('should accept numeric offset', () => {
      const result = paginationSchema.parse({ offset: 10 });
      expect(result.offset).toBe(10);
    });

    it('should coerce string offset to number', () => {
      const result = paginationSchema.parse({ offset: '5' });
      expect(result.offset).toBe(5);
      expect(typeof result.offset).toBe('number');
    });

    it('should cap limit at 100', () => {
      expect(() => {
        paginationSchema.parse({ limit: 101 });
      }).toThrow();
    });

    it('should allow limit of exactly 100', () => {
      const result = paginationSchema.parse({ limit: 100 });
      expect(result.limit).toBe(100);
    });

    it('should reject limit less than 1', () => {
      expect(() => {
        paginationSchema.parse({ limit: 0 });
      }).toThrow();
    });

    it('should reject negative limit', () => {
      expect(() => {
        paginationSchema.parse({ limit: -10 });
      }).toThrow();
    });

    it('should reject negative offset', () => {
      expect(() => {
        paginationSchema.parse({ offset: -1 });
      }).toThrow();
    });

    it('should allow offset of 0', () => {
      const result = paginationSchema.parse({ offset: 0 });
      expect(result.offset).toBe(0);
    });

    it('should allow large positive offset', () => {
      const result = paginationSchema.parse({ offset: 10000 });
      expect(result.offset).toBe(10000);
    });

    it('should reject non-numeric limit string', () => {
      expect(() => {
        paginationSchema.parse({ limit: 'abc' });
      }).toThrow();
    });

    it('should reject non-numeric offset string', () => {
      expect(() => {
        paginationSchema.parse({ offset: 'xyz' });
      }).toThrow();
    });

    it('should handle mixed types', () => {
      const result = paginationSchema.parse({
        limit: '25',
        offset: 10,
      });
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(10);
    });
  });

  describe('validatePagination', () => {
    it('should validate pagination parameters', () => {
      const result = validatePagination({ limit: 50, offset: 10 });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });

    it('should apply defaults when not provided', () => {
      const result = validatePagination({});
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should coerce string values to numbers', () => {
      const result = validatePagination({ limit: '40', offset: '5' });
      expect(result.limit).toBe(40);
      expect(result.offset).toBe(5);
      expect(typeof result.limit).toBe('number');
      expect(typeof result.offset).toBe('number');
    });

    it('should enforce max limit with query string', () => {
      expect(() => {
        validatePagination({ limit: '150' });
      }).toThrow();
    });

    it('should return correct type from validation', () => {
      const result = validatePagination({ limit: 20, offset: 0 });
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('offset');
    });

    it('should handle extra properties gracefully', () => {
      const result = validatePagination({
        limit: 20,
        offset: 0,
        extraProp: 'ignored',
      });
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect((result as any).extraProp).toBeUndefined();
    });
  });

  describe('Edge cases', () => {
    it('should reject float limit (int validation)', () => {
      expect(() => {
        paginationSchema.parse({ limit: 25.7 });
      }).toThrow();
    });

    it('should reject float offset (int validation)', () => {
      expect(() => {
        paginationSchema.parse({ offset: 5.9 });
      }).toThrow();
    });

    it('should reject null values (not treated as missing)', () => {
      expect(() => {
        paginationSchema.parse({ limit: null, offset: null });
      }).toThrow();
    });

    it('should handle whitespace in string numbers', () => {
      const result = paginationSchema.parse({ limit: '  25  ', offset: '  10  ' });
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(10);
    });
  });
});
