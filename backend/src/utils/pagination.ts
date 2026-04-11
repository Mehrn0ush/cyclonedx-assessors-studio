import { z } from 'zod';

/**
 * Pagination query parameters validation schema.
 * - Coerces string values to numbers
 * - Defaults limit to 20 and offset to 0
 * - Caps limit at 100
 * - Ensures both are non-negative integers
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Validates pagination parameters from query string.
 * Returns validated limit and offset with defaults applied.
 */
export function validatePagination(query: Record<string, any>): PaginationParams {
  return paginationSchema.parse(query);
}
