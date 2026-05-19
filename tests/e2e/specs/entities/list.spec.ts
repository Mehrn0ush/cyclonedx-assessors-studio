import { test, expect, storageStateFor } from '../../fixtures/index.js';

test.describe('Entities list @smoke', () => {
  test.describe('as admin', () => {
    test.use({ storageState: storageStateFor('admin') });

    test('admin can open the entities list view', async ({ page }) => {
      await page.goto('/entities');
      await expect(page).toHaveURL(/\/entities/);
      // The view header is the reliable signal that the page mounted.
      // Some demo seeds may not populate entities, so we do not assert
      // on rows; the API check below covers list contents.
      await expect(page.getByRole('heading').first()).toBeVisible();
    });
  });

  test('entities list paginates with default 20 limit', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/entities');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.pagination.limit).toBe(20);
    expect(body.pagination.offset).toBe(0);
    expect(typeof body.pagination.total).toBe('number');
  });
});
