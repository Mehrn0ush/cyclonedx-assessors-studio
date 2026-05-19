import { test, expect } from '../../fixtures/index.js';

/**
 * Admin tags CRUD.
 *
 * Reference (backend/src/routes/tags.ts):
 *   - Tag = { name (unique), color }.
 *   - Names are normalized (trimmed, lowercased) before insert.
 *   - Duplicate name → 409 on both create and update.
 *   - DELETE is idempotent: 204 whether the row existed or not.
 *
 * Permission: admin.tags — admin only.
 */

function uniqueTagName(): string {
  return `e2e-tag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Admin tags CRUD @regression', () => {
  test('admin can create a tag with a color', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const name = uniqueTagName();
    const r = await api.post('/api/v1/tags', { data: { name, color: '#ff0000' } });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.name).toBe(name);
    expect(body.color).toBe('#ff0000');
  });

  test('admin can edit a tag color', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const name = uniqueTagName();
    const created = await api.post('/api/v1/tags', { data: { name, color: '#ff0000' } }).then((r) => r.json());
    const upd = await api.put(`/api/v1/tags/${created.id}`, { data: { color: '#00ff00' } });
    expect(upd.ok()).toBeTruthy();
    const after = await upd.json();
    expect(after.color).toBe('#00ff00');
  });

  test('creating a duplicate tag name returns 409', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const name = uniqueTagName();
    await api.post('/api/v1/tags', { data: { name, color: '#ffffff' } });
    const dup = await api.post('/api/v1/tags', { data: { name, color: '#000000' } });
    expect(dup.status()).toBe(409);
  });

  test('admin can delete a tag (204)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/tags', { data: { name: uniqueTagName(), color: '#abcdef' } })
      .then((r) => r.json());
    const del = await api.delete(`/api/v1/tags/${created.id}`);
    expect(del.status()).toBe(204);
  });

  test('deleting a non-existent tag returns 204 (idempotent)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.delete('/api/v1/tags/00000000-0000-0000-0000-000000000000');
    expect(r.status()).toBe(204);
  });

  test('autocomplete returns matches', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const prefix = `e2e-auto-${Date.now().toString(36)}`;
    await api.post('/api/v1/tags', { data: { name: `${prefix}-alpha`, color: '#111111' } });
    const r = await api.get(`/api/v1/tags/autocomplete?q=${prefix}`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect((body.data as Array<{ name: string }>).some((t) => t.name.startsWith(prefix))).toBeTruthy();
  });

  test.describe('RBAC', () => {
    test('all roles can read the tag list', async ({ apiAs }) => {
      for (const role of ['admin', 'assessor', 'assessee', 'standards_manager', 'standards_approver'] as const) {
        const api = await apiAs(role);
        const r = await api.get('/api/v1/tags');
        expect(r.ok(), `${role} could not read /tags`).toBeTruthy();
      }
    });

    test('non-admin cannot create a tag', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.post('/api/v1/tags', { data: { name: uniqueTagName(), color: '#ffffff' } });
      expect(r.status()).toBe(403);
    });

    test('non-admin cannot delete a tag', async ({ apiAs }) => {
      const adminApi = await apiAs('admin');
      const created = await adminApi
        .post('/api/v1/tags', { data: { name: uniqueTagName(), color: '#ffffff' } })
        .then((r) => r.json());

      const assessorApi = await apiAs('assessor');
      const r = await assessorApi.delete(`/api/v1/tags/${created.id}`);
      expect(r.status()).toBe(403);
    });
  });
});
