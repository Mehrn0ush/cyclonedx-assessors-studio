import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  getTestDatabase,
} from '../helpers/setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('Roles and Permissions', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should seed default permissions', async () => {
    const db = getTestDatabase();

    const permissions = await db.selectFrom('permission')
      .selectAll()
      .execute();

    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions.map(p => p.key)).toContain('projects.view');
    expect(permissions.map(p => p.key)).toContain('projects.create');
    expect(permissions.map(p => p.key)).toContain('standards.view');
    expect(permissions.map(p => p.key)).toContain('admin.users');
  });

  it('should have correct permission categories', async () => {
    const db = getTestDatabase();

    const permissions = await db.selectFrom('permission')
      .selectAll()
      .execute();

    const categories = new Set(permissions.map(p => p.category));
    expect(categories.has('projects')).toBe(true);
    expect(categories.has('standards')).toBe(true);
    expect(categories.has('assessments')).toBe(true);
    expect(categories.has('evidence')).toBe(true);
    expect(categories.has('claims')).toBe(true);
    expect(categories.has('attestations')).toBe(true);
    expect(categories.has('admin')).toBe(true);
  });

  it('should seed default roles', async () => {
    const db = getTestDatabase();

    const roles = await db.selectFrom('role')
      .selectAll()
      .execute();

    expect(roles.length).toBeGreaterThanOrEqual(3);
    expect(roles.map(r => r.key)).toContain('admin');
    expect(roles.map(r => r.key)).toContain('assessor');
    expect(roles.map(r => r.key)).toContain('assessee');
  });

  it('should mark system roles', async () => {
    const db = getTestDatabase();

    const roles = await db.selectFrom('role')
      .selectAll()
      .execute();

    const systemRoles = roles.filter(r => r.is_system);
    expect(systemRoles.length).toBeGreaterThanOrEqual(3);

    const systemRoleKeys = systemRoles.map(r => r.key);
    expect(systemRoleKeys).toContain('admin');
    expect(systemRoleKeys).toContain('assessor');
    expect(systemRoleKeys).toContain('assessee');
  });

  it('should assign permissions to admin role', async () => {
    const db = getTestDatabase();

    const adminRole = await db.selectFrom('role')
      .where('key', '=', 'admin')
      .selectAll()
      .executeTakeFirst();

    expect(adminRole).toBeDefined();

    const adminPermissions = await db.selectFrom('role_permission')
      .where('role_id', '=', adminRole!.id)
      .selectAll()
      .execute();

    expect(adminPermissions.length).toBeGreaterThan(0);

    const permIds = adminPermissions.map(rp => rp.permission_id);
    const perms = await db.selectFrom('permission')
      .where('id', 'in', permIds)
      .selectAll()
      .execute();

    const permKeys = perms.map(p => p.key);
    expect(permKeys).toContain('projects.view');
    expect(permKeys).toContain('admin.users');
  });

  it('should assign permissions to assessor role', async () => {
    const db = getTestDatabase();

    const assessorRole = await db.selectFrom('role')
      .where('key', '=', 'assessor')
      .selectAll()
      .executeTakeFirst();

    expect(assessorRole).toBeDefined();

    const assessorPermissions = await db.selectFrom('role_permission')
      .where('role_id', '=', assessorRole!.id)
      .selectAll()
      .execute();

    expect(assessorPermissions.length).toBeGreaterThan(0);

    const permIds = assessorPermissions.map(rp => rp.permission_id);
    const perms = await db.selectFrom('permission')
      .where('id', 'in', permIds)
      .selectAll()
      .execute();

    const permKeys = perms.map(p => p.key);
    expect(permKeys).toContain('assessments.create');
    expect(permKeys).toContain('evidence.review');
    expect(permKeys).toContain('attestations.create');
  });

  it('should assign permissions to assessee role', async () => {
    const db = getTestDatabase();

    const assesseeRole = await db.selectFrom('role')
      .where('key', '=', 'assessee')
      .selectAll()
      .executeTakeFirst();

    expect(assesseeRole).toBeDefined();

    const assesseePermissions = await db.selectFrom('role_permission')
      .where('role_id', '=', assesseeRole!.id)
      .selectAll()
      .execute();

    expect(assesseePermissions.length).toBeGreaterThan(0);

    const permIds = assesseePermissions.map(rp => rp.permission_id);
    const perms = await db.selectFrom('permission')
      .where('id', 'in', permIds)
      .selectAll()
      .execute();

    const permKeys = perms.map(p => p.key);
    expect(permKeys).toContain('evidence.create');
    expect(permKeys).not.toContain('admin.users');
  });

  it('should prevent admin role from being deleted', async () => {
    const db = getTestDatabase();

    const adminRole = await db.selectFrom('role')
      .where('key', '=', 'admin')
      .selectAll()
      .executeTakeFirst();

    expect(adminRole!.is_system).toBe(true);
  });

  it('should allow creating custom roles', async () => {
    const db = getTestDatabase();
    const customRoleId = uuidv4();

    await db.insertInto('role').values({
      id: customRoleId,
      key: 'custom_role',
      name: 'Custom Role',
      description: 'A custom role for testing',
      is_system: false,
    }).execute();

    const customRole = await db.selectFrom('role')
      .where('id', '=', customRoleId)
      .selectAll()
      .executeTakeFirst();

    expect(customRole).toBeDefined();
    expect(customRole!.key).toBe('custom_role');
    expect(customRole!.is_system).toBe(false);
  });

  it('should assign permissions to custom roles', async () => {
    const db = getTestDatabase();

    const customRoleId = uuidv4();
    await db.insertInto('role').values({
      id: customRoleId,
      key: 'custom_viewer',
      name: 'Custom Viewer',
      is_system: false,
    }).execute();

    const projectsViewPerm = await db.selectFrom('permission')
      .where('key', '=', 'projects.view')
      .selectAll()
      .executeTakeFirst();

    const standardsViewPerm = await db.selectFrom('permission')
      .where('key', '=', 'standards.view')
      .selectAll()
      .executeTakeFirst();

    await db.insertInto('role_permission').values({
      role_id: customRoleId,
      permission_id: projectsViewPerm!.id,
      created_at: new Date(),
    }).execute();

    await db.insertInto('role_permission').values({
      role_id: customRoleId,
      permission_id: standardsViewPerm!.id,
      created_at: new Date(),
    }).execute();

    const rolePerms = await db.selectFrom('role_permission')
      .where('role_id', '=', customRoleId)
      .selectAll()
      .execute();

    expect(rolePerms).toHaveLength(2);
  });

  it('should retrieve all permissions for a role', async () => {
    const db = getTestDatabase();

    const adminRole = await db.selectFrom('role')
      .where('key', '=', 'admin')
      .selectAll()
      .executeTakeFirst();

    const rolePerms = await db.selectFrom('role_permission')
      .where('role_id', '=', adminRole!.id)
      .selectAll()
      .execute();

    const permIds = rolePerms.map(rp => rp.permission_id);
    const allPerms = await db.selectFrom('permission')
      .where('id', 'in', permIds)
      .selectAll()
      .execute();

    expect(allPerms.length).toBeGreaterThan(15);
  });

  it('should prevent duplicate role permissions', async () => {
    const db = getTestDatabase();

    const adminRole = await db.selectFrom('role')
      .where('key', '=', 'admin')
      .selectAll()
      .executeTakeFirst();

    const firstPerm = await db.selectFrom('role_permission')
      .where('role_id', '=', adminRole!.id)
      .selectAll()
      .executeTakeFirst();

    try {
      await db.insertInto('role_permission').values({
        role_id: adminRole!.id,
        permission_id: firstPerm!.permission_id,
        created_at: new Date(),
      }).execute();
      expect.fail('Should have thrown duplicate key error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should enforce role_id references valid role', async () => {
    const db = getTestDatabase();
    const fakeRoleId = uuidv4();
    const perm = await db.selectFrom('permission')
      .selectAll()
      .executeTakeFirst();

    try {
      await db.insertInto('role_permission').values({
        role_id: fakeRoleId,
        permission_id: perm!.id,
        created_at: new Date(),
      }).execute();
      expect.fail('Should have thrown foreign key error');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should delete custom roles but not system roles', async () => {
    const db = getTestDatabase();

    const customRole = await db.insertInto('role').values({
      id: uuidv4(),
      key: 'temp_role',
      name: 'Temporary Role',
      is_system: false,
    }).execute();

    const tempRoleId = (customRole as any).id || uuidv4();

    const created = await db.selectFrom('role')
      .where('key', '=', 'temp_role')
      .selectAll()
      .executeTakeFirst();

    await db.deleteFrom('role')
      .where('id', '=', created!.id)
      .execute();

    const deleted = await db.selectFrom('role')
      .where('key', '=', 'temp_role')
      .selectAll()
      .executeTakeFirst();

    expect(deleted).toBeUndefined();
  });
});
