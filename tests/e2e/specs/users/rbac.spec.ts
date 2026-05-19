import { test, expect, storageStateFor } from '../../fixtures/index.js';

/**
 * RBAC matrix smoke check. Every non-admin role must be rejected from
 * /admin/user-management at the route level. Admin must reach it.
 *
 * The application uses permission-based access control via the
 * role_permission junction (see backend memory: "Permissions Only
 * Access Control"). These tests pin the user-visible outcome, not
 * the underlying permission key, so a permission rename does not
 * silently change which roles can see which page.
 */
test.describe('RBAC route guards @smoke', () => {
  test.describe('as admin', () => {
    test.use({ storageState: storageStateFor('admin') });

    test('admin can open /admin/user-management', async ({ page }) => {
      await page.goto('/admin/user-management');
      await expect(page).toHaveURL(/admin\/user-management/);
      await expect(page.getByRole('heading', { name: /user|admin/i }).first()).toBeVisible();
    });
  });

  test.describe('as assessor', () => {
    test.use({ storageState: storageStateFor('assessor') });

    test('assessor cannot open /admin/user-management', async ({ page }) => {
      await page.goto('/admin/user-management');
      await expect(page).not.toHaveURL(/admin\/user-management$/);
    });
  });

  test.describe('as assessee', () => {
    test.use({ storageState: storageStateFor('assessee') });

    test('assessee cannot open /admin/user-management', async ({ page }) => {
      await page.goto('/admin/user-management');
      await expect(page).not.toHaveURL(/admin\/user-management$/);
    });

    test('assessee cannot reach /admin/audit', async ({ page }) => {
      await page.goto('/admin/audit');
      await expect(page).not.toHaveURL(/admin\/audit$/);
    });
  });

  test('assessee cannot POST /api/v1/users (permission gate)', async ({ apiAs }) => {
    const api = await apiAs('assessee');
    const r = await api.post('/api/v1/users', {
      data: {
        username: 'should-be-forbidden',
        email: 'no@e2e.test',
        displayName: 'No',
        password: 'IgnoreMe1!',
        role: 'assessor',
      },
    });
    expect(r.status()).toBe(403);
  });
});
