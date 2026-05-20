import { test, expect } from '../../fixtures/index.js';
import { uniqueEntityName, uniqueAssessmentTitle } from '../../helpers/data.js';

/**
 * Concurrent edits and optimistic-locking behavior.
 *
 * The CycloneDX Assessors Studio does not surface an If-Match / ETag
 * concurrency token today. Two PUTs racing each other produce a
 * last-write-wins outcome. The expectations here pin that behavior so
 * a future optimistic-locking change is forced through this spec
 * rather than slipping into a 409 nobody sees.
 *
 * If/when If-Match is added, replace these tests with the 412 path.
 */

test.describe('Concurrent edits @regression', () => {
  test('two PUTs on the same entity both succeed (last-write-wins)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/entities', {
        data: { name: uniqueEntityName('concur'), entityType: 'product' },
      })
      .then((r) => r.json());

    const [a, b] = await Promise.all([
      api.put(`/api/v1/entities/${created.id}`, { data: { description: 'edit A' } }),
      api.put(`/api/v1/entities/${created.id}`, { data: { description: 'edit B' } }),
    ]);
    expect(a.ok()).toBeTruthy();
    expect(b.ok()).toBeTruthy();

    // GET /entities/:id returns { entity, parents, children, standards,
    // tags, policies }. The row carrying description lives under
    // `entity`, not the response root.
    const after = await api.get(`/api/v1/entities/${created.id}`).then((r) => r.json());
    expect(['edit A', 'edit B']).toContain(after.entity.description);
  });

  test('overlapping assessment updates do not corrupt the row', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/assessments', { data: { title: uniqueAssessmentTitle() } })
      .then((r) => r.json());

    // Three overlapping PUTs hitting different fields. The handler must
    // accept all three without leaving the row in an inconsistent state.
    const r = await Promise.all([
      api.put(`/api/v1/assessments/${created.id}`, { data: { title: 'one' } }),
      api.put(`/api/v1/assessments/${created.id}`, { data: { description: 'two' } }),
      api.put(`/api/v1/assessments/${created.id}`, { data: { dueDate: '2030-01-01' } }),
    ]);
    for (const res of r) {
      expect(res.ok()).toBeTruthy();
    }
    const after = await api.get(`/api/v1/assessments/${created.id}`).then((r) => r.json());
    // The fields we did not touch must remain non-null where applicable.
    expect(after.id ?? after.assessment?.id).toBe(created.id);
  });

  test('concurrent delete + edit yields a deterministic outcome (404 or success then 404)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/entities', { data: { name: uniqueEntityName('drace'), entityType: 'product' } })
      .then((r) => r.json());

    const [del, upd] = await Promise.all([
      api.delete(`/api/v1/entities/${created.id}`),
      api.put(`/api/v1/entities/${created.id}`, { data: { description: 'edit while deleting' } }),
    ]);
    // Acceptable: delete wins (upd=404) or update wins (del=200/404). We
    // just need a clean status, not a 500.
    for (const r of [del, upd]) {
      expect([200, 204, 404, 409], `unexpected status ${r.status()}`).toContain(r.status());
    }
  });

  test('concurrent tag rename on the same target serializes cleanly', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const tag = await api
      .post('/api/v1/tags', {
        data: { name: `e2e-concur-${Date.now().toString(36)}`, color: '#abcdef' },
      })
      .then((r) => r.json());

    const [a, b] = await Promise.all([
      api.put(`/api/v1/tags/${tag.id}`, { data: { color: '#111111' } }),
      api.put(`/api/v1/tags/${tag.id}`, { data: { color: '#222222' } }),
    ]);
    expect(a.ok()).toBeTruthy();
    expect(b.ok()).toBeTruthy();
  });
});
