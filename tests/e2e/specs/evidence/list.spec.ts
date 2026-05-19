import { test, expect, storageStateFor } from '../../fixtures/index.js';
import { uniqueEvidenceName } from '../../helpers/data.js';

test.describe('Evidence @smoke', () => {
  test.describe('as admin', () => {
    test.use({ storageState: storageStateFor('admin') });

    test('admin can list evidence', async ({ page }) => {
      await page.goto('/evidence');
      await expect(page).toHaveURL(/\/evidence/);
    });
  });

  test('admin can create evidence via API', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/evidence', {
      data: {
        name: uniqueEvidenceName(),
        description: 'E2E created evidence',
        state: 'in_progress',
      },
    });
    expect(r.status()).toBe(201);
  });

  test('evidence list endpoint returns pagination object', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/evidence');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.pagination).toBeTruthy();
  });
});
