/**
 * API Response Helpers
 *
 * This module provides standardized response formats for REST APIs.
 * All routes should follow these patterns:
 *
 * 1. ERROR RESPONSES:
 *    - 400 Validation Error: { error: "Invalid input", details: [...] }
 *    - 401 Authentication: { error: "Authentication required" }
 *    - 403 Authorization: { error: "Forbidden" }
 *    - 404 Not Found: { error: "Resource not found" }
 *    - 409 Conflict: { error: "Conflict description" }
 *    - 500 Server Error: { error: "Internal server error" }
 *
 * 2. SUCCESS RESPONSES:
 *    - GET /resource/:id: Return single resource object
 *    - GET /resource/: Return { data: [...], pagination: { limit, offset, total } }
 *    - POST /resource: Return 201 with created resource
 *    - PUT /resource/:id: Return 200 with updated resource
 *    - DELETE /resource/:id: Return 204 No Content (or 200 with deleted resource)
 *    - PATCH /resource/:id: Return 200 with updated resource
 *
 * 3. LIST RESPONSE ENVELOPE (for GET /resource):
 *    {
 *      data: [Array<Resource>],
 *      pagination: {
 *        limit: number,
 *        offset: number,
 *        total: number
 *      }
 *    }
 *
 * RULES:
 * - All mutating endpoints (POST, PUT, PATCH, DELETE) must return the resource
 *   they modified (unless returning 204 No Content for DELETE)
 * - Avoid returning { message: "..." } for create/update/delete operations
 * - DELETE endpoints should be idempotent: return 204 whether resource exists or not
 * - Never expose stack traces in error responses (even in development)
 * - Consistent error format across all routes
 */

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface ErrorResponse {
  error: string;
  details?: Record<string, unknown>[];
}
