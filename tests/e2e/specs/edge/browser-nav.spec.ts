import { test, expect } from '../../fixtures/index.js';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../../auth/credentials.js';

/**
 * Browser back/forward, multi-tab auth state.
 *
 * - History navigation between two routes preserves the path.
 * - Logging in within one tab makes the API accept the cookie in
 *   another newly opened tab from the same context.
 * - Logging out invalidates the cookie for all tabs in the context.
 *
 * The logout test deliberately drives a *fresh* login rather than
 * reusing the shared admin storage state. The admin storage state is
 * captured once in global-setup and reused by dozens of specs; calling
 * /auth/logout against its session id would delete the row that all
 * those specs rely on, and every subsequent admin-storage-state test
 * would 401 on /auth/me and redirect to /login.
 */

test.describe('Browser navigation @regression', () => {
  test('back/forward preserves the route', async ({ authedAs }) => {
    const { page } = await authedAs('admin');

    await page.goto('/entities', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/entities/);

    await page.goto('/projects', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/projects/);

    await page.goBack();
    await expect(page).toHaveURL(/\/entities/);

    await page.goForward();
    await expect(page).toHaveURL(/\/projects/);
  });

  test('query string survives a back/forward round trip', async ({ authedAs }) => {
    const { page } = await authedAs('admin');

    await page.goto('/entities?entity_type=service', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/entity_type=service/);

    await page.goto('/projects', { waitUntil: 'networkidle' });
    await page.goBack();

    // The query param survives the back-nav.
    await expect(page).toHaveURL(/entity_type=service/);
  });

  test('a second tab in the same context inherits the auth cookie', async ({ authedAs }) => {
    const { page, context: ctx } = await authedAs('admin');

    // First tab: confirm auth works.
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const me1 = await ctx.request.get('/api/v1/auth/me');
    expect(me1.ok()).toBeTruthy();

    // Second tab in the same context: same cookie, auth must work.
    const page2 = await ctx.newPage();
    await page2.goto('/dashboard', { waitUntil: 'networkidle' });
    const me2 = await ctx.request.get('/api/v1/auth/me');
    expect(me2.ok()).toBeTruthy();

    await page2.close();
  });

  test('logout in one tab invalidates auth across the context', async ({ browser }, testInfo) => {
    // Use a brand-new context (no storage state) and drive a fresh
    // login through the UI. Logging this session out then exercises
    // the cross-tab invalidation behavior without touching the shared
    // admin storage state's session id (which is reused across the
    // whole suite — invalidating it cascades into 60+ false failures).
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(ADMIN_USERNAME);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 15_000 });

    const me0 = await ctx.request.get('/api/v1/auth/me');
    expect(me0.ok(), 'fresh login should authenticate /auth/me').toBeTruthy();

    const page2 = await ctx.newPage();
    await page2.goto('/dashboard', { waitUntil: 'networkidle' });

    // Log out via the API (the UI logout would do the same thing).
    await ctx.request.post('/api/v1/auth/logout');

    // Both tabs lose their session.
    const me1 = await ctx.request.get('/api/v1/auth/me');
    expect(me1.status()).toBe(401);

    // Trying to load a protected route in tab 2 now redirects to login.
    await page2.goto('/entities');
    await page2.waitForURL((url: URL) => url.pathname.startsWith('/login'), { timeout: 10_000 });
    expect(page2.url()).toMatch(/\/login/);

    await ctx.close();
  });
});
