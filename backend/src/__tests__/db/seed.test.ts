import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { seedDefaultRolesAndPermissions } from '../../db/seed.js';
import { setupTestDb, teardownTestDb, getTestDatabase } from '../helpers/setup.js';

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
});
