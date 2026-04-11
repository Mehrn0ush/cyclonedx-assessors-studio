import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { seedDefaultAdmin, seedDefaultRolesAndPermissions } from '../../db/seed.js';
import { setupTestDb, teardownTestDb, getTestDatabase, createTestUser } from '../helpers/setup.js';

vi.mock('../../db/connection.js', () => ({
  getDatabase: () => getTestDatabase(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    hashPassword: vi.fn(async (password: string) => `hashed_${password}_${Date.now()}`),
    verifyPassword: actual.verifyPassword,
    generateToken: actual.generateToken,
    hashToken: actual.hashToken,
  };
});

describe('Seed Module', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('seedDefaultRolesAndPermissions', () => {
    it('should skip seeding if permissions already exist', async () => {
      const db = getTestDatabase();

      const permissionsBefore = await db
        .selectFrom('permission')
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow();

      await seedDefaultRolesAndPermissions();

      const permissionsAfter = await db
        .selectFrom('permission')
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow();

      expect(Number(permissionsAfter.count)).toBe(Number(permissionsBefore.count));
    });

    it('should have permissions for all expected categories', async () => {
      const db = getTestDatabase();

      const permissions = await db
        .selectFrom('permission')
        .select('category')
        .distinct()
        .execute();

      const categories = permissions.map((p: any) => p.category).sort();
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('projects');
      expect(categories).toContain('standards');
      expect(categories).toContain('assessments');
    });

    it('should have roles with correct keys', async () => {
      const db = getTestDatabase();

      const roles = await db
        .selectFrom('role')
        .select(['key', 'name'])
        .execute();

      const roleKeys = roles.map((r: any) => r.key).sort();
      expect(roleKeys).toContain('admin');
      expect(roleKeys).toContain('assessor');
      expect(roleKeys).toContain('assessee');
    });

    it('should have system roles marked correctly', async () => {
      const db = getTestDatabase();

      const systemRoles = await db
        .selectFrom('role')
        .where('is_system', '=', true)
        .select('key')
        .execute();

      expect(systemRoles.length).toBeGreaterThan(0);
      expect(systemRoles.map((r: any) => r.key)).toContain('admin');
    });

    it('should have admin role with permissions assigned', async () => {
      const db = getTestDatabase();

      const adminRole = await db
        .selectFrom('role')
        .where('key', '=', 'admin')
        .selectAll()
        .executeTakeFirst();

      expect(adminRole).toBeDefined();

      const adminPermissions = await db
        .selectFrom('role_permission')
        .where('role_id', '=', (adminRole as any).id)
        .select('role_id')
        .execute();

      expect(adminPermissions.length).toBeGreaterThan(0);
    });

    it('should have assessor role with permissions', async () => {
      const db = getTestDatabase();

      const assessorRole = await db
        .selectFrom('role')
        .where('key', '=', 'assessor')
        .selectAll()
        .executeTakeFirst();

      expect(assessorRole).toBeDefined();

      const assessorPermissions = await db
        .selectFrom('role_permission')
        .where('role_id', '=', (assessorRole as any).id)
        .select('role_id')
        .execute();

      expect(assessorPermissions.length).toBeGreaterThan(0);
    });

    it('should have assessee role with permissions', async () => {
      const db = getTestDatabase();

      const assesseeRole = await db
        .selectFrom('role')
        .where('key', '=', 'assessee')
        .selectAll()
        .executeTakeFirst();

      expect(assesseeRole).toBeDefined();

      const assesseePermissions = await db
        .selectFrom('role_permission')
        .where('role_id', '=', (assesseeRole as any).id)
        .select('role_id')
        .execute();

      expect(assesseePermissions.length).toBeGreaterThan(0);
    });


    it('should create role_permission associations with created_at timestamps', async () => {
      const db = getTestDatabase();

      await seedDefaultRolesAndPermissions();

      const associations = await db
        .selectFrom('role_permission')
        .selectAll()
        .limit(5)
        .execute();

      for (const assoc of associations) {
        expect((assoc as any).created_at).toBeDefined();
        expect((assoc as any).created_at).toBeInstanceOf(Date);
      }
    });

    it('should create permissions with required fields', async () => {
      const db = getTestDatabase();

      await seedDefaultRolesAndPermissions();

      const permissions = await db
        .selectFrom('permission')
        .selectAll()
        .limit(5)
        .execute();

      for (const perm of permissions) {
        expect((perm as any).id).toBeDefined();
        expect((perm as any).key).toBeDefined();
        expect((perm as any).name).toBeDefined();
        expect((perm as any).description).toBeDefined();
        expect((perm as any).category).toBeDefined();
      }
    });

    it('should have roles with descriptions', async () => {
      const db = getTestDatabase();

      const roles = await db
        .selectFrom('role')
        .selectAll()
        .execute();

      for (const role of roles) {
        expect((role as any).description).toBeDefined();
        expect((role as any).description).not.toBe('');
      }
    });
  });

  describe('seedDefaultAdmin', () => {
    beforeEach(async () => {
      // Clear app_user table before each test
      const db = getTestDatabase();
      await db.deleteFrom('app_user').execute();
    });

    it('should skip if user already exists', async () => {
      const db = getTestDatabase();

      await createTestUser({
        username: 'existing_user',
        email: 'existing@example.com',
      });

      // Should not throw and should return early
      await seedDefaultAdmin();

      const users = await db.selectFrom('app_user').selectAll().execute();
      expect(users.length).toBe(1);
    });

    it('should create admin user from environment variables in non-interactive mode', async () => {
      const db = getTestDatabase();

      process.env.ADMIN_USERNAME = 'test_admin';
      process.env.ADMIN_EMAIL = 'test_admin@example.com';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      process.env.ADMIN_DISPLAY_NAME = 'Test Admin User';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await seedDefaultAdmin();

      const users = await db
        .selectFrom('app_user')
        .where('username', '=', 'test_admin')
        .selectAll()
        .execute();

      expect(users.length).toBe(1);
      expect((users[0] as any).email).toBe('test_admin@example.com');
      expect((users[0] as any).role).toBe('admin');
      expect((users[0] as any).is_active).toBe(true);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should use ADMIN_DISPLAY_NAME or fallback to username', async () => {
      const db = getTestDatabase();

      process.env.ADMIN_USERNAME = 'admin_no_display_name';
      process.env.ADMIN_EMAIL = 'admin_no_display@example.com';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';
      delete process.env.ADMIN_DISPLAY_NAME;

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await seedDefaultAdmin();

      const users = await db
        .selectFrom('app_user')
        .where('username', '=', 'admin_no_display_name')
        .selectAll()
        .execute();

      expect(users.length).toBe(1);
      expect((users[0] as any).display_name).toBe('admin_no_display_name');

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should exit if ADMIN_USERNAME is missing in non-interactive mode', async () => {
      const db = getTestDatabase();
      const originalUsers = await db.selectFrom('app_user').selectAll().execute();

      delete process.env.ADMIN_USERNAME;
      process.env.ADMIN_EMAIL = 'test@example.com';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit(1) called');
      });

      try {
        await seedDefaultAdmin();
      } catch (error: any) {
        expect(error.message).toContain('process.exit');
      }

      expect(exitSpy).toHaveBeenCalledWith(1);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should exit if ADMIN_EMAIL is missing in non-interactive mode', async () => {
      delete process.env.ADMIN_EMAIL;
      process.env.ADMIN_USERNAME = 'test_admin';
      process.env.ADMIN_PASSWORD = 'TestPassword123!';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit(1) called');
      });

      try {
        await seedDefaultAdmin();
      } catch (error: any) {
        expect(error.message).toContain('process.exit');
      }

      expect(exitSpy).toHaveBeenCalledWith(1);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should exit if ADMIN_PASSWORD is missing in non-interactive mode', async () => {
      delete process.env.ADMIN_PASSWORD;
      process.env.ADMIN_USERNAME = 'test_admin';
      process.env.ADMIN_EMAIL = 'test@example.com';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit(1) called');
      });

      try {
        await seedDefaultAdmin();
      } catch (error: any) {
        expect(error.message).toContain('process.exit');
      }

      expect(exitSpy).toHaveBeenCalledWith(1);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should exit if ADMIN_PASSWORD is less than 8 characters', async () => {
      process.env.ADMIN_USERNAME = 'test_admin';
      process.env.ADMIN_EMAIL = 'test@example.com';
      process.env.ADMIN_PASSWORD = 'short';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit(1) called');
      });

      try {
        await seedDefaultAdmin();
      } catch (error: any) {
        expect(error.message).toContain('process.exit');
      }

      expect(exitSpy).toHaveBeenCalledWith(1);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should create admin user with hashed password', async () => {
      const db = getTestDatabase();

      process.env.ADMIN_USERNAME = 'hashed_admin';
      process.env.ADMIN_EMAIL = 'hashed@example.com';
      process.env.ADMIN_PASSWORD = 'ValidPassword123!';
      process.env.ADMIN_DISPLAY_NAME = 'Hashed Admin';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await seedDefaultAdmin();

      const user = await db
        .selectFrom('app_user')
        .where('username', '=', 'hashed_admin')
        .selectAll()
        .executeTakeFirst();

      expect(user).toBeDefined();
      expect((user as any).password_hash).toBeDefined();
      expect(typeof (user as any).password_hash).toBe('string');
      expect((user as any).password_hash.length).toBeGreaterThan(0);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should set admin user as active', async () => {
      const db = getTestDatabase();

      process.env.ADMIN_USERNAME = 'active_admin';
      process.env.ADMIN_EMAIL = 'active@example.com';
      process.env.ADMIN_PASSWORD = 'ValidPassword123!';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await seedDefaultAdmin();

      const user = await db
        .selectFrom('app_user')
        .where('username', '=', 'active_admin')
        .selectAll()
        .executeTakeFirst();

      expect((user as any).is_active).toBe(true);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should set admin user role correctly', async () => {
      const db = getTestDatabase();

      process.env.ADMIN_USERNAME = 'role_admin';
      process.env.ADMIN_EMAIL = 'role@example.com';
      process.env.ADMIN_PASSWORD = 'ValidPassword123!';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await seedDefaultAdmin();

      const user = await db
        .selectFrom('app_user')
        .where('username', '=', 'role_admin')
        .selectAll()
        .executeTakeFirst();

      expect((user as any).role).toBe('admin');

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should generate unique user ID with UUID', async () => {
      const db = getTestDatabase();

      process.env.ADMIN_USERNAME = `uuid_admin_${Date.now()}`;
      process.env.ADMIN_EMAIL = `uuid_${Date.now()}@example.com`;
      process.env.ADMIN_PASSWORD = 'ValidPassword123!';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await seedDefaultAdmin();

      const user = await db
        .selectFrom('app_user')
        .where('username', '=', process.env.ADMIN_USERNAME)
        .selectAll()
        .executeTakeFirst();

      expect((user as any).id).toBeDefined();
      expect((user as any).id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });

    it('should not create user if it already exists', async () => {
      const db = getTestDatabase();

      await createTestUser({
        username: 'already_exists',
        email: 'already@example.com',
      });

      const usersBefore = await db.selectFrom('app_user').selectAll().execute();

      process.env.ADMIN_USERNAME = 'new_admin';
      process.env.ADMIN_EMAIL = 'new@example.com';
      process.env.ADMIN_PASSWORD = 'ValidPassword123!';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await seedDefaultAdmin();

      const usersAfter = await db.selectFrom('app_user').selectAll().execute();

      expect(usersAfter.length).toBe(usersBefore.length);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });
  });

  describe('seedDefaultAdmin and seedDefaultRolesAndPermissions integration', () => {
    beforeEach(async () => {
      const db = getTestDatabase();
      await db.deleteFrom('app_user').execute();
    });

    it('should work together to set up initial system state', async () => {
      const db = getTestDatabase();

      process.env.ADMIN_USERNAME = 'integration_admin';
      process.env.ADMIN_EMAIL = 'integration@example.com';
      process.env.ADMIN_PASSWORD = 'IntegrationPassword123!';

      const stdinBackup = process.stdin;
      const mockStdin = {
        isTTY: false,
      } as any;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await seedDefaultRolesAndPermissions();
      await seedDefaultAdmin();

      const user = await db
        .selectFrom('app_user')
        .where('username', '=', 'integration_admin')
        .selectAll()
        .executeTakeFirst();

      expect(user).toBeDefined();
      expect((user as any).role).toBe('admin');
      expect((user as any).is_active).toBe(true);

      const permissions = await db
        .selectFrom('permission')
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow();

      expect(Number(permissions.count)).toBeGreaterThan(0);

      const roles = await db
        .selectFrom('role')
        .select(db.fn.count<number>('id').as('count'))
        .executeTakeFirstOrThrow();

      expect(Number(roles.count)).toBeGreaterThan(0);

      Object.defineProperty(process, 'stdin', {
        value: stdinBackup,
        writable: true,
      });
      exitSpy.mockRestore();
    });
  });
});
