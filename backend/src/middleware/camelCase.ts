import type { Request, Response, NextFunction } from 'express';

/**
 * Converts a snake_case string to lowerCamelCase.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Recursively transforms all keys in an object or array from snake_case to camelCase.
 */
function transformKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(transformKeys);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date) && !Buffer.isBuffer(obj)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[snakeToCamel(key)] = transformKeys((obj as Record<string, unknown>)[key]);
    }
    return result;
  }
  return obj;
}

/**
 * Express middleware that intercepts res.json() to automatically convert
 * all response keys from snake_case to lowerCamelCase.
 *
 * Also converts incoming request body keys from camelCase to snake_case
 * so backend route handlers can continue using snake_case DB columns internally.
 */
export function camelCaseResponse(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    return originalJson(transformKeys(body));
  };

  next();
}

/**
 * Converts a camelCase string to snake_case.
 */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively transforms all keys in an object from camelCase to snake_case.
 */
function transformKeysToSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(transformKeysToSnake);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date) && !Buffer.isBuffer(obj)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[camelToSnake(key)] = transformKeysToSnake((obj as Record<string, unknown>)[key]);
    }
    return result;
  }
  return obj;
}

/**
 * Converts a plain object's keys from camelCase to snake_case.
 * Use this at the database boundary to convert validated camelCase data
 * into snake_case column names for inserts/updates.
 *
 * @example
 *   const data = schema.parse(req.body); // { displayName: "Alice", isActive: true }
 *   await db.insertInto('user').values(toSnakeCase(data)).execute();
 *   // inserts { display_name: "Alice", is_active: true }
 */
export function toSnakeCase<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return transformKeysToSnake(obj) as Record<string, unknown>;
}
