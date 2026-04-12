/**
 * Converts a snake_case string to camelCase.
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Recursively transforms all keys in an object (or array of objects)
 * from snake_case to camelCase.
 */
export function keysToCamel<T = unknown>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map(item => keysToCamel(item)) as T
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      result[snakeToCamel(key)] = keysToCamel((obj as Record<string, unknown>)[key])
    }
    return result as T
  }
  return obj as T
}
