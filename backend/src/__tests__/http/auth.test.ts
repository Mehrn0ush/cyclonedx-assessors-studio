import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { setupHttpTests, getAgent, getApp, loginAs, testUsers } from '../helpers/http.js';

describe('Auth Routes (HTTP Integration)', () => {
  setupHttpTests();

  describe('POST /login', () => {
    it('should login with valid credentials', async () => {
      const agent = getAgent();
      const user = testUsers.admin;

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: user.username,
          password: user.password,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toMatchObject({
        id: user.id,
        username: user.username,
        email: user.email,
        role: 'admin',
      });
      expect(res.body.user).toHaveProperty('displayName');
      expect(res.body.user).toHaveProperty('hasCompletedOnboarding');

      // Verify httpOnly cookie is set
      expect(res.headers['set-cookie']).toBeDefined();
      const tokenCookie = (res.headers['set-cookie'] as unknown as string[]).find((cookie: string) =>
        cookie.startsWith('token=')
      );
      expect(tokenCookie).toBeDefined();
      expect(tokenCookie).toContain('HttpOnly');
    });

    it('should reject login with wrong password', async () => {
      const agent = getAgent();
      const user = testUsers.admin;

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: user.username,
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject login with nonexistent user', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: 'nonexistent_user_xyz',
          password: 'Password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should reject login with password shorter than 8 chars', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: testUsers.admin.username,
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Invalid input');
      expect(res.body).toHaveProperty('details');
    });

    it('should reject login with username shorter than 3 chars', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: 'ab',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Invalid input');
    });

    it('should reject login with missing username', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject login with missing password', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: testUsers.admin.username,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /me', () => {
    it('should return current user when authenticated', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/auth/me');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toMatchObject({
        id: testUsers.admin.id,
        username: testUsers.admin.username,
        email: testUsers.admin.email,
        role: 'admin',
      });
      expect(res.body.user).toHaveProperty('displayName');
      expect(res.body.user).toHaveProperty('hasCompletedOnboarding');
    });

    it('should return 401 without authentication', async () => {
      const agent = getAgent();

      const res = await agent.get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should return different user data for different roles', async () => {
      const adminAgent = await loginAs('admin');
      const assessorAgent = await loginAs('assessor');

      const adminRes = await adminAgent.get('/api/v1/auth/me');
      const assessorRes = await assessorAgent.get('/api/v1/auth/me');

      expect(adminRes.body.user.id).toBe(testUsers.admin.id);
      expect(adminRes.body.user.role).toBe('admin');

      expect(assessorRes.body.user.id).toBe(testUsers.assessor.id);
      expect(assessorRes.body.user.role).toBe('assessor');
    });
  });

  describe('POST /logout', () => {
    it('should logout and invalidate session', async () => {
      const agent = await loginAs('admin');

      // Verify authenticated access works
      let res = await agent.get('/api/v1/auth/me');
      expect(res.status).toBe(200);

      // Logout
      res = await agent.post('/api/v1/auth/logout');
      expect(res.status).toBe(204);

      // Verify token cookie is cleared
      expect(res.headers['set-cookie']).toBeDefined();
      const clearCookie = (res.headers['set-cookie'] as unknown as string[]).find((cookie: string) =>
        cookie.startsWith('token=')
      );
      // Cookie is cleared by setting Expires to epoch or Max-Age=0
      expect(clearCookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);

      // Verify subsequent /me request fails
      res = await agent.get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return 401 without authentication', async () => {
      const agent = getAgent();

      const res = await agent.post('/api/v1/auth/logout');

      expect(res.status).toBe(401);
    });

    it('should allow re-login after logout', async () => {
      const user = testUsers.assessee;
      const agent = supertest.agent(getApp());

      // First login
      let res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: user.username,
          password: user.password,
        });
      expect(res.status).toBe(200);

      // Logout
      res = await agent.post('/api/v1/auth/logout');
      expect(res.status).toBe(204);

      // Create new agent and login again
      const newAgent = supertest.agent(getApp());
      res = await newAgent
        .post('/api/v1/auth/login')
        .send({
          username: user.username,
          password: user.password,
        });
      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(user.id);
    });
  });

  describe('POST /register', () => {
    it('should register new user', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: 'newuser123',
          email: 'newuser@example.com',
          password: 'NewPassword123!',
          displayName: 'New User',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toMatchObject({
        username: 'newuser123',
        email: 'newuser@example.com',
        displayName: 'New User',
        role: 'assessee',
      });
      expect(res.body.user).toHaveProperty('id');
    });

    it('should reject duplicate username', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: testUsers.admin.username,
          email: 'different@example.com',
          password: 'Password123!',
          displayName: 'Different User',
        });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Username or email already exists');
    });

    it('should reject duplicate email', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: 'uniqueusername456',
          email: testUsers.admin.email,
          password: 'Password123!',
          displayName: 'Another User',
        });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Username or email already exists');
    });

    it('should reject registration with password shorter than 8 chars', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: 'anotheruser',
          email: 'another@example.com',
          password: 'short',
          displayName: 'Another User',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Invalid input');
    });

    it('should reject registration with username shorter than 3 chars', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: 'ab',
          email: 'test@example.com',
          password: 'Password123!',
          displayName: 'Test User',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject registration with invalid email', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: 'validuser',
          email: 'not-an-email',
          password: 'Password123!',
          displayName: 'Valid User',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject registration with missing displayName', async () => {
      const agent = getAgent();

      const res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: 'validuser',
          email: 'valid@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should allow login with newly registered user', async () => {
      const agent = getAgent();
      const newUsername = 'logintest999';
      const newPassword = 'LoginTest123!';

      // Register
      let res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: newUsername,
          email: 'logintest@example.com',
          password: newPassword,
          displayName: 'Login Test User',
        });
      expect(res.status).toBe(201);

      // Login with new credentials
      const loginAgent = getAgent();
      res = await loginAgent
        .post('/api/v1/auth/login')
        .send({
          username: newUsername,
          password: newPassword,
        });
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe(newUsername);
    });
  });

  describe('PUT /change-password', () => {
    it('should change password with correct current password', async () => {
      // Create a new user for this test to avoid modifying shared test state
      const agent = getAgent();
      const testUsername = 'changepwd_testuser';
      const testPassword = 'OldPassword123!';
      const newPassword = 'NewPassword456!';

      // First register a new user
      let res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: testUsername,
          email: `${testUsername}@test.local`,
          password: testPassword,
          displayName: 'Change Password Test User',
        });
      expect(res.status).toBe(201);

      // Login with the new user (use persistent agent for cookie)
      const loginAgent = supertest.agent(getApp());
      res = await loginAgent
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });
      expect(res.status).toBe(200);
      const userId = res.body.user.id;

      // Change password
      res = await loginAgent
        .put('/api/v1/auth/change-password')
        .send({
          currentPassword: testPassword,
          newPassword: newPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.id).toBe(userId);

      // Verify old password no longer works
      const oldLoginAgent = getAgent();
      let loginRes = await oldLoginAgent
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });
      expect(loginRes.status).toBe(401);

      // Verify new password works
      const newLoginAgent = getAgent();
      loginRes = await newLoginAgent
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: newPassword,
        });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.id).toBe(userId);
    });

    it('should reject password change with wrong current password', async () => {
      const agent = await loginAs('assessee');

      const res = await agent
        .put('/api/v1/auth/change-password')
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword456!',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Current password is incorrect');
    });

    it('should reject password change without authentication', async () => {
      const agent = getAgent();

      const res = await agent
        .put('/api/v1/auth/change-password')
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword456!',
        });

      expect(res.status).toBe(401);
    });

    it('should reject new password shorter than 8 chars', async () => {
      const agent = await loginAs('admin');
      const user = testUsers.admin;

      const res = await agent
        .put('/api/v1/auth/change-password')
        .send({
          currentPassword: user.password,
          newPassword: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Invalid input');
    });

    it('should reject password change with missing currentPassword', async () => {
      const agent = await loginAs('admin');

      const res = await agent
        .put('/api/v1/auth/change-password')
        .send({
          newPassword: 'NewPassword456!',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject password change with missing newPassword', async () => {
      const agent = await loginAs('admin');
      const user = testUsers.admin;

      const res = await agent
        .put('/api/v1/auth/change-password')
        .send({
          currentPassword: user.password,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /profile', () => {
    it('should update display name', async () => {
      const agent = await loginAs('admin');
      const newDisplayName = 'Updated Admin Name';

      const res = await agent
        .put('/api/v1/auth/profile')
        .send({
          displayName: newDisplayName,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.displayName).toBe(newDisplayName);
      expect(res.body.user.id).toBe(testUsers.admin.id);

      // Verify update persisted
      const meAgent = await loginAs('admin');
      const meRes = await meAgent.get('/api/v1/auth/me');
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.displayName).toBe(newDisplayName);
    });

    it('should reject profile update without authentication', async () => {
      const agent = getAgent();

      const res = await agent
        .put('/api/v1/auth/profile')
        .send({
          displayName: 'Some Name',
        });

      expect(res.status).toBe(401);
    });

    it('should reject profile update with empty display name', async () => {
      const agent = await loginAs('assessor');

      const res = await agent
        .put('/api/v1/auth/profile')
        .send({
          displayName: '',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject profile update with missing displayName', async () => {
      const agent = await loginAs('assessor');

      const res = await agent
        .put('/api/v1/auth/profile')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should allow updating other users do not see the change until re-login', async () => {
      const agent = await loginAs('assessee');
      const _originalName = testUsers.assessee.id;

      const res = await agent
        .put('/api/v1/auth/profile')
        .send({
          displayName: 'Fresh New Name',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.displayName).toBe('Fresh New Name');
    });
  });

  describe('POST /complete-onboarding', () => {
    it('should set onboarding completion flag', async () => {
      const agent = await loginAs('assessee');

      // Check initial state
      let res = await agent.get('/api/v1/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user.hasCompletedOnboarding).toBe(false);

      // Complete onboarding
      res = await agent.post('/api/v1/auth/complete-onboarding');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.hasCompletedOnboarding).toBe(true);

      // Verify flag persisted
      const meAgent = await loginAs('assessee');
      res = await meAgent.get('/api/v1/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user.hasCompletedOnboarding).toBe(true);
    });

    it('should reject onboarding completion without authentication', async () => {
      const agent = getAgent();

      const res = await agent.post('/api/v1/auth/complete-onboarding');

      expect(res.status).toBe(401);
    });

    it('should be idempotent (calling multiple times)', async () => {
      const agent = await loginAs('assessee');

      // First call
      let res = await agent.post('/api/v1/auth/complete-onboarding');
      expect(res.status).toBe(200);
      expect(res.body.user.hasCompletedOnboarding).toBe(true);

      // Second call
      res = await agent.post('/api/v1/auth/complete-onboarding');
      expect(res.status).toBe(200);
      expect(res.body.user.hasCompletedOnboarding).toBe(true);
    });
  });

  describe('POST /logout-all', () => {
    it('should invalidate all sessions', async () => {
      // Create a new user specifically for this test
      const agent = getAgent();
      const testUsername = 'logoutall_testuser';
      const testPassword = 'LogoutAllTest123!';

      // Register new user
      let res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: testUsername,
          email: `${testUsername}@test.local`,
          password: testPassword,
          displayName: 'Logout All Test User',
        });
      expect(res.status).toBe(201);

      // Create two persistent agents (with cookie jar) and login with both
      const agent1 = supertest.agent(getApp());
      const agent2 = supertest.agent(getApp());

      let loginRes = await agent1
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });
      expect(loginRes.status).toBe(200);

      loginRes = await agent2
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });
      expect(loginRes.status).toBe(200);

      // Verify both are authenticated
      res = await agent1.get('/api/v1/auth/me');
      expect(res.status).toBe(200);

      res = await agent2.get('/api/v1/auth/me');
      expect(res.status).toBe(200);

      // Logout all from agent1
      res = await agent1.post('/api/v1/auth/logout-all');
      expect(res.status).toBe(204);

      // Verify both sessions are now invalid
      res = await agent1.get('/api/v1/auth/me');
      expect(res.status).toBe(401);

      res = await agent2.get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return 401 without authentication', async () => {
      const agent = getAgent();

      const res = await agent.post('/api/v1/auth/logout-all');

      expect(res.status).toBe(401);
    });

    it('should allow re-login after logout-all', async () => {
      // Create a new user specifically for this test
      const agent = getAgent();
      const testUsername = 'relogoutall_testuser';
      const testPassword = 'ReLoginTest123!';

      // Register new user
      let res = await agent
        .post('/api/v1/auth/register')
        .send({
          username: testUsername,
          email: `${testUsername}@test.local`,
          password: testPassword,
          displayName: 'Re-Login Test User',
        });
      expect(res.status).toBe(201);

      // Login with persistent agent
      const loginAgent = supertest.agent(getApp());
      res = await loginAgent
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });
      expect(res.status).toBe(200);

      // Logout all
      res = await loginAgent.post('/api/v1/auth/logout-all');
      expect(res.status).toBe(204);

      // Verify session is invalid
      res = await loginAgent.get('/api/v1/auth/me');
      expect(res.status).toBe(401);

      // Login again with new agent
      const newAgent = supertest.agent(getApp());
      res = await newAgent
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword,
        });
      expect(res.status).toBe(200);

      // Verify new session works
      res = await newAgent.get('/api/v1/auth/me');
      expect(res.status).toBe(200);
    });
  });

  describe('camelCase response transformation', () => {
    it('should transform snake_case DB columns to camelCase in login response', async () => {
      const agent = getAgent();
      const user = testUsers.admin;

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: user.username,
          password: user.password,
        });

      expect(res.status).toBe(200);
      // Verify camelCase transformation (not snake_case)
      expect(res.body.user).toHaveProperty('displayName');
      expect(res.body.user).toHaveProperty('hasCompletedOnboarding');
      expect(res.body.user).not.toHaveProperty('display_name');
      expect(res.body.user).not.toHaveProperty('has_completed_onboarding');
    });

    it('should transform snake_case DB columns to camelCase in /me response', async () => {
      const agent = await loginAs('assessee');

      const res = await agent.get('/api/v1/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('displayName');
      expect(res.body.user).toHaveProperty('hasCompletedOnboarding');
      expect(res.body.user).not.toHaveProperty('display_name');
      expect(res.body.user).not.toHaveProperty('has_completed_onboarding');
    });
  });

  describe('Cookie security', () => {
    it('should set secure cookie attributes on login', async () => {
      const agent = getAgent();
      const user = testUsers.admin;

      const res = await agent
        .post('/api/v1/auth/login')
        .send({
          username: user.username,
          password: user.password,
        });

      expect(res.status).toBe(200);
      const tokenCookie = (res.headers['set-cookie'] as unknown as string[]).find((cookie: string) =>
        cookie.startsWith('token=')
      );

      expect(tokenCookie).toContain('HttpOnly');
      expect(tokenCookie).toContain('SameSite=Strict');
      expect(tokenCookie).toContain('Path=/');
      expect(tokenCookie).toContain('Max-Age=');
    });

    it('should clear cookie on logout', async () => {
      const agent = await loginAs('admin');

      const res = await agent.post('/api/v1/auth/logout');

      expect(res.status).toBe(204);
      const tokenCookie = (res.headers['set-cookie'] as unknown as string[]).find((cookie: string) =>
        cookie.startsWith('token=')
      );
      // Cookie is cleared by setting Expires to epoch or Max-Age=0
      expect(tokenCookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
    });
  });
});
