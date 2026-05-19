import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection.js';
import { asyncHandler, handleValidationError } from '../utils/route-helpers.js';
import { hashPassword } from '../utils/crypto.js';
import { validatePasswordPolicy, PASSWORD_MAX_LENGTH } from '../utils/password-policy.js';
import { logger } from '../utils/logger.js';
import { type AuthRequest, requireAuth, requirePermission } from '../middleware/auth.js';
import { toSnakeCase } from '../middleware/camelCase.js';
import { fetchUserById, fetchAssignableUsers, USER_PROFILE_COLUMNS } from '../utils/user-queries.js';
import { VALID_ROLE_KEYS } from '../utils/roles.js';

const router = Router();

// Password is only screened for presence and an upper bound here. The
// full policy (min length, deny list, optional HIBP) runs through
// validatePasswordPolicy inside the handler so the error surface and
// configuration source match the self service register, setup, and
// change password paths.
const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(1, 'Display name is required'),
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
  role: z.enum(VALID_ROLE_KEYS).default('assessee'),
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(VALID_ROLE_KEYS).optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requireAuth, requirePermission('admin.users'), asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const total = await db
    .selectFrom('app_user')
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow()
    .then(r => r.count);

  // Order newest first so admins see freshly created users at the
  // top of the list. Without an explicit order, Kysely returns rows
  // in insertion order, which means new users appear after every
  // existing row and silently fall onto later pages once the table
  // grows past the limit.
  const users = await db
    .selectFrom('app_user')
    .select(USER_PROFILE_COLUMNS)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
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
}));

// Lightweight list for assignment pickers (any authenticated user)
router.get('/assignable', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const users = await fetchAssignableUsers(db);

  res.json({ data: users });
}));

router.get('/:id', requireAuth, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const db = getDatabase();

  const user = await fetchUserById(db, req.params.id as string);

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(user);
}));

router.post(
  '/',
  requireAuth,
  requirePermission('admin.users'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = createUserSchema.parse(req.body);
      const db = getDatabase();

      // Existence checks only — restrict projection to id so we never
      // load password_hash or other sensitive columns unnecessarily.
      const existingUser = await db
        .selectFrom('app_user')
        .where('username', '=', data.username)
        .select('id')
        .executeTakeFirst();

      if (existingUser) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      const existingEmail = await db
        .selectFrom('app_user')
        .where('email', '=', data.email)
        .select('id')
        .executeTakeFirst();

      if (existingEmail) {
        res.status(409).json({ error: 'Email already exists' });
        return;
      }

      // Enforce the centralized password policy. This admin
      // provisioning path is authenticated so running the HIBP check
      // here is safe. The failure message matches the other password
      // accepting endpoints.
      const policy = await validatePasswordPolicy(data.password, {
        username: data.username,
        email: data.email,
        displayName: data.displayName,
      });
      if (!policy.valid) {
        res.status(400).json({ error: policy.reason });
        return;
      }

      const userId = uuidv4();
      const passwordHash = await hashPassword(data.password);

      await db
        .insertInto('app_user')
        .values(toSnakeCase({
          id: userId,
          username: data.username,
          email: data.email,
          passwordHash: passwordHash,
          displayName: data.displayName,
          role: data.role,
          isActive: true,
        }))
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
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.put(
  '/:id',
  requireAuth,
  requirePermission('admin.users'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const data = updateUserSchema.parse(req.body);
      const db = getDatabase();

      // Only id and email are needed for the existence and email-change
      // checks below; the updated profile is re-fetched via
      // fetchUserById before the response is built, which enforces the
      // allow list in USER_PROFILE_COLUMNS.
      const user = await db
        .selectFrom('app_user')
        .where('id', '=', req.params.id)
        .select(['id', 'email'])
        .executeTakeFirst();

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      if (data.email && data.email !== user.email) {
        const existingEmail = await db
          .selectFrom('app_user')
          .where('email', '=', data.email)
          .select('id')
          .executeTakeFirst();

        if (existingEmail) {
          res.status(409).json({ error: 'Email already exists' });
          return;
        }
      }

      const updateData: Record<string, unknown> = {};

      if (data.displayName !== undefined) updateData.displayName = data.displayName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable('app_user')
          .set(toSnakeCase(updateData))
          .where('id', '=', req.params.id)
          .execute();
      }

      logger.info('User updated', {
        userId: req.params.id,
        requestId: req.requestId,
      });

      // Fetch and return the updated user
      const updatedUser = await fetchUserById(db, req.params.id as string);

      res.json(updatedUser);
    } catch (error) {
      if (handleValidationError(res, error)) return;
      throw error;
    }
  })
);

router.put(
  '/:id/activate',
  requireAuth,
  requirePermission('admin.users'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    // Existence check only — the updated profile is re-fetched via
    // fetchUserById below.
    const user = await db
      .selectFrom('app_user')
      .where('id', '=', req.params.id)
      .select('id')
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

    // Fetch and return the updated user
    const updatedUser = await fetchUserById(db, req.params.id as string);

    res.json(updatedUser);
  })
);

router.put(
  '/:id/deactivate',
  requireAuth,
  requirePermission('admin.users'),
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const db = getDatabase();

    // Only id is needed for the self-deactivation guard; the updated
    // profile is re-fetched via fetchUserById below.
    const user = await db
      .selectFrom('app_user')
      .where('id', '=', req.params.id)
      .select('id')
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

    // Fetch and return the updated user
    const updatedUser = await fetchUserById(db, req.params.id as string);

    res.json(updatedUser);
  })
);

export default router;
