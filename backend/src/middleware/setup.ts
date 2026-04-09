import { Request, Response, NextFunction } from 'express';
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
 * Middleware that gates the entire API behind setup completion.
 * If no users exist, only /api/v1/setup and /api/health are accessible.
 * All other API requests get a 503 with a redirect hint.
 */
export function requireSetup(req: Request, res: Response, next: NextFunction): void {
  // Always allow health check, setup endpoint, and non-API requests
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
