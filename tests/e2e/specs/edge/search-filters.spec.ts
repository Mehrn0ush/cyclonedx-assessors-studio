import { test, expect } from '../../fixtures/index.js';
import { uniqueEntityName } from '../../helpers/data.js';

/**
 * Search and filter combinations on list endpoints.
 *
 * Most list routes accept:
 *   - search: ILIKE on name / description
 *   - state: state filter (entities, evidence, assessments)
 *   - entity_type / entityType: type filter
 *   - tag: tag-based filter (where supported)
 *
 * We assert behaviorally, not exhaustively: the search hit appears
 * and unrelated rows do not.
 */

test.describe('List search and filters @regression', () => {
  test('entities search returns the matching row, no others', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const marker = `sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await api.post('/api/v1/entities', {
      data: { name: uniqueEntityName(marker), entityType: 'product' },
    });

    const r = await api.get(`/api/v1/entities?search=${encodeURIComponent(marker)}`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    const rows = body.data as Array<{ name: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.name.toLowerCase()).toContain(marker.toLowerCase());
    }
  });

  test('entities entity_type filter narrows to one type', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const marker = `sftype-${Date.now().toString(36)}`;
    await api.post('/api/v1/entities', {
      data: { name: uniqueEntityName(`${marker}-svc`), entityType: 'service' },
    });
    await api.post('/api/v1/entities', {
      data: { name: uniqueEntityName(`${marker}-prod`), entityType: 'product' },
    });

    const r = await api.get(`/api/v1/entities?entity_type=service&search=${encodeURIComponent(marker)}`);
    expect(r.ok()).toBeTruthy();
    const rows = (await r.json()).data as Array<{ entityType?: string; entity_type?: string }>;
    for (const row of rows) {
      expect(row.entityType ?? row.entity_type).toBe('service');
    }
  });

  test('combined search + state filter respects both predicates', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const marker = `sfcomb-${Date.now().toString(36)}`;
    const created = await api
      .post('/api/v1/entities', {
        data: { name: uniqueEntityName(marker), entityType: 'product' },
      })
      .then((r) => r.json());

    // Archive the row.
    await api.put(`/api/v1/entities/${created.id}`, { data: { state: 'archived' } });

    // Default list (no state filter) hides archived.
    const live = await api.get(`/api/v1/entities?search=${encodeURIComponent(marker)}`).then((r) => r.json());
    expect((live.data as Array<unknown>).length).toBe(0);

    // Explicit archived filter returns it.
    const archived = await api
      .get(`/api/v1/entities?search=${encodeURIComponent(marker)}&state=archived`)
      .then((r) => r.json());
    expect((archived.data as Array<{ id: string }>).some((r) => r.id === created.id)).toBeTruthy();
  });

  test('assessments state filter narrows correctly', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/assessments?state=new&limit=50');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    for (const row of body.data as Array<{ state: string }>) {
      expect(row.state).toBe('new');
    }
  });

  test('evidence state filter narrows correctly', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/evidence?state=in_progress&limit=50');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    for (const row of body.data as Array<{ state: string }>) {
      expect(row.state).toBe('in_progress');
    }
  });

  test('search with no matches returns an empty data array, not 404', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/entities?search=__definitely_no_such_row__');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.data).toEqual([]);
  });

  test('case-insensitive search matches mixed case', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const marker = `MixedCase-${Date.now().toString(36)}`;
    await api.post('/api/v1/entities', {
      data: { name: marker, entityType: 'product' },
    });
    const r = await api.get(`/api/v1/entities?search=${encodeURIComponent(marker.toLowerCase())}`);
    expect(r.ok()).toBeTruthy();
    const rows = (await r.json()).data as Array<unknown>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
