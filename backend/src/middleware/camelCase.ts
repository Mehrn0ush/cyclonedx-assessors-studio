import { Request, Response, NextFunction } from 'express';

/**
 * Converts a snake_case string to lowerCamelCase.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Recursively transforms all keys in an object or array from snake_case to camelCase.
 */
function transformKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(transformKeys);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      result[snakeToCamel(key)] = transformKeys(obj[key]);
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

  res.json = function (body: any) {
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
function transformKeysToSnake(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(transformKeysToSnake);
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      result[camelToSnake(key)] = transformKeysToSnake(obj[key]);
    }
    return result;
  }
  return obj;
}

/**
 * Express middleware that converts incoming JSON request body keys
 * from camelCase to snake_case so route handlers can use DB column names directly.
 *
 * @deprecated Use camelCase schemas in route handlers and convert at the DB boundary
 * with toSnakeCase() instead. This avoids the mismatch between JS conventions and DB columns.
 */
export function snakeCaseRequest(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = transformKeysToSnake(req.body);
  }
  next();
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
export function toSnakeCase<T extends Record<string, any>>(obj: T): any {
  return transformKeysToSnake(obj);
}
