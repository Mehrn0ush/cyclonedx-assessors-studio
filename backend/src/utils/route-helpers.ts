/**
 * Route Handler Utilities
 *
 * This module provides shared utilities to reduce duplication in route handlers:
 * - asyncHandler: Wraps async route handlers with automatic error handling
 * - handleValidationError: Checks if error is ZodError and sends formatted response
 * - validateBody: Validates request body against a Zod schema
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from './logger.js';

interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Wraps an async Express route handler with try/catch.
 * If the handler throws an unhandled error, sends 500 response.
 * For ZodErrors, the handler should call handleValidationError.
 *
 * Usage:
 *   router.post('/resource', requireAuth, asyncHandler(async (req, res) => {
 *     // handler code
 *   }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    try {
      void fn(req, res).catch((error) => {
        const requestId = (req as RequestWithId).requestId;
        logger.error('Unhandled route error', { error, requestId });
        res.status(500).json({ error: 'Internal server error' });
      });
    } catch (error) {
      const requestId = (req as RequestWithId).requestId;
      logger.error('Unhandled route error', { error, requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Checks if an error is a ZodError and sends a 400 validation error response.
 * Returns true if the error was handled, false otherwise.
 *
 * Usage:
 *   try {
 *     const data = schema.parse(req.body);
 *     // ... process data
 *   } catch (error) {
 *     if (handleValidationError(res, error)) return;
 *     // Handle other errors
 *   }
 */
export function handleValidationError(res: Response, error: unknown): boolean {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Invalid input', details: error.issues });
    return true;
  }
  return false;
}

/**
 * Validates data against a Zod schema.
 * Throws a ZodError if validation fails, which can be caught and handled
 * with handleValidationError().
 *
 * Usage:
 *   try {
 *     const data = validateBody(schema, req.body);
 *     // ... use validated data
 *   } catch (error) {
 *     if (handleValidationError(res, error)) return;
 *     // Handle other errors
 *   }
 */
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}
