import { test, expect, storageStateFor } from '../../fixtures/index.js';

test.describe('Webhooks @smoke', () => {
  test.describe('as admin', () => {
    test.use({ storageState: storageStateFor('admin') });

    test('admin can open the webhooks view', async ({ page }) => {
      await page.goto('/admin/webhooks');
      await expect(page).toHaveURL(/admin\/webhooks/);
    });
  });

  test('non-admin gets 403 on /api/v1/webhooks', async ({ apiAs }) => {
    const api = await apiAs('assessor');
    const r = await api.get('/api/v1/webhooks');
    expect(r.status()).toBe(403);
  });
});
