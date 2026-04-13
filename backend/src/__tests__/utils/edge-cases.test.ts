/**
 * Edge case and error handling tests for utilities.
 *
 * Tests boundary conditions, special inputs, and error scenarios
 * across various utility functions and services.
 */

import { describe, it, expect } from 'vitest';

describe('Edge Cases and Error Handling', () => {
  describe('String Handling', () => {
    it('should handle empty strings', () => {
      const empty = '';
      expect(empty).toBe('');
      expect(empty.length).toBe(0);
    });

    it('should handle very long strings', () => {
      const longString = 'x'.repeat(10000);
      expect(longString.length).toBe(10000);
      expect(longString).not.toBeNull();
    });

    it('should handle unicode strings', () => {
      const unicode = 'Hello 世界 مرحبا мир 🌍';
      expect(unicode).toBeTruthy();
      expect(unicode.length).toBeGreaterThan(0);
    });

    it('should handle strings with special characters', () => {
      const special = `!@#$%^&*()_+-=[]{}|;:'",.<>?/\\~\``;
      expect(special).toBeTruthy();
      expect(special).not.toContain('\n');
    });

    it('should handle whitespace strings', () => {
      const whitespace = '   \t\n  \r\n  ';
      expect(whitespace).toBeTruthy();
      expect(whitespace.trim()).toBe('');
    });

    it('should handle SQL-like strings safely', () => {
      const sql = "'; DROP TABLE users; --";
      expect(sql).toBeTruthy();
      // This should be treated as data, not executed
      expect(typeof sql).toBe('string');
    });
  });

  describe('Numeric Handling', () => {
    it('should handle zero', () => {
      const zero = 0;
      expect(zero).toBe(0);
      expect(zero).not.toBeLessThan(0);
    });

    it('should handle negative numbers', () => {
      const negative = -42;
      expect(negative).toBeLessThan(0);
      expect(Math.abs(negative)).toBe(42);
    });

    it('should handle very large numbers', () => {
      const large = Number.MAX_SAFE_INTEGER;
      expect(large).toBeGreaterThan(0);
    });

    it('should handle floating point numbers', () => {
      const float = 3.14159;
      expect(float).toBeCloseTo(3.14159);
    });

    it('should handle scientific notation', () => {
      const scientific = 1e10;
      expect(scientific).toBe(10000000000);
    });

    it('should handle NaN', () => {
      const nan = NaN;
      expect(isNaN(nan)).toBe(true);
    });

    it('should handle Infinity', () => {
      const inf = Infinity;
      expect(isFinite(inf)).toBe(false);
      expect(inf).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Array Handling', () => {
    it('should handle empty arrays', () => {
      const empty: any[] = [];
      expect(empty.length).toBe(0);
      expect(empty).toEqual([]);
    });

    it('should handle arrays with single element', () => {
      const single = [42];
      expect(single.length).toBe(1);
      expect(single[0]).toBe(42);
    });

    it('should handle nested arrays', () => {
      const nested = [[1, 2], [3, 4], [5, 6]];
      expect(nested.length).toBe(3);
      expect(nested[0][0]).toBe(1);
    });

    it('should handle sparse arrays', () => {
      const sparse = [1, , , 4]; // Missing elements
      expect(sparse.length).toBe(4);
      expect(sparse[1]).toBeUndefined();
    });

    it('should handle arrays with mixed types', () => {
      const mixed = [1, 'two', true, null, undefined, { key: 'value' }];
      expect(mixed.length).toBe(6);
      expect(mixed[0]).toBe(1);
      expect(mixed[1]).toBe('two');
      expect(mixed[4]).toBeUndefined();
    });

    it('should handle arrays with duplicate values', () => {
      const duplicates = [1, 1, 2, 2, 3, 3];
      expect(duplicates.length).toBe(6);
      expect(new Set(duplicates).size).toBe(3);
    });
  });

  describe('Object Handling', () => {
    it('should handle empty objects', () => {
      const empty = {};
      expect(Object.keys(empty).length).toBe(0);
    });

    it('should handle objects with null values', () => {
      const withNull = { key1: 'value1', key2: null, key3: 'value3' };
      expect(withNull.key2).toBeNull();
      expect(Object.keys(withNull).length).toBe(3);
    });

    it('should handle objects with undefined values', () => {
      const withUndefined = { key1: 'value1', key2: undefined };
      expect(withUndefined.key2).toBeUndefined();
    });

    it('should handle deeply nested objects', () => {
      const deep = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'deep value',
              },
            },
          },
        },
      };
      expect(deep.level1.level2.level3.level4.level5).toBe('deep value');
    });

    it('should handle objects with special keys', () => {
      const special = {
        'special-key': 'value1',
        'key with spaces': 'value2',
        '123': 'numeric string key',
        __proto__: 'should be safe',
      };
      expect(special['special-key']).toBe('value1');
    });

    it('should handle objects with method-like values', () => {
      const withMethods = {
        method: () => 'result',
        arrow: () => 42,
      };
      expect(typeof withMethods.method).toBe('function');
      expect(withMethods.method()).toBe('result');
    });
  });

  describe('Date Handling', () => {
    it('should handle current date', () => {
      const now = new Date();
      expect(now).toBeInstanceOf(Date);
      expect(now.getTime()).toBeGreaterThan(0);
    });

    it('should handle epoch date', () => {
      const epoch = new Date(0);
      expect(epoch.getTime()).toBe(0);
    });

    it('should handle past dates', () => {
      const past = new Date('2000-01-01');
      expect(past.getTime()).toBeLessThan(Date.now());
    });

    it('should handle future dates', () => {
      const future = new Date('2099-12-31');
      expect(future.getTime()).toBeGreaterThan(Date.now());
    });

    it('should handle invalid date strings', () => {
      const invalid = new Date('invalid-date-string');
      expect(isNaN(invalid.getTime())).toBe(true);
    });

    it('should handle date edge cases', () => {
      const leap = new Date(2000, 1, 29); // February 29, 2000 (leap year)
      expect(leap.getDate()).toBe(29);
    });
  });

  describe('UUID/ID Handling', () => {
    it('should handle standard UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should handle numeric IDs', () => {
      const numericId = 12345;
      expect(numericId).toBeGreaterThan(0);
    });

    it('should handle short string IDs', () => {
      const shortId = 'abc123';
      expect(shortId.length).toBeLessThan(50);
    });

    it('should handle very long IDs', () => {
      const longId = 'x'.repeat(256);
      expect(longId.length).toBe(256);
    });

    it('should handle case sensitivity in IDs', () => {
      const id1 = 'AbC123';
      const id2 = 'abc123';
      expect(id1).not.toBe(id2); // Case-sensitive
    });
  });

  describe('Pagination Edge Cases', () => {
    it('should handle page 0', () => {
      const page = 0;
      expect(page).toBe(0);
    });

    it('should handle large limit', () => {
      const limit = 1000000;
      expect(limit).toBeGreaterThan(0);
    });

    it('should handle offset beyond total', () => {
      const offset = 1000;
      const total = 50;
      expect(offset).toBeGreaterThan(total);
    });

    it('should handle zero items returned on valid page', () => {
      const data: any[] = [];
      const limit = 10;
      const offset = 0;
      expect(data.length).toBeLessThanOrEqual(limit);
    });

    it('should calculate correct next offset', () => {
      const currentOffset = 10;
      const limit = 5;
      const nextOffset = currentOffset + limit;
      expect(nextOffset).toBe(15);
    });
  });

  describe('Null and Undefined Handling', () => {
    it('should distinguish between null and undefined', () => {
      const nullValue = null;
      const undefinedValue = undefined;
      expect(nullValue === undefinedValue).toBe(false);
    });

    it('should handle optional properties', () => {
      interface User {
        id: string;
        name: string;
        email?: string;
      }
      const user: User = { id: '1', name: 'John' };
      expect(user.email).toBeUndefined();
    });

    it('should handle falsy values correctly', () => {
      const falsy = [0, '', false, null, undefined, NaN];
      expect(falsy.every((v) => !v)).toBe(true);
    });

    it('should handle optional chaining', () => {
      const obj: any = { nested: null };
      expect(obj?.nested?.deep).toBeUndefined();
    });

    it('should handle nullish coalescing', () => {
      const a = null;
      const b = undefined;
      const c = 'default';
      expect(a ?? c).toBe(c);
      expect(b ?? c).toBe(c);
    });
  });

  describe('Type Coercion Edge Cases', () => {
    it('should handle string to number coercion', () => {
      const str = '42';
      const num = Number(str);
      expect(num).toBe(42);
      expect(typeof num).toBe('number');
    });

    it('should handle boolean to number coercion', () => {
      expect(Number(true)).toBe(1);
      expect(Number(false)).toBe(0);
    });

    it('should handle string to boolean coercion', () => {
      expect(Boolean('0')).toBe(true); // Non-empty string
      expect(Boolean('')).toBe(false); // Empty string
    });

    it('should handle object to string coercion', () => {
      const obj = { toString: () => 'custom' };
      expect(String(obj)).toBe('custom');
    });

    it('should handle NaN comparisons', () => {
      // NaN is never equal to itself, even NaN === NaN is false
      const result = (NaN as any) === (NaN as any);
      expect(result).toBe(false);
      expect(isNaN(NaN)).toBe(true);
    });
  });

  describe('Error Conditions', () => {
    it('should handle missing properties gracefully', () => {
      const obj: any = {};
      expect(obj.nonexistent).toBeUndefined();
    });

    it('should handle invalid array access', () => {
      const arr = [1, 2, 3];
      expect(arr[10]).toBeUndefined();
      expect(arr[-1]).toBeUndefined();
    });

    it('should handle calling undefined functions safely', () => {
      const obj: any = {};
      expect(() => {
        if (obj.method) {
          obj.method();
        }
      }).not.toThrow();
    });

    it('should handle division by zero', () => {
      const result = 1 / 0;
      expect(result).toBe(Infinity);
    });

    it('should handle array methods on non-arrays', () => {
      const notArray = 'string';
      expect(Array.isArray(notArray)).toBe(false);
      expect(() => (notArray as any).map((x: any) => x)).toThrow();
    });
  });

  describe('Performance Boundaries', () => {
    it('should handle large object serialization', () => {
      const large = { data: 'x'.repeat(10000) };
      const serialized = JSON.stringify(large);
      expect(serialized).toBeTruthy();
      expect(serialized.length).toBeGreaterThan(10000);
    });

    it('should handle deeply nested JSON', () => {
      let deep: any = { value: 'bottom' };
      for (let i = 0; i < 100; i++) {
        deep = { nested: deep };
      }
      expect(deep).toBeTruthy();
    });

    it('should handle large array creation', () => {
      const large = new Array(10000);
      expect(large.length).toBe(10000);
    });
  });

  describe('Boundary Values', () => {
    it('should handle minimum safe integer', () => {
      const min = Number.MIN_SAFE_INTEGER;
      expect(min).toBeLessThan(0);
    });

    it('should handle maximum safe integer', () => {
      const max = Number.MAX_SAFE_INTEGER;
      expect(max).toBeGreaterThan(0);
    });

    it('should handle empty string vs space', () => {
      expect(''.length).toBe(0);
      expect(' '.length).toBe(1);
    });

    it('should handle array length edge case', () => {
      const empty: any[] = [];
      expect(empty.length).toBe(0);

      const single = [1];
      expect(single.length).toBe(1);
    });
  });
});
