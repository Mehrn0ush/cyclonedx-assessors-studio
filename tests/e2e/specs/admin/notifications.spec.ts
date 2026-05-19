import { test, expect } from '../../fixtures/index.js';

test.describe('Notifications @smoke', () => {
  test('logged-in admin gets a 200 from /api/v1/notifications', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/notifications');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.pagination).toBeTruthy();
  });

  test('non-admin can also read their own notifications', async ({ apiAs }) => {
    const api = await apiAs('assessor');
    const r = await api.get('/api/v1/notifications');
    expect(r.ok()).toBeTruthy();
  });
});
