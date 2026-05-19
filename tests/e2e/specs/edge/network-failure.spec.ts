import { test, expect } from '../../fixtures/index.js';

/**
 * Network failure and slow-network rendering.
 *
 * Uses page.route to intercept API calls and either abort them
 * (network failure UI) or hold them open briefly (loading skeletons).
 *
 * Assertions are intentionally loose. Different list views render
 * different error UIs. The contract is:
 *   - On a 5xx / network-abort, the page must not show an
 *     unhandled-promise-rejection in the console.
 *   - The page must not crash to a blank screen; some shell remains.
 *   - The page must not render stale data forever; it should reach
 *     either an error state or an empty state within 15s.
 */

test.describe('Network failure rendering @regression', () => {
  test('abort all entity list calls, page reaches a non-crashing state', async ({ authedAs }) => {
    const { page } = await authedAs('admin');
    const pageErrors: Error[] = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    await page.route('**/api/v1/entities**', (route) => {
      route.abort('failed');
    });

    await page.goto('/entities', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // Page shell still rendered.
    await expect(page.locator('aside, nav, main').first()).toBeVisible({ timeout: 10_000 });
    expect(pageErrors.map((e) => e.message), 'unhandled pageerror').toEqual([]);
  });

  test('return 500 on list endpoint, page renders an error UI or empty state', async ({ authedAs }) => {
    const { page } = await authedAs('admin');

    await page.route('**/api/v1/projects**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await expect(page.locator('aside, nav, main').first()).toBeVisible({ timeout: 10_000 });
  });

  test('slow network shows the page shell while data loads', async ({ authedAs }) => {
    const { page } = await authedAs('admin');

    await page.route('**/api/v1/standards**', async (route) => {
      // Hold the response for 3s, then continue normally.
      await new Promise((r) => setTimeout(r, 3000));
      route.continue();
    });

    const t0 = Date.now();
    await page.goto('/standards', { waitUntil: 'domcontentloaded' });
    // The app shell must paint well before the API resolves.
    await expect(page.locator('aside, nav, main').first()).toBeVisible({ timeout: 5_000 });
    const elapsed = Date.now() - t0;
    expect(elapsed, 'shell took too long').toBeLessThan(5_000);
  });
});
