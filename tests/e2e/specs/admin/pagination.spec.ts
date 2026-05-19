import { test, expect } from '../../fixtures/index.js';

/**
 * Cross-route pagination boundary check. The fix for issue #21 made
 * `validatePagination` produce 400 for over-limit input via the
 * asyncHandler ZodError branch. Verify the protection extends to
 * every paginated route.
 */
test.describe('Pagination guard @regression', () => {
  const paginatedRoutes = [
    '/api/v1/entities',
    '/api/v1/assessments',
    '/api/v1/evidence',
    '/api/v1/projects',
    '/api/v1/notifications',
    '/api/v1/audit',
  ];

  for (const route of paginatedRoutes) {
    test(`${route} returns 400 for limit=101`, async ({ apiAs }) => {
      const api = await apiAs('admin');
      const r = await api.get(`${route}?limit=101`);
      expect(r.status()).toBe(400);
      const body = await r.json();
      expect(body.error).toBe('Invalid input');
    });

    test(`${route} returns 400 for limit=abc`, async ({ apiAs }) => {
      const api = await apiAs('admin');
      const r = await api.get(`${route}?limit=abc`);
      expect(r.status()).toBe(400);
    });

    test(`${route} returns 200 at the limit=100 boundary`, async ({ apiAs }) => {
      const api = await apiAs('admin');
      const r = await api.get(`${route}?limit=100`);
      expect(r.ok()).toBeTruthy();
    });
  }
});
