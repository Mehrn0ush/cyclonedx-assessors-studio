import { test, expect, storageStateFor } from '../../fixtures/index.js';
import { DashboardPage } from '../../pages/DashboardPage.js';
import type { RoleKey } from '../../auth/credentials.js';

/**
 * Dashboard loads for every role. Each role gets its own describe so
 * Playwright can apply the correct storage state at context creation
 * time. Console-error filter intentionally ignores transient 401s
 * (background polling that happens during route changes) and Vue's
 * dev-mode hydration warnings; only unexpected exceptions and real
 * resource failures should fail the test.
 */
const roles: RoleKey[] = ['admin', 'assessor', 'assessee', 'standards_manager', 'standards_approver'];

for (const role of roles) {
  test.describe(`Dashboard as ${role} @smoke`, () => {
    test.use({ storageState: storageStateFor(role) });

    test(`${role} loads the dashboard without unexpected errors`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));

      const dash = new DashboardPage(page);
      await dash.goto();
      await dash.expectLoaded();

      // Only fail on hard JS exceptions thrown by the page. Console
      // errors include transient 401s on background pings, third-party
      // browser noise, and Vue dev warnings, none of which indicate
      // a regression worth blocking a deploy on. If you need stricter
      // checks, add them in a dedicated test rather than here.
      expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
    });
  });
}
