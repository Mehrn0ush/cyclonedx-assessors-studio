import { test, expect } from '../../fixtures/index.js';
import { uniqueEntityName } from '../../helpers/data.js';

/**
 * Large-data pagination smoke.
 *
 * Creates more rows than a single page worth and asserts that
 * pagination produces consistent, non-overlapping results across
 * pages. This catches off-by-one errors in offset/limit math and
 * silent re-ordering between requests.
 *
 * Marker prefix is used to filter only this run's rows so other tests
 * in the same suite do not throw off the math.
 */

test.describe('Large data pagination @regression', () => {
  test('paginating 105 entities yields disjoint pages with the same total', async ({ apiAs }) => {
    test.setTimeout(120_000);

    const api = await apiAs('admin');
    const marker = `pgsmoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    // Create 105 entities with names that share the marker. Sequential
    // so the backend processes them in a single connection and we
    // don't slam PGlite with 105 concurrent inserts.
    const ids: string[] = [];
    for (let i = 0; i < 105; i++) {
      const r = await api.post('/api/v1/entities', {
        data: {
          name: uniqueEntityName(`${marker}-${i}`),
          entityType: 'product',
          description: `Pagination smoke #${i}`,
        },
      });
      const body = await r.json();
      expect(body.id, `entity ${i} missing id`).toBeTruthy();
      ids.push(body.id);
    }
    expect(ids.length).toBe(105);

    // Page 1: 50 newest matching rows.
    const p1 = await api
      .get(`/api/v1/entities?limit=50&offset=0&search=${encodeURIComponent(marker)}`)
      .then((r) => r.json());
    const p2 = await api
      .get(`/api/v1/entities?limit=50&offset=50&search=${encodeURIComponent(marker)}`)
      .then((r) => r.json());
    const p3 = await api
      .get(`/api/v1/entities?limit=50&offset=100&search=${encodeURIComponent(marker)}`)
      .then((r) => r.json());

    const pageIds = [
      ...(p1.data as Array<{ id: string }>).map((r) => r.id),
      ...(p2.data as Array<{ id: string }>).map((r) => r.id),
      ...(p3.data as Array<{ id: string }>).map((r) => r.id),
    ];

    // Each ID should appear exactly once across the three pages.
    const unique = new Set(pageIds);
    expect(unique.size).toBe(pageIds.length);

    // All 105 created IDs should be retrievable through pagination.
    for (const id of ids) {
      expect(unique.has(id), `id ${id} missing from paged results`).toBeTruthy();
    }

    // Pagination metadata, when present, should report the expected total.
    if (p1.pagination?.total !== undefined) {
      expect(p1.pagination.total).toBeGreaterThanOrEqual(105);
    }
  });

  test('reading the same offset twice yields the same rows in the same order', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const a = await api.get('/api/v1/entities?limit=20&offset=0').then((r) => r.json());
    const b = await api.get('/api/v1/entities?limit=20&offset=0').then((r) => r.json());
    const aIds = (a.data as Array<{ id: string }>).map((r) => r.id);
    const bIds = (b.data as Array<{ id: string }>).map((r) => r.id);
    expect(bIds).toEqual(aIds);
  });
});
