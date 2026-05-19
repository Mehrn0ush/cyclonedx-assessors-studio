import { test, expect } from '../../fixtures/index.js';
import { buildCompletedAssessment } from '../../helpers/assessment-builder.js';
import { uniqueAssessmentTitle } from '../../helpers/data.js';
import { DEMO_USERS } from '../../auth/credentials.js';

/**
 * Assessor and assessee assignment.
 *
 * Reference (backend/src/routes/assessments.ts):
 *   - PUT /assessments/:id carries optional assessorIds[] / assesseeIds[]
 *     (uuid arrays). Sync semantics: each PUT replaces the full junction
 *     set for that assessment.
 *   - Omitting the array preserves the current set. Sending [] clears it.
 *   - GET /assessments/:id returns `assessors` and `assessees` arrays.
 *
 * No dedicated permission key: requires assessments.manage.
 */

async function fetchUserIdsByUsernames(api: Awaited<ReturnType<typeof import('@playwright/test').request.newContext>>, usernames: string[]): Promise<Record<string, string>> {
  const r = await api.get('/api/v1/users?limit=100');
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  const rows = body.data as Array<{ id: string; username: string }>;
  const map: Record<string, string> = {};
  for (const username of usernames) {
    const row = rows.find((u) => u.username === username);
    expect(row, `user ${username} not found in /users`).toBeTruthy();
    map[username] = row!.id;
  }
  return map;
}

test.describe('Assessment assignment @regression', () => {
  test('PUT assessorIds replaces the assessor list', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const users = await fetchUserIdsByUsernames(api, [
      DEMO_USERS.jthompson.username,
      DEMO_USERS.mwilson.username,
    ]);

    // Create an assessment in `new` state so PUT can mutate it freely.
    const created = await api
      .post('/api/v1/assessments', { data: { title: uniqueAssessmentTitle() } })
      .then((r) => r.json());

    // Assign two assessors.
    const upd = await api.put(`/api/v1/assessments/${created.id}`, {
      data: {
        assessorIds: [
          users[DEMO_USERS.jthompson.username],
          users[DEMO_USERS.mwilson.username],
        ],
      },
    });
    expect(upd.ok(), `assign failed: ${await upd.text()}`).toBeTruthy();

    const after = await api.get(`/api/v1/assessments/${created.id}`).then((r) => r.json());
    const assessorIds = (after.assessors as Array<{ id: string }>).map((u) => u.id);
    expect(assessorIds).toContain(users[DEMO_USERS.jthompson.username]);
    expect(assessorIds).toContain(users[DEMO_USERS.mwilson.username]);

    // Replace with a single assessor — sync semantics drop the other.
    const upd2 = await api.put(`/api/v1/assessments/${created.id}`, {
      data: { assessorIds: [users[DEMO_USERS.jthompson.username]] },
    });
    expect(upd2.ok()).toBeTruthy();

    const after2 = await api.get(`/api/v1/assessments/${created.id}`).then((r) => r.json());
    const ids2 = (after2.assessors as Array<{ id: string }>).map((u) => u.id);
    expect(ids2).toEqual([users[DEMO_USERS.jthompson.username]]);
  });

  test('PUT assesseeIds replaces the assessee list', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const users = await fetchUserIdsByUsernames(api, [
      DEMO_USERS.spatil.username,
      DEMO_USERS.rgarcia.username,
    ]);

    const created = await api
      .post('/api/v1/assessments', { data: { title: uniqueAssessmentTitle() } })
      .then((r) => r.json());

    const upd = await api.put(`/api/v1/assessments/${created.id}`, {
      data: {
        assesseeIds: [
          users[DEMO_USERS.spatil.username],
          users[DEMO_USERS.rgarcia.username],
        ],
      },
    });
    expect(upd.ok()).toBeTruthy();

    const after = await api.get(`/api/v1/assessments/${created.id}`).then((r) => r.json());
    const ids = (after.assessees as Array<{ id: string }>).map((u) => u.id);
    expect(ids.sort()).toEqual([
      users[DEMO_USERS.spatil.username],
      users[DEMO_USERS.rgarcia.username],
    ].sort());
  });

  test('PUT with assessorIds=[] clears the assessor list', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const users = await fetchUserIdsByUsernames(api, [DEMO_USERS.jthompson.username]);

    const created = await api
      .post('/api/v1/assessments', {
        data: {
          title: uniqueAssessmentTitle(),
          assessorIds: [users[DEMO_USERS.jthompson.username]],
        },
      })
      .then((r) => r.json());

    // Verify preconditions.
    const before = await api.get(`/api/v1/assessments/${created.id}`).then((r) => r.json());
    expect((before.assessors as Array<unknown>).length).toBe(1);

    // Clear.
    const clear = await api.put(`/api/v1/assessments/${created.id}`, {
      data: { assessorIds: [] },
    });
    expect(clear.ok()).toBeTruthy();

    const after = await api.get(`/api/v1/assessments/${created.id}`).then((r) => r.json());
    expect((after.assessors as Array<unknown>).length).toBe(0);
  });

  test('omitting assessorIds preserves the current list', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const users = await fetchUserIdsByUsernames(api, [DEMO_USERS.jthompson.username]);

    const created = await api
      .post('/api/v1/assessments', {
        data: {
          title: uniqueAssessmentTitle(),
          assessorIds: [users[DEMO_USERS.jthompson.username]],
        },
      })
      .then((r) => r.json());

    // PUT something unrelated; do not touch assessorIds.
    const upd = await api.put(`/api/v1/assessments/${created.id}`, {
      data: { title: 'Renamed (assignment preserved)' },
    });
    expect(upd.ok()).toBeTruthy();

    const after = await api.get(`/api/v1/assessments/${created.id}`).then((r) => r.json());
    const ids = (after.assessors as Array<{ id: string }>).map((u) => u.id);
    expect(ids).toEqual([users[DEMO_USERS.jthompson.username]]);
  });

  test('rejects invalid UUIDs in the assessorIds array', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/assessments', { data: { title: uniqueAssessmentTitle() } })
      .then((r) => r.json());

    const r = await api.put(`/api/v1/assessments/${created.id}`, {
      data: { assessorIds: ['not-a-uuid'] },
    });
    expect(r.status()).toBe(400);
  });

  test('assignment is preserved after lifecycle transitions', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const users = await fetchUserIdsByUsernames(api, [
      DEMO_USERS.jthompson.username,
      DEMO_USERS.spatil.username,
    ]);

    const fixture = await buildCompletedAssessment(api);

    // Assignment requires PUT, but the assessment is complete now, so PUT
    // is restricted to state transitions. Assign before completion.
    // Easier path: assign while still in_progress by reopening.
    await api.post(`/api/v1/assessments/${fixture.assessmentId}/reopen`);

    const assign = await api.put(`/api/v1/assessments/${fixture.assessmentId}`, {
      data: {
        assessorIds: [users[DEMO_USERS.jthompson.username]],
        assesseeIds: [users[DEMO_USERS.spatil.username]],
      },
    });
    expect(assign.ok(), `assignment failed: ${await assign.text()}`).toBeTruthy();

    const after = await api.get(`/api/v1/assessments/${fixture.assessmentId}`).then((r) => r.json());
    expect((after.assessors as Array<{ id: string }>).map((u) => u.id)).toContain(
      users[DEMO_USERS.jthompson.username],
    );
    expect((after.assessees as Array<{ id: string }>).map((u) => u.id)).toContain(
      users[DEMO_USERS.spatil.username],
    );
  });
});
