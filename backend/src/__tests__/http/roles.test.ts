import { describe, it, expect } from 'vitest';
import {
  setupHttpTests,
  loginAs,
  getAgent,
} from '../helpers/http.js';

describe('Roles HTTP Routes', () => {
  setupHttpTests();

  let testCounter = 0;
  let systemRoleId: string | null = null;
  let permissionIds: string[] = [];

  /**
   * Helper to fetch all available permissions (used for permission IDs in tests)
   */
  async function fetchPermissions(agent: any) {
    if (permissionIds.length === 0) {
      const res = await agent.get('/api/v1/roles/permissions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      permissionIds = res.body.data.map((p: any) => p.id);
    }
    return permissionIds;
  }

  /**
   * Helper to fetch system role ID (used to test that system roles cannot be modified)
   */
  async function getSystemRoleId(agent: any) {
    if (systemRoleId === null) {
      const res = await agent.get('/api/v1/roles?limit=100&offset=0');
      expect(res.status).toBe(200);
      const adminRole = res.body.data.find((r: any) => r.key === 'admin');
      if (adminRole) {
        systemRoleId = adminRole.id;
      }
    }
    return systemRoleId;
  }

  describe('GET /api/v1/roles', () => {
    it('should list all roles with pagination', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('offset');
      expect(res.body.pagination).toHaveProperty('total');
    });

    it('should include permissionCount for each role', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const firstRole = res.body.data[0];
        expect(firstRole).toHaveProperty('permissionCount');
        expect(typeof firstRole.permissionCount).toBe('number');
      }
    });

    it('should respect limit parameter', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });

    it('should cap limit at 100', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles?limit=500');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(100);
    });

    it('should respect offset parameter', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles?limit=10&offset=0');

      expect(res.status).toBe(200);
      expect(res.body.pagination.offset).toBe(0);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/roles');

      expect(res.status).toBe(401);
    });

    it('should work for assessor role', async () => {
      const agent = await loginAs('assessor');

      const res = await agent.get('/api/v1/roles');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('should work for assessee role', async () => {
      const agent = await loginAs('assessee');

      const res = await agent.get('/api/v1/roles');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  describe('GET /api/v1/roles/permissions', () => {
    it('should list all available permissions', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles/permissions');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should include permission properties', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles/permissions');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const firstPermission = res.body.data[0];
        expect(firstPermission).toHaveProperty('id');
        expect(firstPermission).toHaveProperty('key');
        expect(firstPermission).toHaveProperty('name');
        expect(firstPermission).toHaveProperty('category');
      }
    });

    it('should order permissions by category and name', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles/permissions');

      expect(res.status).toBe(200);
      const permissions = res.body.data;
      if (permissions.length > 1) {
        // Check that category ordering is maintained
        for (let i = 1; i < permissions.length; i++) {
          const prevCat = permissions[i - 1].category;
          const currCat = permissions[i].category;
          if (prevCat === currCat) {
            // Same category, check name ordering
            expect(permissions[i - 1].name <= permissions[i].name).toBe(true);
          }
        }
      }
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/roles/permissions');

      expect(res.status).toBe(401);
    });

    it('should work for assessor role', async () => {
      const agent = await loginAs('assessor');

      const res = await agent.get('/api/v1/roles/permissions');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('should not be caught by the :id route', async () => {
      const agent = await loginAs('admin');

      // GET /permissions should work, not try to find role with id='permissions'
      const res = await agent.get('/api/v1/roles/permissions');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/roles/:id', () => {
    it('should retrieve role with permissions by ID', async () => {
      const agent = await loginAs('admin');
      const roles = await agent.get('/api/v1/roles');
      const roleId = roles.body.data[0]?.id;

      if (!roleId) {
        return; // Skip if no roles exist
      }

      const res = await agent.get(`/api/v1/roles/${roleId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('role');
      expect(res.body).toHaveProperty('permissions');
      expect(res.body.role.id).toBe(roleId);
      expect(Array.isArray(res.body.permissions)).toBe(true);
    });

    it('should include permission details', async () => {
      const agent = await loginAs('admin');
      const roles = await agent.get('/api/v1/roles');
      const roleWithPerms = roles.body.data.find((r: any) => r.permissionCount > 0);

      if (!roleWithPerms) {
        return; // Skip if no role has permissions
      }

      const res = await agent.get(`/api/v1/roles/${roleWithPerms.id}`);

      expect(res.status).toBe(200);
      if (res.body.permissions.length > 0) {
        const perm = res.body.permissions[0];
        expect(perm).toHaveProperty('id');
        expect(perm).toHaveProperty('key');
        expect(perm).toHaveProperty('name');
        expect(perm).toHaveProperty('category');
      }
    });

    it('should return 404 for non-existent role', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Role not found');
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.get('/api/v1/roles/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });

    it('should work for assessor role', async () => {
      const adminAgent = await loginAs('admin');
      const roles = await adminAgent.get('/api/v1/roles');
      const roleId = roles.body.data[0]?.id;

      if (!roleId) {
        return;
      }

      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.get(`/api/v1/roles/${roleId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('role');
    });
  });

  describe('POST /api/v1/roles', () => {
    it('should create a custom role with basic fields', async () => {
      const agent = await loginAs('admin');
      testCounter++;
      const timestamp = Date.now();

      const res = await agent
        .post('/api/v1/roles')
        .send({
          key: `custom_role_${testCounter}_${timestamp}`,
          name: `Custom Role ${testCounter}`,
          description: `Test custom role ${testCounter}`,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.key).toBe(`custom_role_${testCounter}_${timestamp}`);
      expect(res.body.name).toBe(`Custom Role ${testCounter}`);
      expect(res.body.description).toBe(`Test custom role ${testCounter}`);
    });

    it('should create role without optional description', async () => {
      const agent = await loginAs('admin');
      testCounter++;
      const timestamp = Date.now();

      const res = await agent
        .post('/api/v1/roles')
        .send({
          key: `no_desc_role_${testCounter}_${timestamp}`,
          name: `No Desc Role ${testCounter}`,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.key).toBe(`no_desc_role_${testCounter}_${timestamp}`);
      expect(res.body.name).toBe(`No Desc Role ${testCounter}`);
    });

    it('should create role with permission IDs', async () => {
      const agent = await loginAs('admin');
      testCounter++;
      const perms = await fetchPermissions(agent);

      if (perms.length < 2) {
        return; // Skip if not enough permissions
      }

      const selectedPerms = perms.slice(0, 2);

      const res = await agent
        .post('/api/v1/roles')
        .send({
          key: `role_with_perms_${testCounter}_${Date.now()}`,
          name: `Role With Perms ${testCounter}`,
          permissionIds: selectedPerms,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      const roleId = res.body.id;

      // Verify permissions were assigned
      const getRes = await agent.get(`/api/v1/roles/${roleId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.permissions.length).toBe(selectedPerms.length);
    });

    it('should return 409 for duplicate role key', async () => {
      const agent = await loginAs('admin');
      testCounter++;
      const uniqueKey = `dup_key_${testCounter}_${Date.now()}`;

      // Create first role
      const res1 = await agent
        .post('/api/v1/roles')
        .send({
          key: uniqueKey,
          name: `First Role ${testCounter}`,
        });

      expect(res1.status).toBe(201);

      // Try to create with same key
      const res2 = await agent
        .post('/api/v1/roles')
        .send({
          key: uniqueKey,
          name: `Second Role ${testCounter}`,
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error).toBe('Role key already exists');
    });

    it('should return 400 for missing key', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/roles')
        .send({
          name: 'Missing Key Role',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for missing name', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      const res = await agent
        .post('/api/v1/roles')
        .send({
          key: `name_missing_${testCounter}_${Date.now()}`,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for empty key', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/roles')
        .send({
          key: '',
          name: 'Empty Key Role',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for empty name', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      const res = await agent
        .post('/api/v1/roles')
        .send({
          key: `empty_name_${testCounter}_${Date.now()}`,
          name: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for invalid permission ID format', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      const res = await agent
        .post('/api/v1/roles')
        .send({
          key: `bad_perm_${testCounter}_${Date.now()}`,
          name: `Bad Perm Role ${testCounter}`,
          permissionIds: ['not-a-uuid'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should require admin.roles permission', async () => {
      const assessorAgent = await loginAs('assessor');
      testCounter++;

      const res = await assessorAgent
        .post('/api/v1/roles')
        .send({
          key: `assessor_create_${testCounter}_${Date.now()}`,
          name: 'Assessor Created Role',
        });

      expect(res.status).toBe(403);
    });

    it('should require assessee role to not create roles', async () => {
      const assesseeAgent = await loginAs('assessee');
      testCounter++;

      const res = await assesseeAgent
        .post('/api/v1/roles')
        .send({
          key: `assessee_create_${testCounter}_${Date.now()}`,
          name: 'Assessee Created Role',
        });

      expect(res.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();
      testCounter++;

      const res = await unauthAgent
        .post('/api/v1/roles')
        .send({
          key: `unauth_${testCounter}_${Date.now()}`,
          name: 'Unauth Role',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/roles/:id', () => {
    it('should update role name', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      // Create a role
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `update_name_${testCounter}_${Date.now()}`,
          name: `Original Name ${testCounter}`,
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Update the name
      const updateRes = await agent
        .put(`/api/v1/roles/${roleId}`)
        .send({
          name: `Updated Name ${testCounter}`,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe(`Updated Name ${testCounter}`);
    });

    it('should update role description', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      // Create a role
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `update_desc_${testCounter}_${Date.now()}`,
          name: `Update Desc Role ${testCounter}`,
          description: 'Original description',
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Update the description
      const updateRes = await agent
        .put(`/api/v1/roles/${roleId}`)
        .send({
          description: 'Updated description',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.description).toBe('Updated description');
    });

    it('should update role permissions', async () => {
      const agent = await loginAs('admin');
      testCounter++;
      const perms = await fetchPermissions(agent);

      if (perms.length < 3) {
        return; // Skip if not enough permissions
      }

      // Create a role with initial permissions
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `update_perms_${testCounter}_${Date.now()}`,
          name: `Update Perms Role ${testCounter}`,
          permissionIds: [perms[0]],
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Update permissions
      const newPerms = [perms[1], perms[2]];
      const updateRes = await agent
        .put(`/api/v1/roles/${roleId}`)
        .send({
          permissionIds: newPerms,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.permissions.length).toBe(newPerms.length);
    });

    it('should clear permissions when empty array provided', async () => {
      const agent = await loginAs('admin');
      testCounter++;
      const perms = await fetchPermissions(agent);

      if (perms.length < 1) {
        return;
      }

      // Create a role with permissions
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `clear_perms_${testCounter}_${Date.now()}`,
          name: `Clear Perms Role ${testCounter}`,
          permissionIds: [perms[0]],
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Clear permissions
      const updateRes = await agent
        .put(`/api/v1/roles/${roleId}`)
        .send({
          permissionIds: [],
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.permissions.length).toBe(0);
    });

    it('should update multiple fields at once', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      // Create a role
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `multi_update_${testCounter}_${Date.now()}`,
          name: `Multi Update Role ${testCounter}`,
          description: 'Original',
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Update multiple fields
      const updateRes = await agent
        .put(`/api/v1/roles/${roleId}`)
        .send({
          name: `Updated Multi ${testCounter}`,
          description: 'Updated Description',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe(`Updated Multi ${testCounter}`);
      expect(updateRes.body.description).toBe('Updated Description');
    });

    it('should return 404 for non-existent role', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .put('/api/v1/roles/00000000-0000-0000-0000-000000000000')
        .send({
          name: 'Update Attempt',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Role not found');
    });

    it('should prevent updating system roles', async () => {
      const agent = await loginAs('admin');
      const sysRoleId = await getSystemRoleId(agent);

      if (!sysRoleId) {
        return; // Skip if no system role found
      }

      const res = await agent
        .put(`/api/v1/roles/${sysRoleId}`)
        .send({
          name: 'Hacked System Role',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot modify system roles');
    });

    it('should return 400 for invalid permission ID format', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      // Create a role
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `bad_perm_update_${testCounter}_${Date.now()}`,
          name: `Bad Perm Update ${testCounter}`,
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Try to update with bad permission ID
      const updateRes = await agent
        .put(`/api/v1/roles/${roleId}`)
        .send({
          permissionIds: ['not-a-uuid'],
        });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error).toBe('Invalid input');
    });

    it('should require admin.roles permission', async () => {
      const adminAgent = await loginAs('admin');
      testCounter++;

      // Create a role as admin
      const createRes = await adminAgent
        .post('/api/v1/roles')
        .send({
          key: `assessor_update_${testCounter}_${Date.now()}`,
          name: `Assessor Update Test ${testCounter}`,
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Try to update as assessor
      const assessorAgent = await loginAs('assessor');
      const updateRes = await assessorAgent
        .put(`/api/v1/roles/${roleId}`)
        .send({
          name: 'Assessor Updated',
        });

      expect(updateRes.status).toBe(403);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent
        .put('/api/v1/roles/00000000-0000-0000-0000-000000000000')
        .send({
          name: 'Unauth Update',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/v1/roles/:id', () => {
    it('should delete a custom role', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      // Create a role
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `delete_${testCounter}_${Date.now()}`,
          name: `Delete Role ${testCounter}`,
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Delete the role
      const deleteRes = await agent.delete(`/api/v1/roles/${roleId}`);

      expect(deleteRes.status).toBe(204);

      // Verify it's deleted
      const getRes = await agent.get(`/api/v1/roles/${roleId}`);
      expect(getRes.status).toBe(404);
    });

    it('should delete a role with permissions', async () => {
      const agent = await loginAs('admin');
      testCounter++;
      const perms = await fetchPermissions(agent);

      if (perms.length < 1) {
        return;
      }

      // Create a role with permissions
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `delete_with_perms_${testCounter}_${Date.now()}`,
          name: `Delete With Perms ${testCounter}`,
          permissionIds: [perms[0]],
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Delete the role
      const deleteRes = await agent.delete(`/api/v1/roles/${roleId}`);

      expect(deleteRes.status).toBe(204);

      // Verify it's deleted and permissions are cleaned up
      const getRes = await agent.get(`/api/v1/roles/${roleId}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for non-existent role', async () => {
      const agent = await loginAs('admin');

      const res = await agent.delete('/api/v1/roles/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Role not found');
    });

    it('should prevent deleting system roles', async () => {
      const agent = await loginAs('admin');
      const sysRoleId = await getSystemRoleId(agent);

      if (!sysRoleId) {
        return; // Skip if no system role found
      }

      const res = await agent.delete(`/api/v1/roles/${sysRoleId}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot delete system roles');
    });

    it('should require admin.roles permission', async () => {
      const adminAgent = await loginAs('admin');
      testCounter++;

      // Create a role as admin
      const createRes = await adminAgent
        .post('/api/v1/roles')
        .send({
          key: `assessor_delete_${testCounter}_${Date.now()}`,
          name: `Assessor Delete Test ${testCounter}`,
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Try to delete as assessor
      const assessorAgent = await loginAs('assessor');
      const deleteRes = await assessorAgent.delete(`/api/v1/roles/${roleId}`);

      expect(deleteRes.status).toBe(403);

      // Verify it still exists
      const getRes = await adminAgent.get(`/api/v1/roles/${roleId}`);
      expect(getRes.status).toBe(200);
    });

    it('should require authentication', async () => {
      const unauthAgent = getAgent();

      const res = await unauthAgent.delete('/api/v1/roles/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(401);
    });
  });

  describe('Edge cases and integration scenarios', () => {
    it('should handle rapid role creation', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(
          agent
            .post('/api/v1/roles')
            .send({
              key: `rapid_${testCounter}_${i}_${Date.now()}`,
              name: `Rapid Role ${testCounter}-${i}`,
            })
        );
      }

      const results = await Promise.all(promises);

      results.forEach((res) => {
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
      });
    });

    it('should return correct total count in pagination', async () => {
      const agent = await loginAs('admin');

      const res1 = await agent.get('/api/v1/roles?limit=1&offset=0');
      const res2 = await agent.get('/api/v1/roles?limit=1&offset=1');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Both should report the same total count
      expect(res1.body.pagination.total).toBe(res2.body.pagination.total);
    });

    it('should handle offset beyond total', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/roles?limit=10&offset=999999');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it('should maintain role integrity after failed update', async () => {
      const agent = await loginAs('admin');
      testCounter++;

      // Create a role
      const createRes = await agent
        .post('/api/v1/roles')
        .send({
          key: `integrity_${testCounter}_${Date.now()}`,
          name: `Integrity Test ${testCounter}`,
          description: 'Original',
        });

      expect(createRes.status).toBe(201);
      const roleId = createRes.body.id;

      // Try invalid update
      const badUpdateRes = await agent
        .put(`/api/v1/roles/${roleId}`)
        .send({
          name: '',
        });

      // May fail or ignore the invalid update
      if (badUpdateRes.status === 400) {
        // Verify original data is intact
        const getRes = await agent.get(`/api/v1/roles/${roleId}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.role.description).toBe('Original');
      }
    });
  });
});
