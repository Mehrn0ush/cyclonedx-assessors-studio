import { test, expect } from '../../fixtures/index.js';
import { buildCompletedAssessment } from '../../helpers/assessment-builder.js';

/**
 * Assessment archive and reopen state transitions.
 *
 * Reference (backend/src/routes/assessments.ts):
 *   - POST /:id/archive: requires state=complete. 409 if already
 *     archived or not yet complete.
 *   - POST /:id/reopen: requires state=complete. Returns to in_progress.
 *     Archived assessments cannot be reopened (403).
 *   - Once complete, PUT can only carry state transitions to in_progress
 *     or archived. Any other field mutation returns 403.
 *   - Once archived, every mutation route returns 403.
 *   - Permission: assessments.manage.
 */

test.describe('Assessment archive and reopen @regression', () => {
  test('admin can archive a completed assessment', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const { assessmentId } = await buildCompletedAssessment(api);

    const archive = await api.post(`/api/v1/assessments/${assessmentId}/archive`);
    expect(archive.ok(), `archive failed: ${await archive.text()}`).toBeTruthy();

    // GET /assessments/:id returns { assessment, requirements, assessors,
    // assessees }. The row carrying state lives under `assessment`,
    // not at the top level.
    const after = await api.get(`/api/v1/assessments/${assessmentId}`).then((r) => r.json());
    expect(after.assessment.state).toBe('archived');
  });

  test('cannot archive an assessment that is not complete', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const { assessmentId } = await buildCompletedAssessment(api, { complete: false });

    const r = await api.post(`/api/v1/assessments/${assessmentId}/archive`);
    expect(r.status()).toBe(409);
  });

  test('archiving an already archived assessment returns 409', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const { assessmentId } = await buildCompletedAssessment(api);

    expect((await api.post(`/api/v1/assessments/${assessmentId}/archive`)).ok()).toBeTruthy();
    const r2 = await api.post(`/api/v1/assessments/${assessmentId}/archive`);
    expect(r2.status()).toBe(409);
  });

  test('admin can reopen a completed assessment back to in_progress', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const { assessmentId } = await buildCompletedAssessment(api);

    const reopen = await api.post(`/api/v1/assessments/${assessmentId}/reopen`);
    expect(reopen.ok()).toBeTruthy();

    const after = await api.get(`/api/v1/assessments/${assessmentId}`).then((r) => r.json());
    expect(after.assessment.state).toBe('in_progress');
  });

  test('cannot reopen an archived assessment', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const { assessmentId } = await buildCompletedAssessment(api);
    await api.post(`/api/v1/assessments/${assessmentId}/archive`);

    const r = await api.post(`/api/v1/assessments/${assessmentId}/reopen`);
    expect(r.status()).toBe(403);
  });

  test('cannot reopen an assessment that was never completed', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const { assessmentId } = await buildCompletedAssessment(api, { complete: false });

    const r = await api.post(`/api/v1/assessments/${assessmentId}/reopen`);
    expect(r.status()).toBe(409);
  });

  test('archived assessment rejects PUT mutations (403)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const { assessmentId } = await buildCompletedAssessment(api);
    await api.post(`/api/v1/assessments/${assessmentId}/archive`);

    const r = await api.put(`/api/v1/assessments/${assessmentId}`, {
      data: { title: 'Should not work' },
    });
    expect(r.status()).toBe(403);
  });

  test('completed assessment rejects field mutations other than state', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const { assessmentId } = await buildCompletedAssessment(api);

    const r = await api.put(`/api/v1/assessments/${assessmentId}`, {
      data: { title: 'Renamed after complete' },
    });
    expect(r.status()).toBe(403);
  });
});
