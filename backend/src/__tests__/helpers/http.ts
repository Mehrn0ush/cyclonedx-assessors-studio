/**
 * HTTP integration test helper.
 *
 * Bootstraps a real Express app backed by PGlite so that supertest can
 * exercise every route through the full middleware stack (auth, camelCase
 * transform, rate limiting bypass, setup gate, etc.).
 *
 * A single HTTP server is created once and shared across all test files.
 * This avoids the repeated listen/close cycle that causes "Parse Error:
 * Expected HTTP/" when supertest creates ephemeral servers per request.
 *
 * Usage:
 *   import { setupHttpTests, getAgent, loginAs, getApp } from '../helpers/http.js';
 *
 *   describe('My route', () => {
 *     setupHttpTests();                       // beforeAll / afterAll wiring
 *     it('works', async () => {
 *       const agent = await loginAs('admin'); // authenticated supertest agent
 *       const res = await agent.get('/api/v1/tags');
 *       expect(res.status).toBe(200);
 *     });
 *   });
 */

import { beforeAll, afterAll } from 'vitest';
import supertest, { SuperAgentTest } from 'supertest';
import http from 'http';
import { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let app: Express | null = null;
let server: http.Server | null = null;
let baseUrl: string = '';
let initialized = false;

// Pre-created users available for tests (populated on first init)
export const testUsers: Record<string, { id: string; username: string; email: string; password: string }> = {};

/**
 * Call inside a describe() block. Wires beforeAll to stand up the
 * Express app with a PGlite database (initializes once, reuses across files).
 */
export function setupHttpTests() {
  beforeAll(async () => {
    if (initialized) return;

    // Set environment BEFORE any app/config module is loaded
    const dbDir = path.join(__dirname, '../../../..', 'data/pglite-http-test');
    if (fs.existsSync(dbDir)) {
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
    fs.mkdirSync(dbDir, { recursive: true });

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_PROVIDER = 'pglite';
    process.env.PGLITE_DATA_DIR = dbDir;
    process.env.JWT_SECRET = 'http-test-secret-key-must-be-32-chars-min!!';
    process.env.JWT_EXPIRY = '24h';
    process.env.PORT = '3001';
    process.env.LOG_LEVEL = 'error';
    process.env.CORS_ORIGIN = '*';

    // Dynamic imports so env vars are picked up by config on first access
    const { initializeDatabase } = await import('../../db/connection.js');
    const { runMigrations } = await import('../../db/migrate.js');
    const { seedDefaultRolesAndPermissions } = await import('../../db/seed.js');
    const { createApp } = await import('../../app.js');
    const { hashPassword } = await import('../../utils/crypto.js');

    await initializeDatabase();
    await runMigrations();
    await seedDefaultRolesAndPermissions();

    app = createApp();

    // Create ONE persistent HTTP server for all tests. This avoids the
    // repeated listen/close cycle that causes "Parse Error: Expected HTTP/"
    // when supertest creates ephemeral servers per request.
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Seed test users (admin, assessor, assessee)
    const { getDatabase } = await import('../../db/connection.js');
    const db = getDatabase();

    for (const role of ['admin', 'assessor', 'assessee'] as const) {
      const userId = uuidv4();
      const username = `test_${role}`;
      const password = `Password123!`;
      const passwordHash = await hashPassword(password);

      await db.insertInto('app_user').values({
        id: userId,
        username,
        email: `${username}@test.local`,
        password_hash: passwordHash,
        display_name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
        role: role as any,
        is_active: true,
      }).execute();

      testUsers[role] = { id: userId, username, email: `${username}@test.local`, password };
    }

    // Mark setup complete so the setup gate passes
    const { markSetupComplete } = await import('../../middleware/setup.js');
    markSetupComplete();

    initialized = true;
  }, 120_000);

  // No afterAll cleanup: the database and app are shared across all HTTP
  // test files. Vitest process cleanup handles the PGlite resources.
}

/** Returns the Express app (throws if setupHttpTests hasn't run). */
export function getApp(): Express {
  if (!app) throw new Error('Call setupHttpTests() in your describe block first.');
  return app;
}

/** Returns the base URL of the persistent test server. */
export function getBaseUrl(): string {
  if (!baseUrl) throw new Error('Call setupHttpTests() in your describe block first.');
  return baseUrl;
}

/** Returns an unauthenticated supertest request builder. */
export function getAgent(): supertest.SuperTest<supertest.Test> {
  return supertest(baseUrl) as any;
}

/**
 * Returns a supertest agent that carries the session cookie for the
 * requested role. Each call logs in fresh so tests are isolated.
 */
export async function loginAs(role: 'admin' | 'assessor' | 'assessee'): Promise<SuperAgentTest> {
  const user = testUsers[role];
  if (!user) throw new Error(`No test user for role "${role}". Did setupHttpTests() run?`);

  const agent = supertest.agent(baseUrl);
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ username: user.username, password: user.password });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Login failed for ${role}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return agent;
}
