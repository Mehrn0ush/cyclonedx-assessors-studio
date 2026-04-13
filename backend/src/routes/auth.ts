import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/connection.js';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { AuthRequest, requireAuth, getPermissionsForRole } from '../middleware/auth.js';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../utils/crypto.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { authLoginTotal } from '../metrics/index.js';

const router = Router();
const config = getConfig();

const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1, 'Display name is required'),
});

router.post('/login', asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const db = getDatabase();

    const user = await db
      .selectFrom('app_user')
      .where('username', '=', username)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      authLoginTotal.inc({ method: 'local', result: 'failure' });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const passwordValid = await verifyPassword(user.password_hash, password);

    if (!passwordValid) {
      authLoginTotal.inc({ method: 'local', result: 'failure' });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.is_active) {
      authLoginTotal.inc({ method: 'local', result: 'failure' });
      logger.warn('Login attempt for inactive user', {
        userId: user.id,
        requestId: req.requestId,
      });
      // Use generic message to avoid revealing that the account exists
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken();
    const sessionId = uuidv4();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db
      .insertInto('session')
      .values({
        id: sessionId,
        user_id: user.id,
        token_hash: tokenHash,
        ip_address: req.ip || undefined,
        user_agent: req.headers['user-agent'] || undefined,
        expires_at: expiresAt,
      })
      .execute();

    await db
      .updateTable('app_user')
      .set({ last_login_at: new Date() })
      .where('id', '=', user.id)
      .execute();

    const jwtToken = jwt.sign(
      { sessionId },
      config.JWT_SECRET,
      {
        expiresIn: config.JWT_EXPIRY,
      } as jwt.SignOptions
    );

    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    authLoginTotal.inc({ method: 'local', result: 'success' });

    logger.info('User logged in', {
      userId: user.id,
      username: user.username,
      requestId: req.requestId,
    });

    // Fetch permissions for the user's role
    const permissions = await getPermissionsForRole(user.role);

    // Token is in the httpOnly cookie only. Never expose it in the response body.
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        hasCompletedOnboarding: user.has_completed_onboarding || false,
      },
      permissions,
    });
  } catch (error) {
    if (handleValidationError(res, error)) return;
    throw error;
  }
}));

router.post('/register', asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);
    const db = getDatabase();

    const existingUser = await db
      .selectFrom('app_user')
      .where((eb) =>
        eb.or([
          eb('username', '=', data.username),
          eb('email', '=', data.email),
        ])
      )
      .selectAll()
      .executeTakeFirst();

    if (existingUser) {
      res.status(409).json({
        error: 'Username or email already exists',
      });
      return;
    }

    const passwordHash = await hashPassword(data.password);
    const userId = uuidv4();

    await db
      .insertInto('app_user')
      .values(toSnakeCase({
        id: userId,
        username: data.username,
        email: data.email,
        passwordHash: passwordHash,
        displayName: data.displayName,
        role: 'assessee',
        isActive: true,
      }))
      .execute();

    logger.info('User registered', {
      userId,
      username: data.username,
      email: data.email,
      requestId: req.requestId,
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: userId,
        username: data.username,
        email: data.email,
        displayName: data.displayName,
        role: 'assessee',
      },
    });
  } catch (error) {
    if (handleValidationError(res, error)) return;
    throw error;
  }
}));

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Extract session ID from the httpOnly cookie (same cookie used for auth).
    const cookieToken = req.cookies?.token;
    if (cookieToken) {
      try {
        const payload = jwt.verify(cookieToken, config.JWT_SECRET) as { sessionId: string };
        await getDatabase()
          .deleteFrom('session')
          .where('id', '=', payload.sessionId)
          .execute();
      } catch {
        // Token already expired or invalid; clear the cookie anyway.
      }
    }

    res.clearCookie('token');

    logger.info('User logged out', {
      userId: req.user.id,
      requestId: req.requestId,
    });

    res.status(204).send();
  })
);

router.get('/me', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Fetch permissions for the user's role
    const permissions = await getPermissionsForRole(req.user.role);

    res.json({
      user: req.user,
      permissions,
    });
  } catch (error) {
    logger.error('Get current user error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
}));

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

