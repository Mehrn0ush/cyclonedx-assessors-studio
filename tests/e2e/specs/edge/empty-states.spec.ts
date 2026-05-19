import { test, expect } from '../../fixtures/index.js';
import { ADMIN_PASSWORD } from '../../auth/credentials.js';

/**
 * Empty-state rendering for list views.
 *
 * Approach: provision a fresh user who has no data assigned, sign in
 * as that user, and assert each user-facing list view renders an
 * empty-state marker rather than failing to render.
 *
 * The "empty-state marker" check is intentionally loose. Different
 * list views use different copy ("No items", "Nothing here yet",
 * "Add your first ...", or the Element Plus empty image). We assert
 * that the page renders and that no rendering errors appear on the
 * console.
 */

test.describe('Empty states @regression', () => {
  test('a fresh assessor sees empty lists without crashing', async ({ apiAs, browser }, testInfo) => {
    const admin = await apiAs('admin');
    const username = `empty_${Date.now().toString(36)}`;
    const password = `${ADMIN_PASSWORD}Empty!`;

    await admin.post('/api/v1/users', {
      data: {
        username,
        email: `${username}@example.test`,
        displayName: 'Empty State User',
        password,
        role: 'assessor',
      },
    });

    const baseURL = testInfo.project.use.baseURL!;
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    // Login via the API so we get a cookie cleanly.
    await ctx.request.post('/api/v1/auth/login', { data: { username, password } });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    const routes = ['/dashboard', '/entities', '/projects', '/assessments', '/evidence', '/attestations'];
    for (const route of routes) {
      await page.goto(route, { waitUntil: 'networkidle' });
      // App shell present.
      await expect(page.locator('aside, nav, main').first()).toBeVisible({ timeout: 10_000 });
      // No console error during render.
      const blocking = consoleErrors.filter(
        (e) => !/devtools/i.test(e) && !/Download the Vue Devtools/.test(e),
      );
      expect(blocking, `console errors on ${route}: ${blocking.join('\n')}`).toEqual([]);
      consoleErrors.length = 0;
    }

    await ctx.close();
  });

  test('admin list endpoints filter to zero rows return data:[]', async ({ apiAs }) => {
    const api = await apiAs('admin');
    for (const route of [
      '/api/v1/entities?search=__no_match__',
      '/api/v1/projects?search=__no_match__',
      '/api/v1/evidence?search=__no_match__',
    ]) {
      const r = await api.get(route);
      expect(r.ok(), route).toBeTruthy();
      const body = await r.json();
      expect(body.data, route).toEqual([]);
    }
  });
});
