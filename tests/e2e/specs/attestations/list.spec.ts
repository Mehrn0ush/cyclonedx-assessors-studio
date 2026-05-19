import { test, expect, storageStateFor } from '../../fixtures/index.js';

test.describe('Attestations @smoke', () => {
  test.use({ storageState: storageStateFor('admin') });

  test('admin can open the attestations view', async ({ page }) => {
    await page.goto('/attestations');
    await expect(page).toHaveURL(/\/attestations/);
  });
});
