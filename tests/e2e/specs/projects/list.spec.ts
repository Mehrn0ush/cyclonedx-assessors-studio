import { test, expect, storageStateFor } from '../../fixtures/index.js';
import { uniqueProjectName } from '../../helpers/data.js';

test.describe('Projects @smoke', () => {
  test.describe('as admin', () => {
    test.use({ storageState: storageStateFor('admin') });

    test('admin can list projects', async ({ page }) => {
      await page.goto('/projects');
      await expect(page).toHaveURL(/\/projects/);
    });
  });

  test('admin can create a project with at least one standard via API', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const standards = await api.get('/api/v1/standards').then((r) => r.json());
    expect(standards.data.length).toBeGreaterThan(0);
    const r = await api.post('/api/v1/projects', {
      data: { name: uniqueProjectName(), standardIds: [standards.data[0].id] },
    });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.id).toBeTruthy();
  });

  test('project create without standardIds returns 400', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/projects', {
      data: { name: uniqueProjectName() },
    });
    expect(r.status()).toBe(400);
  });
});
