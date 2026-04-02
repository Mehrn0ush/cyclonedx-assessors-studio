import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/connection.js';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../utils/crypto.js';

const router = Router();
const config = getConfig();

const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1, 'Display name is required'),
});

router.post('/login', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = loginSchema.parse(req.body);
    const db = getDatabase();

    const user = await db
      .selectFrom('app_user')
      .where('username', '=', username)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const passwordValid = await verifyPassword(user.password_hash, password);

    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ error: 'User account is inactive' });
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
      } as any
    );

    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    logger.info('User logged in', {
      userId: user.id,
      username: user.username,
      requestId: req.requestId,
    });

    // Token is in the httpOnly cookie only. Never expose it in the response body.
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        hasCompletedOnboarding: user.has_completed_onboarding,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }

    logger.error('Login error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/register', async (req: AuthRequest, res: Response): Promise<void> => {
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
      .values({
        id: userId,
        username: data.username,
        email: data.email,
        password_hash: passwordHash,
        display_name: data.displayName,
        role: 'assessee',
        is_active: true,
      })
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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }

    logger.error('Registration error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/logout',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Extract session ID from the httpOnly cookie (same cookie used for auth).
      const cookieToken = req.cookies?.token;
      if (cookieToken) {
        try {
          const payload = jwt.verify(cookieToken, config.JWT_SECRET) as any;
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

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    res.json({
      user: req.user,
    });
  } catch (error) {
    logger.error('Get current user error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

router.put(
  '/change-password',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
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
        .set({ password_hash: newPasswordHash })
        .where('id', '=', req.user.id)
        .execute();

      logger.info('User changed password', {
        userId: req.user.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Change password error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const updateProfileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
});

router.put(
  '/profile',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
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
        .set({ display_name: data.displayName })
        .where('id', '=', req.user.id)
        .execute();

      logger.info('User profile updated', {
        userId: req.user.id,
        requestId: req.requestId,
      });

      res.json({ message: 'Profile updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Update profile error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/logout-all',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
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

      res.json({ message: 'Logged out from all sessions successfully' });
    } catch (error) {
      logger.error('Logout all sessions error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post('/complete-onboarding', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
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

    res.json({ message: 'Onboarding completed' });
  } catch (error) {
    logger.error('Complete onboarding error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
