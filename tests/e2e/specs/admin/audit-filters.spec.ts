import { test, expect } from '../../fixtures/index.js';
import { uniqueEntityName } from '../../helpers/data.js';

/**
 * Audit log filter coverage.
 *
 * Reference (backend/src/routes/audit.ts):
 *   - GET /audit accepts entityType, entityId, userId, action, from,
 *     to query params plus pagination.
 *   - GET /audit/entity/:entityType/:entityId is a convenience that
 *     scopes to one entity.
 *   - admin.audit permission required.
 */

test.describe('Audit log filters @smoke', () => {
  test('filter by entityType narrows results', async ({ apiAs }) => {
    const api = await apiAs('admin');
    // Generate an entity-creation audit event.
    await api.post('/api/v1/entities', {
      data: { name: uniqueEntityName('audit-target'), entityType: 'product' },
    });
    const r = await api.get('/api/v1/audit?entityType=entity&limit=50');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    for (const row of body.data as Array<{ entityType?: string; entity_type?: string }>) {
      const t = row.entityType ?? row.entity_type;
      expect(t).toBe('entity');
    }
  });

  test('filter by action narrows results', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/audit?action=create&limit=50');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    for (const row of body.data as Array<{ action?: string }>) {
      expect(row.action).toBe('create');
    }
  });

  test('entity-scoped audit endpoint returns rows for that entity', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/entities', {
        data: { name: uniqueEntityName('audit-scope'), entityType: 'service' },
      })
      .then((r) => r.json());

    const r = await api.get(`/api/v1/audit/entity/entity/${created.id}?limit=50`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    for (const row of body.data as Array<{ entityId?: string; entity_id?: string }>) {
      const id = row.entityId ?? row.entity_id;
      expect(id).toBe(created.id);
    }
  });

  test('audit/entity-types returns the catalog', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/audit/entity-types');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.entityTypes)).toBeTruthy();
    expect(Array.isArray(body.actions)).toBeTruthy();
  });

  test('audit list is ordered newest first', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/audit?limit=20');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    const rows = body.data as Array<{ createdAt?: string; created_at?: string }>;
    if (rows.length < 2) return; // nothing to compare
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1].createdAt ?? rows[i - 1].created_at ?? '';
      const b = rows[i].createdAt ?? rows[i].created_at ?? '';
      expect(a >= b).toBeTruthy();
    }
  });
});