router.put(
  '/change-password',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const data = changePasswordSchema.parse(req.body);
      const db = getDatabase();

      const user = await db
        .selectFrom('app_user')
        .where('id', '=', req.user.id)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const passwordValid = await verifyPassword(user.password_hash, data.currentPassword);

      if (!passwordValid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      const newPasswordHash = await hashPassword(data.newPassword);

      await db
        .updateTable('app_user')
        .set(toSnakeCase({ passwordHash: newPasswordHash }))
        .where('id', '=', req.user.id)
        .execute();

      // Invalidate all existing sessions to prevent stolen session reuse.
      // This is a security requirement per OWASP ASVS 2.3.1.
      await db
        .deleteFrom('session')
        .where('user_id', '=', req.user.id)
        .execute();

      // Clear the current session cookie so the user must re-authenticate
      res.clearCookie('token');

      logger.info('User changed password and all sessions invalidated', {
        userId: req.user.id,
        requestId: req.requestId,
      });

      // Fetch and return the updated user (without password hash)
      const updatedUser = await db
        .selectFrom('app_user')
        .where('id', '=', req.user.id)
        .selectAll()
        .executeTakeFirst();

      res.json({
        message: 'Password changed successfully. Please log in again.',
        user: {
          id: updatedUser?.id,
          username: updatedUser?.username,
          email: updatedUser?.email,
          displayName: updatedUser?.display_name,
          role: updatedUser?.role,
          hasCompletedOnboarding: updatedUser?.has_completed_onboarding || false,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.issues });
        return;
      }

      logger.error('Change password error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  })
);

const updateProfileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
});

router.put(
  '/profile',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const data = updateProfileSchema.parse(req.body);
      const db = getDatabase();

      const user = await db
        .selectFrom('app_user')
        .where('id', '=', req.user.id)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      await db
        .updateTable('app_user')
        .set(toSnakeCase({ displayName: data.displayName }))
        .where('id', '=', req.user.id)
        .execute();

      logger.info('User profile updated', {
        userId: req.user.id,
        requestId: req.requestId,
      });

      // Fetch and return the updated user
      const updatedUser = await db
        .selectFrom('app_user')
        .where('id', '=', req.user.id)
        .selectAll()
        .executeTakeFirst();

      res.json({
        user: {
          id: updatedUser?.id,
          username: updatedUser?.username,
          email: updatedUser?.email,
          displayName: updatedUser?.display_name,
          role: updatedUser?.role,
          hasCompletedOnboarding: updatedUser?.has_completed_onboarding || false,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.issues });
        return;
      }

      logger.error('Update profile error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  })
);

router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const db = getDatabase();

      // Delete all sessions for the user
      await db
        .deleteFrom('session')
        .where('user_id', '=', req.user.id)
        .execute();

      // Clear the current session cookie
      res.clearCookie('token');

      logger.info('User logged out from all sessions', {
        userId: req.user.id,
        requestId: req.requestId,
      });

      res.status(204).send();
    } catch (error) {
      logger.error('Logout all sessions error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  })
);

router.post('/complete-onboarding', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const db = getDatabase();
    await db
      .updateTable('app_user')
      .set({ has_completed_onboarding: true })
      .where('id', '=', req.user.id)
      .execute();

    logger.info('User completed onboarding', {
      userId: req.user.id,
      requestId: req.requestId,
    });

    // Fetch and return the updated user
    const updatedUser = await db
      .selectFrom('app_user')
      .where('id', '=', req.user.id)
      .selectAll()
      .executeTakeFirst();

    res.json({
      user: {
        id: updatedUser?.id,
        username: updatedUser?.username,
        email: updatedUser?.email,
        displayName: updatedUser?.display_name,
        role: updatedUser?.role,
        hasCompletedOnboarding: updatedUser?.has_completed_onboarding || false,
      },
    });
  } catch (error) {
    logger.error('Complete onboarding error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
}));

/**
 * PATCH /me
 * Update current user's profile fields (chat identities, notification prefs)
 */
const updateUserProfileSchema = z.object({
  slackUserId: z.string().optional().nullable(),
  teamsUserId: z.string().optional().nullable(),
  mattermostUsername: z.string().optional().nullable(),
  emailNotifications: z.boolean().optional(),
});

router.patch('/me', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const data = updateUserProfileSchema.parse(req.body);
    const db = getDatabase();

    const updates: Record<string, any> = {};
    if (data.slackUserId !== undefined) {
      updates.slack_user_id = data.slackUserId;
    }
    if (data.teamsUserId !== undefined) {
      updates.teams_user_id = data.teamsUserId;
    }
    if (data.mattermostUsername !== undefined) {
      updates.mattermost_username = data.mattermostUsername;
    }
    if (data.emailNotifications !== undefined) {
      updates.email_notifications = data.emailNotifications;
    }

    if (Object.keys(updates).length === 0) {
      // No updates requested
      const user = await db
        .selectFrom('app_user')
        .where('id', '=', req.user.id)
        .selectAll()
        .executeTakeFirst();

      res.json({ user });
      return;
    }

    updates.updated_at = new Date();

    await db
      .updateTable('app_user')
      .set(updates)
      .where('id', '=', req.user.id)
      .execute();

    const updatedUser = await db
      .selectFrom('app_user')
      .where('id', '=', req.user.id)
      .selectAll()
      .executeTakeFirst();

    logger.info('Updated user profile', {
      userId: req.user.id,
    });

    res.json({ user: updatedUser });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    logger.error('Update profile error', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
      requestId: req.requestId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
}));

export default router;
