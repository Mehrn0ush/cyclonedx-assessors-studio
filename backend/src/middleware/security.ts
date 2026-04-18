import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface SecureRequest extends Request {
  requestId?: string;
}

export function requestIdMiddleware(
  req: SecureRequest,
  res: Response,
  next: NextFunction
): void {
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId as string | string[]);
  next();
}

/**
 * Sprint 6 F12: deny intermediary and browser caching for authenticated
 * JSON.
 *
 * Every response under /api/v1 carries data that is either session
 * scoped (the dashboard, a user profile, an inbox of notifications),
 * tenant scoped, or otherwise tied to the requestor's authorization
 * context. None of it is safe for a shared cache to retain or for a
 * back button replay to expose to a different user on the same
 * device. We therefore stamp `Cache-Control: no-store` on every API
 * response by default. Pragma: no-cache is included for the small
 * population of HTTP/1.0 intermediaries still in the wild that ignore
 * Cache-Control entirely.
 *
 * Static frontend assets are served by the SPA branch in app.ts and
 * keep their long lived `public, max-age=31536000, immutable` policy.
 * The HTML shell already sets `no-store, no-cache, must-revalidate`
 * in the same place. This middleware applies only to the API surface
 * and runs before routes so any specific endpoint that needs a
 * different policy (none today) can override the header from its own
 * handler.
 */
export function noStoreCache(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}
