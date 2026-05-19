import { test, expect, storageStateFor } from '../../fixtures/index.js';

test.describe('Audit log @smoke', () => {
  test.describe('as admin', () => {
    test.use({ storageState: storageStateFor('admin') });

    test('admin can open the audit view', async ({ page }) => {
      await page.goto('/admin/audit');
      await expect(page).toHaveURL(/admin\/audit/);
    });
  });

  test('audit list returns 200 with pagination metadata', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/audit');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.pagination).toBeTruthy();
  });

  test('non-admin role gets 403 on /api/v1/audit', async ({ apiAs }) => {
    const api = await apiAs('assessor');
    const r = await api.get('/api/v1/audit');
    expect(r.status()).toBe(403);
  });
});
