import { describe, it, expect } from 'vitest';
import { setupHttpTests, getAgent, getBaseUrl, loginAs, testUsers } from '../helpers/http.js';

describe('Users Routes (HTTP Integration)', () => {
  setupHttpTests();

  describe('GET /api/v1/users', () => {
    it('should return user list with pagination as admin', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/users').query({ limit: 10, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('offset');
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.offset).toBe(0);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(3); // At least our 3 test users
    });

    it('should cap limit at 100', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/users').query({ limit: 500, offset: 0 });

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(100);
    });

    it('should use default limit of 50 if not specified', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/users');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(50);
    });

    it('should return camelCase fields in response', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/users');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const user = res.body.data[0];
        // Check for camelCase fields instead of snake_case
        expect(user).toHaveProperty('displayName');
        expect(user).toHaveProperty('isActive');
        expect(user).toHaveProperty('lastLoginAt');
        expect(user).toHaveProperty('createdAt');
        // Should NOT have snake_case versions
        expect(user).not.toHaveProperty('display_name');
        expect(user).not.toHaveProperty('is_active');
        expect(user).not.toHaveProperty('last_login_at');
        expect(user).not.toHaveProperty('created_at');
      }
    });

    it('should return 403 for non-admin users', async () => {
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.get('/api/v1/users');

      expect(res.status).toBe(403);
    });

    it('should return 403 for assessee users', async () => {
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.get('/api/v1/users');

      expect(res.status).toBe(403);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/users');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/users/assignable', () => {
    it('should return active users for authenticated users', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/users/assignable');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should contain our test users (all active)
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should only return active users', async () => {
      const agent = await loginAs('admin');

      // First create an inactive user
      const createRes = await agent
        .post('/api/v1/users')
        .send({
          username: 'inactive_user_test',
          email: 'inactive@test.local',
          displayName: 'Inactive User',
          password: 'SecurePass123!',
          role: 'assessee',
        });

      expect(createRes.status).toBe(201);
      const userId = createRes.body.id;

      // Deactivate the user
      await agent.put(`/api/v1/users/${userId}/deactivate`);

      // Now check assignable list
      const assignableRes = await agent.get('/api/v1/users/assignable');
      expect(assignableRes.status).toBe(200);

      const usernames = assignableRes.body.data.map((u: any) => u.username);
      expect(usernames).not.toContain('inactive_user_test');
    });

    it('should return camelCase fields', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/users/assignable');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const user = res.body.data[0];
        expect(user).toHaveProperty('displayName');
        expect(user).not.toHaveProperty('display_name');
      }
    });

    it('should be accessible to assessor role', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/users/assignable');

      expect(res.status).toBe(200);
    });

    it('should be accessible to assessee role', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get('/api/v1/users/assignable');

      expect(res.status).toBe(200);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/users/assignable');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should return user by id', async () => {
      const agent = await loginAs('admin');
      const adminId = testUsers.admin.id;

      const res = await agent.get(`/api/v1/users/${adminId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(adminId);
      expect(res.body.username).toBe('test_admin');
      expect(res.body).toHaveProperty('displayName');
      expect(res.body).toHaveProperty('email');
    });

    it('should return camelCase response', async () => {
      const agent = await loginAs('admin');
      const adminId = testUsers.admin.id;

      const res = await agent.get(`/api/v1/users/${adminId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('displayName');
      expect(res.body).toHaveProperty('isActive');
      expect(res.body).not.toHaveProperty('display_name');
      expect(res.body).not.toHaveProperty('is_active');
    });

    it('should return 404 for non-existent user', async () => {
      const agent = await loginAs('admin');
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await agent.get(`/api/v1/users/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('should be accessible to any authenticated user', async () => {
      const _adminAgent = await loginAs('admin');
      const adminId = testUsers.admin.id;

      const assessorRes = await (await loginAs('assessor')).get(`/api/v1/users/${adminId}`);
      const assesseeRes = await (await loginAs('assessee')).get(`/api/v1/users/${adminId}`);

      expect(assessorRes.status).toBe(200);
      expect(assesseeRes.status).toBe(200);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const adminId = testUsers.admin.id;

      const res = await agent.get(`/api/v1/users/${adminId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/users', () => {
    it('should create a user as admin', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/users')
        .send({
          username: 'newuser_123',
          email: 'newuser@test.local',
          displayName: 'New User',
          password: 'SecurePassword123!',
          role: 'assessor',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.username).toBe('newuser_123');
      expect(res.body.email).toBe('newuser@test.local');
      expect(res.body.displayName).toBe('New User');
      expect(res.body.role).toBe('assessor');
      expect(res.body.isActive).toBe(true);
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
    });

    it('should default role to assessee if not specified', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/users')
        .send({
          username: 'defaultrole_user',
          email: 'defaultrole@test.local',
          displayName: 'Default Role User',
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('assessee');
    });

    it('should return 409 for duplicate username', async () => {
      const agent = await loginAs('admin');
      const existingUsername = testUsers.assessor.username;

      const res = await agent
        .post('/api/v1/users')
        .send({
          username: existingUsername,
          email: 'different@test.local',
          displayName: 'Different User',
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Username already exists');
    });

    it('should return 409 for duplicate email', async () => {
      const agent = await loginAs('admin');
      const existingEmail = testUsers.admin.email;

      const res = await agent
        .post('/api/v1/users')
        .send({
          username: 'unique_username',
          email: existingEmail,
          displayName: 'New User',
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already exists');
    });

    it('should return 400 for invalid input', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/users')
        .send({
          username: 'ab', // Too short
          email: 'invalid-email',
          displayName: 'Test',
          password: 'short', // Too short
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should return 400 for missing required fields', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .post('/api/v1/users')
        .send({
          username: 'newuser',
          // Missing email, displayName, password
        });

      expect(res.status).toBe(400);
    });

    it('should return 403 for non-admin users', async () => {
      const assessorAgent = await loginAs('assessor');

      const res = await assessorAgent
        .post('/api/v1/users')
        .send({
          username: 'should_fail',
          email: 'fail@test.local',
          displayName: 'Fail User',
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(403);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/users')
        .send({
          username: 'should_fail',
          email: 'fail@test.local',
          displayName: 'Fail User',
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/users/:id', () => {
    it('should update user fields as admin', async () => {
      const agent = await loginAs('admin');

      // Create a dedicated user for this test so we don't pollute
      // the shared test_assessor role for later tests
      const createRes = await agent
        .post('/api/v1/users')
        .send({
          username: 'user_role_update_test',
          email: 'role_update@test.local',
          displayName: 'Role Update User',
          password: 'SecurePassword123!',
          role: 'assessee',
        });
      expect(createRes.status).toBe(201);
      const userId = createRes.body.id;

      const res = await agent
        .put(`/api/v1/users/${userId}`)
        .send({
          displayName: 'Updated User',
          role: 'admin',
        });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Updated User');
      expect(res.body.role).toBe('admin');
    });

    it('should update only provided fields', async () => {
      const agent = await loginAs('admin');
      const assesseeId = testUsers.assessee.id;
      const originalEmail = testUsers.assessee.email;

      const res = await agent
        .put(`/api/v1/users/${assesseeId}`)
        .send({
          displayName: 'Just Updated Name',
        });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Just Updated Name');
      expect(res.body.email).toBe(originalEmail); // Should remain unchanged
    });

    it('should update email without conflicts', async () => {
      const agent = await loginAs('admin');
      const assesseeId = testUsers.assessee.id;

      const res = await agent
        .put(`/api/v1/users/${assesseeId}`)
        .send({
          email: 'newemail@test.local',
        });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('newemail@test.local');
    });

    it('should return 409 when updating to duplicate email', async () => {
      const agent = await loginAs('admin');
      const assesseeId = testUsers.assessee.id;
      const adminEmail = testUsers.admin.email;

      const res = await agent
        .put(`/api/v1/users/${assesseeId}`)
        .send({
          email: adminEmail,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already exists');
    });

    it('should update isActive status', async () => {
      const agent = await loginAs('admin');
      const assesseeId = testUsers.assessee.id;

      const res = await agent
        .put(`/api/v1/users/${assesseeId}`)
        .send({
          isActive: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });

    it('should return 404 for non-existent user', async () => {
      const agent = await loginAs('admin');
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await agent
        .put(`/api/v1/users/${fakeId}`)
        .send({
          displayName: 'Updated Name',
        });

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid input', async () => {
      const agent = await loginAs('admin');
      const assessorId = testUsers.assessor.id;

      const res = await agent
        .put(`/api/v1/users/${assessorId}`)
        .send({
          email: 'not-an-email',
        });

      expect(res.status).toBe(400);
    });

    it('should return 403 for non-admin users', async () => {
      const assessorAgent = await loginAs('assessor');
      const assesseeId = testUsers.assessee.id;

      const res = await assessorAgent
        .put(`/api/v1/users/${assesseeId}`)
        .send({
          displayName: 'Updated',
        });

      expect(res.status).toBe(403);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const assessorId = testUsers.assessor.id;

      const res = await agent
        .put(`/api/v1/users/${assessorId}`)
        .send({
          displayName: 'Updated',
        });

      expect(res.status).toBe(401);
    });

    it('should return camelCase in response', async () => {
      const agent = await loginAs('admin');
      const assessorId = testUsers.assessor.id;

      const res = await agent
        .put(`/api/v1/users/${assessorId}`)
        .send({
          displayName: 'CamelCase Test',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('displayName');
      expect(res.body).toHaveProperty('isActive');
      expect(res.body).not.toHaveProperty('display_name');
      expect(res.body).not.toHaveProperty('is_active');
    });
  });

  describe('PUT /api/v1/users/:id/activate', () => {
    it('should activate a deactivated user as admin', async () => {
      const agent = await loginAs('admin');

      // First create and deactivate a user
      const createRes = await agent
        .post('/api/v1/users')
        .send({
          username: 'user_to_activate',
          email: 'activate@test.local',
          displayName: 'User to Activate',
          password: 'SecurePassword123!',
        });

      const userId = createRes.body.id;

      // Deactivate
      await agent.put(`/api/v1/users/${userId}/deactivate`);

      // Activate
      const res = await agent.put(`/api/v1/users/${userId}/activate`);

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const agent = await loginAs('admin');
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await agent.put(`/api/v1/users/${fakeId}/activate`);

      expect(res.status).toBe(404);
    });

    it('should return 403 for non-admin users', async () => {
      const assessorAgent = await loginAs('assessor');
      const assesseeId = testUsers.assessee.id;

      const res = await assessorAgent.put(`/api/v1/users/${assesseeId}/activate`);

      expect(res.status).toBe(403);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const assessorId = testUsers.assessor.id;

      const res = await agent.put(`/api/v1/users/${assessorId}/activate`);

      expect(res.status).toBe(401);
    });

    it('should return camelCase in response', async () => {
      const agent = await loginAs('admin');
      const assessorId = testUsers.assessor.id;

      const res = await agent.put(`/api/v1/users/${assessorId}/activate`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isActive');
      expect(res.body).not.toHaveProperty('is_active');
    });
  });

  describe('PUT /api/v1/users/:id/deactivate', () => {
    it('should deactivate a user as admin', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/users')
        .send({
          username: 'user_to_deactivate',
          email: 'deactivate@test.local',
          displayName: 'User to Deactivate',
          password: 'SecurePassword123!',
        });

      const userId = createRes.body.id;

      const res = await agent.put(`/api/v1/users/${userId}/deactivate`);

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
    });

    it('should prevent admin from deactivating self', async () => {
      const agent = await loginAs('admin');
      const adminId = testUsers.admin.id;

      const res = await agent.put(`/api/v1/users/${adminId}/deactivate`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot deactivate your own account');
    });

    it('should prevent other admins from deactivating self', async () => {
      const agent = await loginAs('admin');

      // Create another admin with unique credentials
      const createRes = await agent
        .post('/api/v1/users')
        .send({
          username: 'second_admin_deact',
          email: 'second_admin_deact@test.local',
          displayName: 'Second Admin',
          password: 'SecurePassword123!',
          role: 'admin',
        });
      expect(createRes.status).toBe(201);
      const secondAdminId = createRes.body.id;

      // Login as the second admin manually (loginAs only supports predefined users)
      const supertest = await import('supertest');
      const secondAdminAgent = supertest.default.agent(getBaseUrl());
      const loginRes = await secondAdminAgent
        .post('/api/v1/auth/login')
        .send({ username: 'second_admin_deact', password: 'SecurePassword123!' });
      expect([200, 201]).toContain(loginRes.status);

      // Second admin tries to deactivate self
      const res = await secondAdminAgent.put(`/api/v1/users/${secondAdminId}/deactivate`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot deactivate your own account');
    });

    it('should return 404 for non-existent user', async () => {
      const agent = await loginAs('admin');
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await agent.put(`/api/v1/users/${fakeId}/deactivate`);

      expect(res.status).toBe(404);
    });

    it('should return 403 for non-admin users', async () => {
      const assessorAgent = await loginAs('assessor');
      const assesseeId = testUsers.assessee.id;

      const res = await assessorAgent.put(`/api/v1/users/${assesseeId}/deactivate`);

      expect(res.status).toBe(403);
    });

    it('should return 401 for unauthenticated requests', async () => {
      const agent = getAgent();
      const assessorId = testUsers.assessor.id;

      const res = await agent.put(`/api/v1/users/${assessorId}/deactivate`);

      expect(res.status).toBe(401);
    });

    it('should return camelCase in response', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent
        .post('/api/v1/users')
        .send({
          username: 'camelcase_deactivate_test',
          email: 'camelcase_deactivate@test.local',
          displayName: 'CamelCase Deactivate Test',
          password: 'SecurePassword123!',
        });

      const userId = createRes.body.id;

      const res = await agent.put(`/api/v1/users/${userId}/deactivate`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isActive');
      expect(res.body).not.toHaveProperty('is_active');
    });
  });
});
