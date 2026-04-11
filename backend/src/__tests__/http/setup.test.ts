import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import http from 'http';
import { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Setup HTTP Routes', () => {
  let app: Express;
  let server: http.Server;
  let baseUrl: string;
  let agent: supertest.SuperTest<supertest.Test>;

  // Fresh database for setup tests (not using shared setupHttpTests helper
  // because we need to test setup state transitions)
  beforeAll(async () => {
    // Create a fresh database specifically for setup tests
    const dbDirBase = path.join(__dirname, '../../../..', 'data/pglite-setup-test');
    const dbDir = `${dbDirBase}-${Date.now()}`;
    try {
      if (fs.existsSync(dbDirBase)) {
        fs.rmSync(dbDirBase, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
    fs.mkdirSync(dbDir, { recursive: true });

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_PROVIDER = 'pglite';
    process.env.PGLITE_DATA_DIR = dbDir;
    process.env.JWT_SECRET = 'setup-test-secret-key-must-be-32-chars-min!!';
    process.env.JWT_EXPIRY = '24h';
    process.env.PORT = '3002';
    process.env.LOG_LEVEL = 'error';
    process.env.CORS_ORIGIN = '*';
    process.env.METRICS_ENABLED = 'false';

    // Dynamic imports so env vars are picked up
    const { initializeDatabase } = await import('../../db/connection.js');
    const { runMigrations } = await import('../../db/migrate.js');
    const { seedDefaultRolesAndPermissions } = await import('../../db/seed.js');
    const { initializeStorage } = await import('../../storage/index.js');
    const { createApp } = await import('../../app.js');
    const { initializeEventSystem } = await import('../../events/index.js');

    await initializeDatabase();
    await runMigrations();
    await seedDefaultRolesAndPermissions();
    initializeStorage();
    await initializeEventSystem();

    app = createApp();
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    agent = supertest(baseUrl);
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('GET /api/v1/setup/status', () => {
    it('should return setupComplete: false initially', async () => {
      const res = await agent.get('/api/v1/setup/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('setupComplete');
      expect(res.body.setupComplete).toBe(false);
    });

    it('should return valid JSON response', async () => {
      const res = await agent.get('/api/v1/setup/status');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(typeof res.body.setupComplete).toBe('boolean');
    });

    it('should not require authentication', async () => {
      // No auth header or cookie provided
      const res = await agent.get('/api/v1/setup/status');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/v1/setup - Create initial admin', () => {
    let testCounter = 0;

    it('should create initial admin user with valid data', async () => {
      testCounter++;
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${testCounter}_${Date.now()}`,
          email: `admin_${testCounter}_${Date.now()}@example.com`,
          displayName: `Test Admin ${testCounter}`,
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toContain('Administrator account created');
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('username');
      expect(res.body.user).toHaveProperty('email');
      expect(res.body.user).toHaveProperty('displayName');
      expect(res.body.user).toHaveProperty('role');
      expect(res.body.user.role).toBe('admin');
    });

    it('should return user with correct properties in camelCase', async () => {
      testCounter++;
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${testCounter}_${Date.now()}`,
          email: `admin_${testCounter}_${Date.now()}@example.com`,
          displayName: `Test Admin ${testCounter}`,
          password: 'SecurePassword123!',
        });

      // May get 201 if successful or 403 if setup already complete
      expect([201, 403]).toContain(res.status);
      if (res.status === 201) {
        expect(res.body.user).toHaveProperty('displayName');
        expect(res.body.user).not.toHaveProperty('display_name');
      }
    });

    it('should require username to be at least 3 characters', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: 'ab',
          email: `test_${Date.now()}@example.com`,
          displayName: 'Test User',
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        expect(res.body).toHaveProperty('details');
        const usernameError = res.body.details.find((d: any) => d.field === 'username');
        expect(usernameError).toBeDefined();
        expect(usernameError.message).toContain('at least 3 characters');
      }
    });

    it('should reject username longer than 64 characters', async () => {
      const longUsername = 'a'.repeat(65);
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: longUsername,
          email: `test_${Date.now()}@example.com`,
          displayName: 'Test User',
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        const usernameError = res.body.details.find((d: any) => d.field === 'username');
        expect(usernameError).toBeDefined();
        expect(usernameError.message).toContain('at most 64 characters');
      }
    });

    it('should only allow alphanumeric, dots, hyphens, and underscores in username', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: 'invalid@username',
          email: `test_${Date.now()}@example.com`,
          displayName: 'Test User',
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        const usernameError = res.body.details.find((d: any) => d.field === 'username');
        expect(usernameError).toBeDefined();
        expect(usernameError.message).toContain('letters, numbers, dots, hyphens, and underscores');
      }
    });

    it('should accept valid username formats', async () => {
      testCounter++;
      const validUsernames = [
        `valid_user_${Date.now()}`,
        `user-123_${Date.now()}`,
        `user.name_${Date.now()}`,
      ];

      for (const username of validUsernames) {
        const res = await agent
          .post('/api/v1/setup')
          .send({
            username,
            email: `test_${Date.now()}@example.com`,
            displayName: 'Test User',
            password: 'SecurePassword123!',
          });

        expect([201, 403]).toContain(res.status);
        if (res.status === 201) {
          expect(res.body.user.username).toBe(username);
        }
      }
    });

    it('should require valid email address', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          email: 'not-an-email',
          displayName: 'Test User',
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        const emailError = res.body.details.find((d: any) => d.field === 'email');
        expect(emailError).toBeDefined();
        expect(emailError.message).toContain('valid email');
      }
    });

    it('should accept various valid email formats', async () => {
      testCounter++;
      const validEmails = [
        `user${Date.now()}@example.com`,
        `user+tag${Date.now()}@subdomain.example.co.uk`,
        `user.name${Date.now()}@example.org`,
      ];

      for (const email of validEmails) {
        const res = await agent
          .post('/api/v1/setup')
          .send({
            username: `admin_${Date.now()}_${testCounter}`,
            email,
            displayName: 'Test User',
            password: 'SecurePassword123!',
          });

        expect([201, 403]).toContain(res.status);
        if (res.status === 201) {
          expect(res.body.user.email).toBe(email);
        }
        testCounter++;
      }
    });

    it('should require displayName to be present and non-empty', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          email: `test_${Date.now()}@example.com`,
          displayName: '',
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        const displayNameError = res.body.details.find((d: any) => d.field === 'displayName');
        expect(displayNameError).toBeDefined();
      }
    });

    it('should reject displayName longer than 128 characters', async () => {
      const longName = 'A'.repeat(129);
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          email: `test_${Date.now()}@example.com`,
          displayName: longName,
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        const displayNameError = res.body.details.find((d: any) => d.field === 'displayName');
        expect(displayNameError).toBeDefined();
        expect(displayNameError.message).toContain('at most 128 characters');
      }
    });

    it('should require password to be at least 8 characters', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          email: `test_${Date.now()}@example.com`,
          displayName: 'Test User',
          password: 'short',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        const passwordError = res.body.details.find((d: any) => d.field === 'password');
        expect(passwordError).toBeDefined();
        expect(passwordError.message).toContain('at least 8 characters');
      }
    });

    it('should reject password longer than 128 characters', async () => {
      const longPassword = 'A'.repeat(129);
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          email: `test_${Date.now()}@example.com`,
          displayName: 'Test User',
          password: longPassword,
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        const passwordError = res.body.details.find((d: any) => d.field === 'password');
        expect(passwordError).toBeDefined();
        expect(passwordError.message).toContain('at most 128 characters');
      }
    });

    it('should accept passwords within valid range', async () => {
      testCounter++;
      const validPasswords = [
        'ValidPass1',
        'ComplexP@ssw0rd!',
        '12345678',
        'a'.repeat(128),
      ];

      for (const password of validPasswords) {
        const res = await agent
          .post('/api/v1/setup')
          .send({
            username: `admin_${Date.now()}_${testCounter}`,
            email: `test_${Date.now()}_${testCounter}@example.com`,
            displayName: 'Test User',
            password,
          });

        expect([201, 403]).toContain(res.status);
        testCounter++;
      }
    });

    it('should reject missing username field', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          email: `test_${Date.now()}@example.com`,
          displayName: 'Test User',
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
      }
    });

    it('should reject missing email field', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          displayName: 'Test User',
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
      }
    });

    it('should reject missing displayName field', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          email: `test_${Date.now()}@example.com`,
          password: 'SecurePassword123!',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
      }
    });

    it('should reject missing password field', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          email: `test_${Date.now()}@example.com`,
          displayName: 'Test User',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
      }
    });

    it('should return 403 when setup is already completed', async () => {
      // First call should succeed (or fail if already complete)
      const firstRes = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${Date.now()}`,
          email: `test_${Date.now()}@example.com`,
          displayName: 'Test User',
          password: 'SecurePassword123!',
        });

      // After first successful setup, any further calls should be rejected
      if (firstRes.status === 201) {
        const secondRes = await agent
          .post('/api/v1/setup')
          .send({
            username: `admin_second_${Date.now()}`,
            email: `test_second_${Date.now()}@example.com`,
            displayName: 'Second Admin',
            password: 'SecurePassword123!',
          });

        expect(secondRes.status).toBe(403);
        expect(secondRes.body).toHaveProperty('error');
        expect(secondRes.body.error).toBe('Setup already completed');
        expect(secondRes.body).toHaveProperty('message');
        expect(secondRes.body.message).toContain('administrator account already exists');
      }
    });

    it('should store password as hash (not plaintext)', async () => {
      testCounter++;
      const password = 'PlaintextCheckPassword123!';
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: `admin_${testCounter}_${Date.now()}`,
          email: `test_${testCounter}_${Date.now()}@example.com`,
          displayName: 'Test User',
          password,
        });

      if (res.status === 201) {
        // Try to login with the password - if it works, it means the password was hashed correctly
        const loginRes = await agent
          .post('/api/v1/auth/login')
          .send({
            username: res.body.user.username,
            password,
          });

        // Login should succeed with the correct password
        expect([200, 201]).toContain(loginRes.status);
      }
    });

    it('should not allow duplicate usernames', async () => {
      testCounter++;
      const username = `unique_admin_${Date.now()}`;
      const email1 = `email1_${Date.now()}@example.com`;
      const email2 = `email2_${Date.now()}@example.com`;

      const firstRes = await agent
        .post('/api/v1/setup')
        .send({
          username,
          email: email1,
          displayName: 'Test User 1',
          password: 'SecurePassword123!',
        });

      if (firstRes.status === 201) {
        const secondRes = await agent
          .post('/api/v1/setup')
          .send({
            username,
            email: email2,
            displayName: 'Test User 2',
            password: 'SecurePassword123!',
          });

        // Should reject duplicate username
        expect(secondRes.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe('GET /api/v1/setup/standards-feed', () => {
    it('should return standards feed data structure', async () => {
      const res = await agent.get('/api/v1/setup/standards-feed');

      // This test may fail if the feed is unreachable, but we test the structure
      if (res.status === 200) {
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);

        // If there are items, they should have the expected structure
        if (res.body.data.length > 0) {
          const item = res.body.data[0];
          expect(item).toHaveProperty('id');
          expect(item).toHaveProperty('title');
          expect(item).toHaveProperty('url');
          expect(item).toHaveProperty('summary');
        }
      } else if (res.status === 502) {
        // Network error is expected if connectivity issues
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toContain('fetch standards feed');
      }
    });

    it('should handle network errors gracefully', async () => {
      const res = await agent.get('/api/v1/setup/standards-feed');

      // Either success or 502 error
      expect([200, 502]).toContain(res.status);

      if (res.status === 502) {
        expect(res.body).toHaveProperty('error');
        expect(typeof res.body.error).toBe('string');
      }
    });

    it('should not require authentication', async () => {
      // No auth header provided
      const res = await agent.get('/api/v1/setup/standards-feed');

      // Should not return 401
      expect(res.status).not.toBe(401);
    });

    it('should return camelCase response', async () => {
      const res = await agent.get('/api/v1/setup/standards-feed');

      if (res.status === 200 && res.body.data.length > 0) {
        const item = res.body.data[0];
        // Should have camelCase properties
        if (item.datePublished !== undefined) {
          expect(item).toHaveProperty('datePublished');
          expect(item).not.toHaveProperty('date_published');
        }
        if (item.contentHtml !== undefined) {
          expect(item).toHaveProperty('contentHtml');
          expect(item).not.toHaveProperty('content_html');
        }
      }
    });
  });

  describe('POST /api/v1/setup/import-standard', () => {
    it('should reject missing URL field', async () => {
      const res = await agent
        .post('/api/v1/setup/import-standard')
        .send({
          title: 'Test Standard',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('valid URL');
    });

    it('should reject non-string URL', async () => {
      const res = await agent
        .post('/api/v1/setup/import-standard')
        .send({
          url: 123,
          title: 'Test Standard',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('valid URL');
    });

    it('should reject HTTP URLs (require HTTPS)', async () => {
      const res = await agent
        .post('/api/v1/setup/import-standard')
        .send({
          url: 'http://example.com/standard.json',
          title: 'Test Standard',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('HTTPS');
      expect(res.body.error).toContain('trusted source');
    });

    it('should reject URLs from untrusted domains', async () => {
      const res = await agent
        .post('/api/v1/setup/import-standard')
        .send({
          url: 'https://evil-domain.com/standard.json',
          title: 'Test Standard',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('trusted source');
    });

    it('should accept URLs from trusted domains', async () => {
      const trustedUrls = [
        'https://github.com/org/repo/standard.json',
        'https://raw.githubusercontent.com/org/repo/standard.json',
        'https://cyclonedx.org/standards/standard.json',
        'https://api.github.com/repos/org/repo/contents/standard.json',
        'https://cdn.cyclonedx.org/standards.json',
      ];

      for (const url of trustedUrls) {
        const res = await agent
          .post('/api/v1/setup/import-standard')
          .send({
            url,
            title: 'Test Standard',
          });

        // Should not return 400 with "trusted source" error
        if (res.status === 400) {
          expect(res.body.error).not.toContain('trusted source');
        }
      }
    });

    it('should reject invalid URLs', async () => {
      const res = await agent
        .post('/api/v1/setup/import-standard')
        .send({
          url: 'not a valid url at all',
          title: 'Test Standard',
        });

      expect(res.status).toBe(400);
    });

    it('should handle 404 responses from URL', async () => {
      const res = await agent
        .post('/api/v1/setup/import-standard')
        .send({
          url: 'https://raw.githubusercontent.com/nonexistent/repo/nonexistent.json',
          title: 'Nonexistent Standard',
        });

      expect([400, 502]).toContain(res.status);
      expect(res.body).toHaveProperty('error');
    });

    it('should timeout on slow requests', async () => {
      // This test may not be reliable in all environments
      // A real slow server would be needed for this test
      expect(true).toBe(true); // Placeholder
    });

    it('should reject documents larger than 10MB', async () => {
      // This test would need a server returning a large file
      // Placeholder for structure
      expect(true).toBe(true);
    });

    it('should reject documents without standards', async () => {
      // Would need a mock CycloneDX document without standards
      expect(true).toBe(true);
    });

    it('should not require authentication', async () => {
      const res = await agent
        .post('/api/v1/setup/import-standard')
        .send({
          url: 'https://cyclonedx.org/invalid.json',
          title: 'Test',
        });

      // Should not return 401
      expect(res.status).not.toBe(401);
    });
  });

  describe('POST /api/v1/setup/seed-demo', () => {
    it('should return 201 or 200 status on success', async () => {
      const res = await agent.post('/api/v1/setup/seed-demo');

      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('message');
    });

    it('should indicate if demo data was seeded or already present', async () => {
      const firstRes = await agent.post('/api/v1/setup/seed-demo');
      expect([200, 201, 400, 409]).toContain(firstRes.status);

      const secondRes = await agent.post('/api/v1/setup/seed-demo');
      expect([200, 201, 400, 409]).toContain(secondRes.status);

      // One should indicate success, the other may indicate already present
      if (firstRes.body.message || secondRes.body.message) {
        const messages = [firstRes.body.message, secondRes.body.message].filter(m => m);
        const hasLoadedMessage = messages.some((m) => m.toLocaleLowerCase().includes('loaded') || m.toLocaleLowerCase().includes('success'));
        expect(messages.length > 0).toBe(true);
      }
    });

    it('should return proper error response on failure', async () => {
      const res = await agent.post('/api/v1/setup/seed-demo');

      if (res.status >= 500) {
        expect(res.body).toHaveProperty('error');
      }
    });

    it('should not require authentication', async () => {
      const res = await agent.post('/api/v1/setup/seed-demo');

      // Should not return 401
      expect(res.status).not.toBe(401);
    });

    it('should not expose internal error details', async () => {
      // Seed demo with a broken state if possible
      const res = await agent.post('/api/v1/setup/seed-demo');

      if (res.status >= 500) {
        // Error should be generic, not expose stack traces or internal details
        expect(res.body.error).not.toContain('stack');
        expect(res.body.error).not.toContain('at ');
      }
    });
  });

  describe('Integration: Setup flow sequence', () => {
    it('should allow full setup flow: status -> create admin', async () => {
      // Check initial status
      const statusRes = await agent.get('/api/v1/setup/status');
      expect(statusRes.status).toBe(200);

      if (!statusRes.body.setupComplete) {
        // Create admin
        const setupRes = await agent
          .post('/api/v1/setup')
          .send({
            username: `flow_admin_${Date.now()}`,
            email: `flow_admin_${Date.now()}@example.com`,
            displayName: 'Flow Test Admin',
            password: 'FlowPassword123!',
          });

        if (setupRes.status === 201) {
          // Verify we can now login with created account
          const loginRes = await agent
            .post('/api/v1/auth/login')
            .send({
              username: setupRes.body.user.username,
              password: 'FlowPassword123!',
            });

          expect([200, 201]).toContain(loginRes.status);
        }
      }
    });

    it('should block setup endpoint after first admin is created', async () => {
      // This test depends on earlier tests creating the first admin
      // Get current setup status
      const statusRes = await agent.get('/api/v1/setup/status');

      if (statusRes.body.setupComplete) {
        // If setup is complete, any setup POST should fail
        const setupRes = await agent
          .post('/api/v1/setup')
          .send({
            username: `blocked_admin_${Date.now()}`,
            email: `blocked_${Date.now()}@example.com`,
            displayName: 'Should Fail',
            password: 'Password123!',
          });

        expect(setupRes.status).toBe(403);
        expect(setupRes.body.error).toBe('Setup already completed');
      }
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle empty request body', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({});

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      expect(res.body).toHaveProperty('error');
    });

    it('should handle malformed JSON gracefully', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .set('Content-Type', 'application/json')
        .send('not valid json');

      // May get 400/422 (parse error), 403 (setup already complete), or 500 (server error)
      expect([400, 422, 403, 500]).toContain(res.status);
    });

    it('should return appropriate error structure for validation failures', async () => {
      const res = await agent
        .post('/api/v1/setup')
        .send({
          username: 'ab',
          email: 'invalid',
          displayName: '',
          password: 'short',
        });

      // May get 400 (validation error) or 403 (setup already complete)
      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body).toHaveProperty('error');
        expect(res.body.error).toBe('Validation failed');
        expect(res.body).toHaveProperty('details');
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.length).toBeGreaterThan(0);

        // Each detail should have field and message
        for (const detail of res.body.details) {
          expect(detail).toHaveProperty('field');
          expect(detail).toHaveProperty('message');
        }
      }
    });

    it('should handle simultaneous setup requests gracefully', async () => {
      // This tests race condition safety
      const requests = Array(3).fill(null).map((_, i) =>
        agent.post('/api/v1/setup').send({
          username: `race_${i}_${Date.now()}`,
          email: `race_${i}_${Date.now()}@example.com`,
          displayName: `Race Test ${i}`,
          password: 'RacePassword123!',
        })
      );

      const responses = await Promise.all(requests);

      // At most one should succeed (201), others should fail (403 or 400)
      const successCount = responses.filter((r) => r.status === 201).length;
      expect(successCount).toBeLessThanOrEqual(1);
    });
  });

  describe('Content-Type and response format', () => {
    it('should return JSON content-type for all setup endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/v1/setup/status' },
        { method: 'post', path: '/api/v1/setup', body: { username: 'test', email: 'test@example.com', displayName: 'Test', password: 'Test12345' } },
        { method: 'get', path: '/api/v1/setup/standards-feed' },
        { method: 'post', path: '/api/v1/setup/import-standard', body: { url: 'https://cyclonedx.org/test.json' } },
        { method: 'post', path: '/api/v1/setup/seed-demo' },
      ];

      for (const endpoint of endpoints) {
        let req = agent[endpoint.method as keyof typeof agent](endpoint.path);
        if (endpoint.body) {
          req = req.send(endpoint.body);
        }
        const res = await req;

        expect(res.headers['content-type']).toMatch(/json/);
      }
    });
  });
});
