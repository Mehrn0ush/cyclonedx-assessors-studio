import { test, expect } from '../../fixtures/index.js';

/**
 * API-level contract checks for the auth and pagination surfaces. The
 * UI-level coverage lives in the matching specs; these tests pin the
 * raw HTTP behavior that the fixes for issues #19, #20, and #21
 * established, so a UI rewrite cannot quietly regress the wire format.
 */
test.describe('API contracts @regression', () => {
  test('GET /api/v1/entities?limit=101 returns 400 with details (issue #21)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/entities?limit=101');
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.error).toBe('Invalid input');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.some((d: { path: (string | number)[] }) => d.path.includes('limit'))).toBe(
      true,
    );
  });

  test('GET /api/v1/entities?limit=100 returns 200 at the boundary (issue #21)', async ({
    apiAs,
  }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/entities?limit=100');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.pagination.limit).toBe(100);
  });

  test('GET /api/v1/assessments?limit=abc returns 400 (issue #21 family)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/assessments?limit=abc');
    expect(r.status()).toBe(400);
  });

  test('POST /api/v1/assessments/:id/start with no body returns 200 (issue #19)', async ({
    apiAs,
  }) => {
    const api = await apiAs('admin');
    // Build a project+standard+assessment scaffold via the API so the
    // assessment has a valid standard linkage and start can derive
    // requirements. The standards list is non-empty after demo seed.
    const standards = await api.get('/api/v1/standards').then((r) => r.json());
    expect(standards.data.length).toBeGreaterThan(0);
    const standardId = standards.data[0].id;

    const project = await api
      .post('/api/v1/projects', {
        data: { name: `E2E api-contract project ${Date.now()}`, standardIds: [standardId] },
      })
      .then((r) => r.json());

    const assessment = await api
      .post('/api/v1/assessments', {
        data: {
          title: `E2E api-contract assessment ${Date.now()}`,
          projectId: project.id,
          standardId,
        },
      })
      .then((r) => r.json());

    // The exact failure mode the issue title described: POST with no
    // body and no Content-Type. Playwright's request.post without
    // `data` omits both.
    const start = await api.post(`/api/v1/assessments/${assessment.id}/start`);
    expect(start.status()).toBe(200);
  });

  test('POST /api/v1/assessments with standardIds: [uuid] persists (issue #19 underlying)', async ({
    apiAs,
  }) => {
    const api = await apiAs('admin');
    const standards = await api.get('/api/v1/standards').then((r) => r.json());
    const standardId = standards.data[0].id;

    const created = await api
      .post('/api/v1/assessments', {
        data: { title: `E2E alias ${Date.now()}`, standardIds: [standardId] },
      })
      .then((r) => r.json());

    const fetched = await api.get(`/api/v1/assessments/${created.id}`).then((r) => r.json());
    expect(fetched.assessment.standardId).toBe(standardId);
  });

  test('POST /api/v1/assessments with standardIds length 2 returns 400 (issue #19)', async ({
    apiAs,
  }) => {
    const api = await apiAs('admin');
    const standards = await api.get('/api/v1/standards').then((r) => r.json());
    if (standards.data.length < 2) {
      test.skip(true, 'Demo seed has < 2 standards; cannot exercise the multi-standard rejection');
    }
    const r = await api.post('/api/v1/assessments', {
      data: {
        title: `E2E too many ${Date.now()}`,
        standardIds: [standards.data[0].id, standards.data[1].id],
      },
    });
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.details.some((d: { path: (string | number)[] }) => d.path.includes('standardIds'))).toBe(
      true,
    );
  });
});
