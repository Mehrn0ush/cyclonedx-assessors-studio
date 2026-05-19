import { test, expect } from '../../fixtures/index.js';

/**
 * Browser back/forward, multi-tab auth state.
 *
 * - History navigation between two routes preserves the path.
 * - Logging in within one tab makes the API accept the cookie in
 *   another newly opened tab from the same context.
 * - Logging out invalidates the cookie for all tabs in the context.
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

  test('logout in one tab invalidates auth across the context', async ({ authedAs }) => {
    const { context: ctx } = await authedAs('admin');
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

    await page2.close();
  });
});
