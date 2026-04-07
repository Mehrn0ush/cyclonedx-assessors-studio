import { describe, it, expect } from 'vitest';
import { toSnakeCase, camelCaseResponse } from '../../middleware/camelCase.js';
import { Request, Response, NextFunction } from 'express';

describe('CamelCase Middleware', () => {
  describe('toSnakeCase', () => {
    it('should convert simple camelCase keys to snake_case', () => {
      const obj = {
        firstName: 'John',
        lastName: 'Doe',
        emailAddress: 'john@example.com',
      };

      const result = toSnakeCase(obj);

      expect(result).toEqual({
        first_name: 'John',
        last_name: 'Doe',
        email_address: 'john@example.com',
      });
    });

    it('should handle single word keys', () => {
      const obj = {
        name: 'John',
        email: 'john@example.com',
        id: 123,
      };

      const result = toSnakeCase(obj);

      expect(result).toEqual({
        name: 'John',
        email: 'john@example.com',
        id: 123,
      });
    });

    it('should convert nested objects', () => {
      const obj = {
        firstName: 'John',
        address: {
          streetName: 'Main St',
          zipCode: '12345',
        },
      };

      const result = toSnakeCase(obj);

      expect(result).toEqual({
        first_name: 'John',
        address: {
          street_name: 'Main St',
          zip_code: '12345',
        },
      });
    });

    it('should handle arrays of objects', () => {
      const obj = {
        users: [
          { firstName: 'John', lastName: 'Doe' },
          { firstName: 'Jane', lastName: 'Smith' },
        ],
      };

      const result = toSnakeCase(obj);

      expect(result).toEqual({
        users: [
          { first_name: 'John', last_name: 'Doe' },
          { first_name: 'Jane', last_name: 'Smith' },
        ],
      });
    });

    it('should handle mixed nested structures', () => {
      const obj = {
        displayName: 'John Doe',
        account: {
          accountId: 123,
          isActive: true,
          permissions: [
            { permissionName: 'read', permissionLevel: 1 },
            { permissionName: 'write', permissionLevel: 2 },
          ],
        },
      };

      const result = toSnakeCase(obj);

      expect(result).toEqual({
        display_name: 'John Doe',
        account: {
          account_id: 123,
          is_active: true,
          permissions: [
            { permission_name: 'read', permission_level: 1 },
            { permission_name: 'write', permission_level: 2 },
          ],
        },
      });
    });

    it('should handle empty objects', () => {
      const obj = {};

      const result = toSnakeCase(obj);

      expect(result).toEqual({});
    });

    it('should handle empty arrays', () => {
      const obj = {
        items: [],
      };

      const result = toSnakeCase(obj);

      expect(result).toEqual({
        items: [],
      });
    });

    it('should preserve primitive values', () => {
      const obj = {
        stringValue: 'hello',
        numberValue: 42,
        booleanValue: true,
        nullValue: null,
      };

      const result = toSnakeCase(obj);

      expect(result).toEqual({
        string_value: 'hello',
        number_value: 42,
        boolean_value: true,
        null_value: null,
      });
    });

    it('should handle dates without converting them', () => {
      const date = new Date('2024-01-15');
      const obj = {
        createdAt: date,
      };

      const result = toSnakeCase(obj);

      expect(result.created_at).toBe(date);
    });

    it('should handle deeply nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              deepProperty: 'value',
            },
          },
        },
      };

      const result = toSnakeCase(obj);

      // camelToSnake only splits on uppercase letters; digits do not trigger a split
      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              deep_property: 'value',
            },
          },
        },
      });
    });

    it('should handle acronyms correctly', () => {
      const obj = {
        HTTPSUrl: 'https://example.com',
        XMLData: '<xml/>',
        JSONValue: '{"key": "value"}',
      };

      const result = toSnakeCase(obj);

      // Leading uppercase letters each get a preceding underscore
      expect(result).toEqual({
        _h_t_t_p_s_url: 'https://example.com',
        _x_m_l_data: '<xml/>',
        _j_s_o_n_value: '{"key": "value"}',
      });
    });

    it('should handle numbers in keys', () => {
      const obj = {
        field1Name: 'value1',
        field2Value: 'value2',
      };

      const result = toSnakeCase(obj);

      // Digits are not split by camelToSnake; only uppercase letters trigger underscore insertion
      expect(result).toEqual({
        field1_name: 'value1',
        field2_value: 'value2',
      });
    });
  });

  describe('camelCaseResponse middleware', () => {
    it('should wrap res.json to transform response', () => {
      const mockReq = {} as Request;
      const mockRes = {
        json: function (body: any) {
          return this;
        },
      } as any as Response;
      const mockNext = function () {} as NextFunction;

      const originalJson = mockRes.json;
      camelCaseResponse(mockReq, mockRes, mockNext);

      expect(mockRes.json).not.toBe(originalJson);
    });

    it('should call next function', () => {
      const mockReq = {} as Request;
      const mockRes = {
        json: function (body: any) {
          return this;
        },
      } as any as Response;
      let nextCalled = false;
      const mockNext = function () {
        nextCalled = true;
      } as NextFunction;

      camelCaseResponse(mockReq, mockRes, mockNext);

      expect(nextCalled).toBe(true);
    });

    it('should transform snake_case response to camelCase', () => {
      let capturedBody: any = null;
      const mockReq = {} as Request;
      const mockRes = {
        json: function (body: any) {
          capturedBody = body;
          return this;
        },
      } as any as Response;
      const mockNext = function () {} as NextFunction;

      camelCaseResponse(mockReq, mockRes, mockNext);

      // Call the wrapped json function
      mockRes.json({
        first_name: 'John',
        last_name: 'Doe',
        user_id: 123,
      });

      expect(capturedBody).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        userId: 123,
      });
    });

    it('should handle nested objects in response', () => {
      let capturedBody: any = null;
      const mockReq = {} as Request;
      const mockRes = {
        json: function (body: any) {
          capturedBody = body;
          return this;
        },
      } as any as Response;
      const mockNext = function () {} as NextFunction;

      camelCaseResponse(mockReq, mockRes, mockNext);

      mockRes.json({
        user_data: {
          first_name: 'John',
          user_profile: {
            created_at: '2024-01-15',
          },
        },
      });

      expect(capturedBody).toEqual({
        userData: {
          firstName: 'John',
          userProfile: {
            createdAt: '2024-01-15',
          },
        },
      });
    });

    it('should handle array of objects in response', () => {
      let capturedBody: any = null;
      const mockReq = {} as Request;
      const mockRes = {
        json: function (body: any) {
          capturedBody = body;
          return this;
        },
      } as any as Response;
      const mockNext = function () {} as NextFunction;

      camelCaseResponse(mockReq, mockRes, mockNext);

      mockRes.json({
        users: [
          { first_name: 'John', last_name: 'Doe' },
          { first_name: 'Jane', last_name: 'Smith' },
        ],
      });

      expect(capturedBody).toEqual({
        users: [
          { firstName: 'John', lastName: 'Doe' },
          { firstName: 'Jane', lastName: 'Smith' },
        ],
      });
    });

    it('should preserve primitive values in response', () => {
      let capturedBody: any = null;
      const mockReq = {} as Request;
      const mockRes = {
        json: function (body: any) {
          capturedBody = body;
          return this;
        },
      } as any as Response;
      const mockNext = function () {} as NextFunction;

      camelCaseResponse(mockReq, mockRes, mockNext);

      mockRes.json({
        string_field: 'hello',
        number_field: 42,
        boolean_field: true,
        null_field: null,
      });

      expect(capturedBody).toEqual({
        stringField: 'hello',
        numberField: 42,
        booleanField: true,
        nullField: null,
      });
    });

    it('should handle empty objects in response', () => {
      let capturedBody: any = null;
      const mockReq = {} as Request;
      const mockRes = {
        json: function (body: any) {
          capturedBody = body;
          return this;
        },
      } as any as Response;
      const mockNext = function () {} as NextFunction;

      camelCaseResponse(mockReq, mockRes, mockNext);

      mockRes.json({
        empty_object: {},
        empty_array: [],
      });

      expect(capturedBody).toEqual({
        emptyObject: {},
        emptyArray: [],
      });
    });
  });
});
