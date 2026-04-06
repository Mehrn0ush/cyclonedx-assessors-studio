import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getConfig } from '../config/index.js';
import { getDatabase } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: 'admin' | 'assessor' | 'assessee' | 'standards_manager' | 'standards_approver';
    displayName: string;
    hasCompletedOnboarding?: boolean;
  };
  requestId?: string;
}

const config = getConfig();

/**
 * Hash an API key for storage or lookup using SHA-256.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Authenticate via the X-Api-Key header. Returns the user if valid,
 * or null if the header is absent / the key is invalid.
 */
async function authenticateApiKey(req: AuthRequest): Promise<AuthRequest['user'] | null> {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') return null;

  const keyHash = hashApiKey(apiKey);
  const db = getDatabase();

  const row = await db
    .selectFrom('api_key')
    .where('key_hash', '=', keyHash)
    .selectAll()
    .executeTakeFirst();

  if (!row) return null;

  // Check expiry
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  const user = await db
    .selectFrom('app_user')
    .where('id', '=', row.user_id)
    .where('is_active', '=', true)
    .selectAll()
    .executeTakeFirst();

  if (!user) return null;

  // Update last_used_at (fire and forget)
  db.updateTable('api_key')
    .set({ last_used_at: new Date() })
    .where('id', '=', row.id)
    .execute()
    .catch(() => {});

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    displayName: user.display_name,
    hasCompletedOnboarding: user.has_completed_onboarding,
  };
}

/**
 * Authenticate via the httpOnly session cookie. Returns the user if
 * valid, or null if the cookie is absent / the session is invalid.
 */
async function authenticateCookie(req: AuthRequest): Promise<AuthRequest['user'] | null> {
  const token = req.cookies?.token;
  if (!token) return null;

  let decoded: any;
  try {
    decoded = jwt.verify(token, config.JWT_SECRET);
  } catch {
    return null;
  }

  const db = getDatabase();
  const session = await db
    .selectFrom('session')
    .where('id', '=', decoded.sessionId)
    .where('expires_at', '>', new Date())
    .selectAll()
    .executeTakeFirst();

  if (!session) return null;

  const user = await db
    .selectFrom('app_user')
    .where('id', '=', session.user_id)
    .where('is_active', '=', true)
    .selectAll()
    .executeTakeFirst();

  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    displayName: user.display_name,
    hasCompletedOnboarding: user.has_completed_onboarding,
  };
}

/**
 * Attempt to authenticate the request without rejecting unauthenticated
 * callers.  Returns the user object when credentials are present and
 * valid, or null otherwise.
 */
export async function tryAuthenticate(
  req: AuthRequest
): Promise<AuthRequest['user'] | null> {
  try {
    return await authenticateApiKey(req) ?? await authenticateCookie(req);
  } catch {
    return null;
  }
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Try API key first (programmatic access), then fall back to cookie
    // (browser session).
    const user = await authenticateApiKey(req) ?? await authenticateCookie(req);

    if (!user) {
      res.status(401).json({ error: 'Authentication required. Provide a session cookie or X-Api-Key header.' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error', {
      error,
      requestId: req.requestId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.user.id,
        requiredRoles: roles,
        userRole: req.user.role,
        requestId: req.requestId,
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

