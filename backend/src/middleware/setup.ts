import type { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/connection.js';
import { tryAuthenticate, getPermissionsForRole, type AuthRequest } from './auth.js';
import { logger } from '../utils/logger.js';

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
  //
  // GET /api/v1/auth/password-policy is also always allowed. It is a
  // public, read-only endpoint that returns only the bounds the UI
  // needs for placeholder copy and client-side length validation
  // (see routes/auth.ts and api/auth.ts). LoginView calls it on
  // mount, so blocking it behind the setup gate would leave the
  // login page permanently broken on a fresh install: the user
  // would see a 503 every time they visited /login, and would
  // never be able to progress to actually creating the first
  // admin. The endpoint leaks no secrets, so exposing it before
  // setup is safe.
  if (
    req.path === '/api/health' ||
    req.path.startsWith('/api/v1/setup') ||
    (req.method === 'GET' && req.path === '/api/v1/auth/password-policy')
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

/**
 * Middleware factory for routes that are part of the setup wizard but
 * that must also survive past admin creation so the wizard can finish.
 *
 * The setup wizard creates the admin in step 1 and then needs to call
 * helper endpoints (standards feed, import standard, seed demo) in
 * steps 2 through 4. Those helpers mutate the database without
 * classical auth, so they must not be reachable by an anonymous
 * caller once an admin exists. The returned middleware allows the
 * request if EITHER of the following is true:
 *
 *   - setup is still incomplete (no admin yet), OR
 *   - the caller presents a valid session or API key AND holds at
 *     least one of the supplied permissions.
 *
 * That keeps the wizard usable for the operator who just created the
 * admin (POST /api/v1/setup auto-logs them in), while locking the
 * endpoints against anonymous traffic afterwards. Callers without the
 * required permission are refused too, because these endpoints bulk
 * load data into shared tables and are only appropriate for users the
 * operator has explicitly granted those capabilities to.
 *
 * Callers pass the permission keys appropriate for the endpoint being
 * guarded (for example `standards.import` for the standards helpers
 * and `admin.settings` for seed-demo). Permission keys come from the
 * role_permission / permission tables so operators can mint custom
 * roles without changing this code path.
 */
export function requireSetupOr(
  ...requiredPermissions: string[]
): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  if (requiredPermissions.length === 0) {
    throw new Error(
      'requireSetupOr requires at least one permission key — refusing to mount an unguarded route',
    );
  }

  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const complete = await checkSetupComplete();
      if (!complete) {
        next();
        return;
      }

      const user = await tryAuthenticate(req);
      if (!user) {
        res.status(403).json({
          error: 'Setup already completed',
          message:
            'This endpoint requires an authenticated session once initial setup has finished.',
        });
        return;
      }

      const permissions = await getPermissionsForRole(user.role);
      const allowed = requiredPermissions.some((p) => permissions.includes(p));
      if (!allowed) {
        logger.warn('Setup helper access attempt without required permission', {
          userId: user.id,
          requiredPermissions,
          requestId: req.requestId,
        });
        res.status(403).json({
          error: 'Insufficient permissions',
          message:
            'This endpoint is restricted once initial setup has finished.',
        });
        return;
      }

      req.user = user;
      next();
    } catch {
      res.status(503).json({
        error: 'Unable to determine setup state',
      });
    }
  };
}
