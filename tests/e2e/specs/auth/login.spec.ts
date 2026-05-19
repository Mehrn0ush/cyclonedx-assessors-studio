import { test, expect } from '../../fixtures/index.js';
import { LoginPage } from '../../pages/LoginPage.js';
import { ADMIN_PASSWORD, ADMIN_USERNAME, DEMO_PASSWORD, DEMO_USERS } from '../../auth/credentials.js';
import { uniqueUsername } from '../../helpers/data.js';

/**
 * Auth surface coverage.
 *
 * These tests deliberately run with the default (unauthenticated)
 * storage state and drive the login form directly. The rest of the
 * suite reads role-specific storage states applied via
 * `test.use({ storageState })`. Do not mix the two patterns in a
 * single spec.
 */

test.describe('Authentication @smoke', () => {
  test('admin can log in with valid credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);
    await login.expectLoggedIn();
  });

  test('demo assessor can log in with the seeded password', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(DEMO_USERS.jthompson.username, DEMO_PASSWORD);
    await login.expectLoggedIn();
  });

  test('demo standards_manager can log in (issue #20 ancillary)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(DEMO_USERS.lkumar.username, DEMO_PASSWORD);
    await login.expectLoggedIn();
  });

  test('demo standards_approver can log in (issue #20 ancillary)', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(DEMO_USERS.dokafor.username, DEMO_PASSWORD);
    await login.expectLoggedIn();
  });

  test('unknown username produces an auth error and stays on /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(uniqueUsername('bogus'), 'doesNotMatter1!');
    await login.expectStillOnLoginWithError();
  });

  test('wrong password produces an auth error and stays on /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, 'definitely-wrong-password-1!');
    await login.expectStillOnLoginWithError();
  });

  test('unauthenticated access to a private route redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout clears the session and returns to /login', async ({ page }) => {
    // Drive through the UI: log in fresh, then call logout via the
    // same browser context so the session cookie attaches.
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN_USERNAME, ADMIN_PASSWORD);
    await login.expectLoggedIn();

    const r = await page.request.post('/api/v1/auth/logout');
    expect([200, 204]).toContain(r.status());

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
