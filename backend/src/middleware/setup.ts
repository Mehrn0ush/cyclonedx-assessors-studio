import type { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/connection.js';

let setupComplete: boolean | null = null;

export async function checkSetupComplete(): Promise<boolean> {
  if (setupComplete === true) {
    return true;
  }

  try {
    const db = getDatabase();
    const user = await db
      .selectFrom('app_user')
      .selectAll()
      .executeTakeFirst();

    setupComplete = !!user;
    return setupComplete;
  } catch {
    // Table may not exist yet
    return false;
  }
}

export function markSetupComplete(): void {
  setupComplete = true;
}

/**
 * Middleware that gates the API behind setup completion.
 *
 * If no users exist, only /api/v1/setup and /api/health are accessible
 * on the API surface. All other API requests get a 503 with a redirect
 * hint. Non-API requests (the packaged SPA, static assets, favicon) are
 * always allowed through so the frontend can render the setup wizard
 * for the user.
 */
export function requireSetup(req: Request, res: Response, next: NextFunction): void {
  // Non-API requests (SPA shell, static assets) are never gated here;
  // the SPA is responsible for routing the user to /setup when needed.
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  // Always allow health check and the setup endpoint.
  if (
    req.path === '/api/health' ||
    req.path.startsWith('/api/v1/setup')
  ) {
    next();
    return;
  }

  if (setupComplete === true) {
    next();
    return;
  }

  // If setup state is unknown or incomplete, check async
  checkSetupComplete().then((complete) => {
    if (complete) {
      next();
    } else {
      res.status(503).json({
        error: 'Setup required',
        message: 'Initial setup has not been completed. Please configure the administrator account.',
        setupUrl: '/setup',
      });
    }
  }).catch(() => {
    res.status(503).json({
      error: 'Setup required',
      message: 'Initial setup has not been completed.',
      setupUrl: '/setup',
    });
  });
}

/**
 * Middleware that rejects a request once initial setup is complete.
 *
 * Used on the unauthenticated helper endpoints mounted under
 * /api/v1/setup (import-standard, seed-demo, standards-feed). Those
 * routes exist so the setup wizard can pre-populate the database
 * before the first admin has a session cookie, and must not be
 * reachable once a real user could have used them to perform
 * arbitrary operations without authentication.
 *
 * Returns 403 after setup has completed. This is intentionally
 * different from the gate in `requireSetup` (which returns 503 when
 * setup has NOT completed) so that logs and monitors can distinguish
 * "too early" from "too late" access attempts.
 */
export function requireSetupIncomplete(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  checkSetupComplete()
    .then((complete) => {
      if (complete) {
        res.status(403).json({
          error: 'Setup already completed',
          message:
            'This endpoint is only available before the initial administrator account is created.',
        });
        return;
      }
      next();
    })
    .catch(() => {
      // If we cannot determine setup status, fail closed.
      res.status(503).json({
        error: 'Unable to determine setup state',
      });
    });
}
