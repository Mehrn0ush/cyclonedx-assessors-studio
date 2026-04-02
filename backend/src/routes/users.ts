import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { hashPassword } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(1, 'Display name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'assessor', 'assessee']).default('assessee'),
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'assessor', 'assessee']).optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const total = await db
      .selectFrom('app_user')
      .select(db.fn.count<number>('id').as('count'))
      .executeTakeFirstOrThrow()
      .then(r => r.count);

    const users = await db
      .selectFrom('app_user')
      .select([
        'id',
        'username',
        'email',
        'display_name',
        'role',
        'is_active',
        'last_login_at',
        'created_at',
      ])
      .limit(limit)
      .offset(offset)
      .execute();

    res.json({
      data: users,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    logger.error('Get users error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Lightweight list for assignment pickers (any authenticated user)
router.get('/assignable', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const users = await db
      .selectFrom('app_user')
      .where('is_active', '=', true)
      .select(['id', 'display_name', 'username', 'role'])
      .orderBy('display_name', 'asc')
      .execute();

    res.json({ data: users });
  } catch (error) {
    logger.error('Get assignable users error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const db = getDatabase();

    const user = await db
      .selectFrom('app_user')
      .where('id', '=', req.params.id)
      .select([
        'id',
        'username',
        'email',
        'display_name',
        'role',
        'is_active',
        'last_login_at',
        'created_at',
      ])
      .executeTakeFirst();

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error('Get user error', { error, requestId: req.requestId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createUserSchema.parse(req.body);
      const db = getDatabase();

      const existingUser = await db
        .selectFrom('app_user')
        .where('username', '=', data.username)
        .selectAll()
        .executeTakeFirst();

      if (existingUser) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      const existingEmail = await db
        .selectFrom('app_user')
        .where('email', '=', data.email)
        .selectAll()
        .executeTakeFirst();

      if (existingEmail) {
        res.status(409).json({ error: 'Email already exists' });
        return;
      }

      const userId = uuidv4();
      const passwordHash = await hashPassword(data.password);

      await db
        .insertInto('app_user')
        .values({
          id: userId,
          username: data.username,
          email: data.email,
          password_hash: passwordHash,
          display_name: data.displayName,
          role: data.role,
          is_active: true,
        })
        .execute();

      logger.info('User created', {
        userId,
        username: data.username,
        role: data.role,
        requestId: req.requestId,
      });

      res.status(201).json({
        id: userId,
        username: data.username,
        email: data.email,
        displayName: data.displayName,
        role: data.role,
        isActive: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Create user error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateUserSchema.parse(req.body);
      const db = getDatabase();

      const user = await db
        .selectFrom('app_user')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (data.email && data.email !== user.email) {
        const existingEmail = await db
          .selectFrom('app_user')
          .where('email', '=', data.email)
          .selectAll()
          .executeTakeFirst();

        if (existingEmail) {
          res.status(409).json({ error: 'Email already exists' });
          return;
        }
      }

      const updateData: any = {};

      if (data.displayName !== undefined) updateData.display_name = data.displayName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable('app_user')
          .set(updateData)
          .where('id', '=', req.params.id)
          .execute();
      }

      logger.info('User updated', {
        userId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'User updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid input', details: error.errors });
        return;
      }

      logger.error('Update user error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:id/activate',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const user = await db
        .selectFrom('app_user')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      await db
        .updateTable('app_user')
        .set({ is_active: true })
        .where('id', '=', req.params.id)
        .execute();

      logger.info('User activated', {
        userId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'User activated successfully' });
    } catch (error) {
      logger.error('Activate user error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/:id/deactivate',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const db = getDatabase();

      const user = await db
        .selectFrom('app_user')
        .where('id', '=', req.params.id)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (user.id === req.user?.id) {
        res.status(400).json({ error: 'Cannot deactivate your own account' });
        return;
      }

      await db
        .updateTable('app_user')
        .set({ is_active: false })
        .where('id', '=', req.params.id)
        .execute();

      logger.info('User deactivated', {
        userId: req.params.id,
        requestId: req.requestId,
      });

      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      logger.error('Deactivate user error', { error, requestId: req.requestId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export default router;
