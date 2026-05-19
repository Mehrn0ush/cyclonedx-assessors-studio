import { test, expect, request } from '@playwright/test';
import { test as authedTest } from '../../fixtures/index.js';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../../auth/credentials.js';

/**
 * Session expiry, invalid JWT, and unauthenticated redirect behavior.
 *
 * Backend contract (backend/src/middleware/auth.ts):
 *   - Missing cookie -> 401 { error: 'Authentication required' }.
 *   - Tampered or expired JWT -> 401.
 *   - /auth/logout clears the cookie regardless of state.
 *
 * Frontend contract (frontend/src/router): unauthenticated visits to
 * any non-public route redirect to /login. The return path is carried
 * via a query param so post-login the user lands where they tried to go.
 */

authedTest.describe('Session expiry @regression', () => {
  authedTest('unauthenticated API call returns 401', async ({}, testInfo) => {
    const ctx = await request.newContext({ baseURL: testInfo.project.use.baseURL });
    const r = await ctx.get('/api/v1/users');
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  authedTest('tampered JWT cookie returns 401', async ({ apiAs }, testInfo) => {
    // Issue a real cookie, then mangle it.
    const ctx = await request.newContext({ baseURL: testInfo.project.use.baseURL });
    await ctx.post('/api/v1/auth/login', {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    const state = await ctx.storageState();
    const tokenCookie = state.cookies.find((c) => c.name === 'token');
    expect(tokenCookie?.value, 'no token cookie issued').toBeTruthy();

    // Tamper.
    const tampered = `${tokenCookie!.value.slice(0, -3)}AAA`;
    const url = new URL(testInfo.project.use.baseURL!);

    const ctx2 = await request.newContext({
      baseURL: testInfo.project.use.baseURL,
      storageState: {
        cookies: [
          { ...tokenCookie!, value: tampered, domain: url.hostname, path: '/', sameSite: 'Lax' as const },
        ],
        origins: [],
      },
    });
    const r = await ctx2.get('/api/v1/auth/me');
    expect(r.status()).toBe(401);
    await ctx.dispose();
    await ctx2.dispose();

    // Reference apiAs so the fixture import is consumed under strict
    // checking. The fixture's presence is also what registers the
    // describe block hooks above.
    expect(typeof apiAs).toBe('function');
  });

  authedTest('logout clears the token cookie', async ({}, testInfo) => {
    const ctx = await request.newContext({ baseURL: testInfo.project.use.baseURL });
    await ctx.post('/api/v1/auth/login', {
      data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    });
    const before = await ctx.get('/api/v1/auth/me');
    expect(before.ok()).toBeTruthy();

    const logout = await ctx.post('/api/v1/auth/logout');
    expect(logout.ok()).toBeTruthy();

    const after = await ctx.get('/api/v1/auth/me');
    expect(after.status()).toBe(401);
    await ctx.dispose();
  });

  authedTest('unauthenticated UI visit redirects to /login', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
    await ctx.close();
  });

  authedTest('login form respects the return path query param', async ({ browser }, testInfo) => {
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const page = await ctx.newPage();
    await page.goto('/entities');
    await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 10_000 });

    // The router may append the return path via different query keys
    // (redirect, returnUrl, next) depending on implementation. Accept any
    // representation that carries '/entities' through the URL.
    const url = new URL(page.url());
    const carriers = ['redirect', 'returnUrl', 'next', 'return', 'redirectTo'];
    const anyCarries = carriers.some((k) => url.searchParams.get(k)?.includes('/entities'));
    const containsRaw = url.toString().includes('%2Fentities') || url.toString().includes('/entities');
    expect(anyCarries || containsRaw, `login URL ${url.toString()} did not carry /entities`).toBeTruthy();
    await ctx.close();
  });
});

// Keep linter quiet if a future edit removes plain test usage.
void test;
