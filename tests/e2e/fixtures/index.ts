import {
  test as baseTest,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  request,
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  DEMO_PASSWORD,
  demoUserForRole,
  type RoleKey,
} from '../auth/credentials.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '..', 'auth', 'storage-states');

/**
 * Returns the absolute path to the persisted storage state for a role.
 * Use this with `test.use({ storageState: storageStateFor('admin') })`
 * at the describe level so Playwright applies the state at context
 * creation time, which is the only place Set-Cookie's SameSite and
 * Secure attributes are honored consistently across Chromium, Firefox,
 * and WebKit.
 */
export function storageStateFor(role: RoleKey): string {
  return path.join(STORAGE_DIR, `${role}.json`);
}

export interface AuthFixtures {
  /**
   * Returns a fresh browser context + page authenticated as the given
   * role. Use this only when a single test needs to switch roles or
   * exercise multiple roles in sequence; prefer
   * `test.use({ storageState: storageStateFor(role) })` at the describe
   * level for everything else.
   *
   * The returned context is closed automatically at end of test.
   */
  authedAs: (role: RoleKey) => Promise<{ page: Page; context: BrowserContext }>;

  /**
   * An APIRequestContext bound to the named role's session. Use for
   * setup/teardown that does not require driving the UI. The context
   * is disposed at end of test.
   */
  apiAs: (role: RoleKey) => Promise<APIRequestContext>;
}

export const test = baseTest.extend<AuthFixtures>({
  authedAs: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (role) => {
      const ctx = await browser.newContext({
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
        storageState: storageStateFor(role),
      });
      const page = await ctx.newPage();
      contexts.push(ctx);
      return { page, context: ctx };
    });
    for (const ctx of contexts) {
      await ctx.close();
    }
  },

  apiAs: async ({}, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (role) => {
      const apiUrl = process.env.E2E_API_URL || 'http://localhost:3001';
      const ctx = await request.newContext({ baseURL: apiUrl });
      const creds =
        role === 'admin'
          ? { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }
          : {
              username: demoUserForRole(role).username,
              password: DEMO_PASSWORD,
            };

      // Retry the login on transient connection errors. PGlite is
      // single-threaded; under heavy parallelism the backend can
      // momentarily drop a connection (ECONNRESET) before accepting
      // the next one. We do not retry on 4xx/5xx HTTP responses —
      // those are real auth failures and need to surface.
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await ctx.post('/api/v1/auth/login', { data: creds });
          if (!r.ok()) {
            throw new Error(`apiAs(${role}) login failed: ${r.status()} ${await r.text()}`);
          }
          contexts.push(ctx);
          return ctx;
        } catch (err) {
          const message = String((err as { message?: string })?.message ?? err);
          // Only retry on transport-level resets / EOF / refused. Any
          // other error is forwarded immediately so we don't loop on
          // real bugs.
          if (
            attempt < 2 &&
            /ECONNRESET|ECONNREFUSED|socket hang up|EPIPE|read ECONNRESET/i.test(message)
          ) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      throw new Error(`apiAs(${role}) login failed after 3 attempts: ${String(lastErr)}`);
    });
    for (const c of contexts) {
      await c.dispose();
    }
  },
});

export { expect } from '@playwright/test';
export type { Page, Locator, BrowserContext } from '@playwright/test';
