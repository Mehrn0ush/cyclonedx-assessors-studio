import { test, expect, storageStateFor } from '../../fixtures/index.js';

test.describe('Standards @smoke', () => {
  test.describe('as admin', () => {
    test.use({ storageState: storageStateFor('admin') });

    test('admin can list standards', async ({ page }) => {
      await page.goto('/standards');
      await expect(page).toHaveURL(/\/standards/);
    });
  });

  test('standards API returns at least one standard after global-setup', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/standards');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.data.length).toBeGreaterThan(0);
  });

  test.describe('as standards_manager', () => {
    test.use({ storageState: storageStateFor('standards_manager') });

    test('standards_manager can reach /standards', async ({ page }) => {
      await page.goto('/standards');
      await expect(page).toHaveURL(/\/standards/);
    });
  });
});
