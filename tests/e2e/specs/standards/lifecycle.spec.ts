import { test, expect, storageStateFor } from '../../fixtures/index.js';
import type { APIRequestContext } from '@playwright/test';
import { StandardsPage } from '../../pages/StandardsPage.js';
import { uniqueStandardIdentifier } from '../../helpers/data.js';

/**
 * Standards lifecycle coverage.
 *
 * State machine (see backend/src/routes/standards.ts):
 *   draft       → submit  → in_review
 *   in_review   → approve → published
 *   in_review   → reject  → draft
 *   published   → retire  → retired
 *   any state   → duplicate → new draft
 *
 * Permission matrix (see backend/src/db/seed.ts):
 *   standards_manager   : view, create, edit, submit, duplicate, requirements.edit
 *   standards_approver  : view, approve  (gate for approve / reject / retire)
 *   admin               : all
 *   assessor / assessee : view only
 *
 * Tests below pin both the state machine guards and the RBAC
 * matrix. State transitions are exercised via the API because
 * driving each through the UI multiplies locator flake risk
 * without adding product coverage — the buttons are thin wrappers
 * over the same endpoints.
 */

interface Standard {
  id: string;
  state: 'draft' | 'in_review' | 'published' | 'retired';
  name: string;
  identifier: string;
}

async function createDraft(
  api: APIRequestContext,
  overrides: Partial<{ identifier: string; name: string; version: string }> = {},
): Promise<Standard> {
  const identifier = overrides.identifier ?? uniqueStandardIdentifier();
  const r = await api.post('/api/v1/standards', {
    data: {
      identifier,
      name: overrides.name ?? `E2E Standard ${identifier}`,
      version: overrides.version ?? '1.0.0',
    },
  });
  expect(r.status(), `create draft failed: ${await r.text()}`).toBe(201);
  return (await r.json()) as Standard;
}

async function fetchState(api: APIRequestContext, id: string): Promise<string> {
  const r = await api.get(`/api/v1/standards/${id}`);
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  return (body.standard?.state ?? body.state) as string;
}

test.describe('Standards lifecycle @regression', () => {
  test.describe('happy path through the state machine', () => {
    test('standards_manager creates a draft via the API', async ({ apiAs }) => {
      const api = await apiAs('standards_manager');
      const draft = await createDraft(api);
      expect(draft.state).toBe('draft');
    });

    test('standards_manager can edit a draft they created', async ({ apiAs }) => {
      const api = await apiAs('standards_manager');
      const draft = await createDraft(api);
      const r = await api.put(`/api/v1/standards/${draft.id}`, {
        data: { name: `${draft.name} (edited)`, description: 'Edited body' },
      });
      expect(r.ok(), `edit failed: ${await r.text()}`).toBeTruthy();
    });

    test('standards_manager can add and edit a requirement on a draft', async ({ apiAs }) => {
      const api = await apiAs('standards_manager');
      const draft = await createDraft(api);

      const addRes = await api.post(`/api/v1/standards/${draft.id}/requirements`, {
        data: {
          identifier: `${draft.identifier}-REQ-1`,
          name: 'Has access control',
          description: 'Initial requirement',
        },
      });
      expect(addRes.status()).toBe(201);
      const req = await addRes.json();
      expect(req.id).toBeTruthy();

      const editRes = await api.put(
        `/api/v1/standards/${draft.id}/requirements/${req.id}`,
        {
          data: { name: 'Has stricter access control' },
        },
      );
      expect(editRes.ok(), `requirement edit failed: ${await editRes.text()}`).toBeTruthy();
    });

    test('standards_manager can delete a requirement on a draft', async ({ apiAs }) => {
      const api = await apiAs('standards_manager');
      const draft = await createDraft(api);
      const reqId = await api
        .post(`/api/v1/standards/${draft.id}/requirements`, {
          data: { identifier: `${draft.identifier}-REQ-D`, name: 'Doomed' },
        })
        .then((r) => r.json())
        .then((r) => r.id);

      const delRes = await api.delete(`/api/v1/standards/${draft.id}/requirements/${reqId}`);
      expect([200, 204]).toContain(delRes.status());
    });

    test('full happy path: draft → in_review → published', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const approverApi = await apiAs('standards_approver');

      const draft = await createDraft(managerApi);
      expect(await fetchState(managerApi, draft.id)).toBe('draft');

      const submitRes = await managerApi.post(`/api/v1/standards/${draft.id}/submit`);
      expect(submitRes.ok(), `submit failed: ${await submitRes.text()}`).toBeTruthy();
      expect(await fetchState(managerApi, draft.id)).toBe('in_review');

      const approveRes = await approverApi.post(`/api/v1/standards/${draft.id}/approve`);
      expect(approveRes.ok(), `approve failed: ${await approveRes.text()}`).toBeTruthy();
      expect(await fetchState(approverApi, draft.id)).toBe('published');
    });

    test('reject path: draft → in_review → draft', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const approverApi = await apiAs('standards_approver');

      const draft = await createDraft(managerApi);
      await managerApi.post(`/api/v1/standards/${draft.id}/submit`);
      expect(await fetchState(managerApi, draft.id)).toBe('in_review');

      const rejectRes = await approverApi.post(`/api/v1/standards/${draft.id}/reject`, {
        data: { reason: 'Needs more requirements' },
      });
      expect(rejectRes.ok(), `reject failed: ${await rejectRes.text()}`).toBeTruthy();
      expect(await fetchState(managerApi, draft.id)).toBe('draft');
    });

    test('retire path: published → retired', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const approverApi = await apiAs('standards_approver');

      const draft = await createDraft(managerApi);
      await managerApi.post(`/api/v1/standards/${draft.id}/submit`);
      await approverApi.post(`/api/v1/standards/${draft.id}/approve`);
      expect(await fetchState(approverApi, draft.id)).toBe('published');

      const retireRes = await approverApi.post(`/api/v1/standards/${draft.id}/retire`);
      expect(retireRes.ok(), `retire failed: ${await retireRes.text()}`).toBeTruthy();
      expect(await fetchState(approverApi, draft.id)).toBe('retired');
    });

    test('duplicate creates a new draft from a published standard', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const approverApi = await apiAs('standards_approver');

      const draft = await createDraft(managerApi);
      await managerApi.post(`/api/v1/standards/${draft.id}/submit`);
      await approverApi.post(`/api/v1/standards/${draft.id}/approve`);

      const dupRes = await managerApi.post(`/api/v1/standards/${draft.id}/duplicate`, {
        data: { identifier: `${draft.identifier}-V2`, name: `${draft.name} v2` },
      });
      expect(dupRes.status()).toBe(201);
      const duplicate = await dupRes.json();
      expect(duplicate.id).not.toBe(draft.id);
      expect(duplicate.state).toBe('draft');
    });
  });

  test.describe('state machine guards', () => {
    test('cannot edit a published standard', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const approverApi = await apiAs('standards_approver');

      const draft = await createDraft(managerApi);
      await managerApi.post(`/api/v1/standards/${draft.id}/submit`);
      await approverApi.post(`/api/v1/standards/${draft.id}/approve`);

      const editRes = await managerApi.put(`/api/v1/standards/${draft.id}`, {
        data: { name: 'Should not stick' },
      });
      expect([400, 403, 409]).toContain(editRes.status());
    });

    test('cannot add requirements to a published standard', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const approverApi = await apiAs('standards_approver');

      const draft = await createDraft(managerApi);
      await managerApi.post(`/api/v1/standards/${draft.id}/submit`);
      await approverApi.post(`/api/v1/standards/${draft.id}/approve`);

      const addRes = await managerApi.post(`/api/v1/standards/${draft.id}/requirements`, {
        data: { identifier: 'NEW-1', name: 'Should not be added' },
      });
      expect([400, 403]).toContain(addRes.status());
    });

    test('cannot approve a standard that is still in draft', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const approverApi = await apiAs('standards_approver');

      const draft = await createDraft(managerApi);
      // Skip submit; standard is still draft.
      const approveRes = await approverApi.post(`/api/v1/standards/${draft.id}/approve`);
      expect([400, 403, 409]).toContain(approveRes.status());
    });

    test('cannot retire a standard that is not published', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const approverApi = await apiAs('standards_approver');

      const draft = await createDraft(managerApi);
      const retireRes = await approverApi.post(`/api/v1/standards/${draft.id}/retire`);
      expect([400, 403, 409]).toContain(retireRes.status());
    });
  });

  test.describe('RBAC matrix', () => {
    let publishedStandardId: string;

    test.beforeAll(async ({ browser }) => {
      // Build one published standard for the read-only role checks.
      // Uses a throwaway API context so the matrix tests below get a
      // stable fixture without each one re-running the lifecycle.
      const { request } = await import('@playwright/test');
      const apiUrl = process.env.E2E_API_URL || 'http://localhost:3001';
      const managerCtx = await request.newContext({ baseURL: apiUrl });
      await managerCtx.post('/api/v1/auth/login', {
        data: { username: 'lkumar', password: 'DemoPass123!' },
      });
      const draft = (await (
        await managerCtx.post('/api/v1/standards', {
          data: {
            identifier: uniqueStandardIdentifier(),
            name: 'E2E RBAC fixture',
            version: '1.0.0',
          },
        })
      ).json()) as Standard;
      await managerCtx.post(`/api/v1/standards/${draft.id}/submit`);
      await managerCtx.dispose();

      const approverCtx = await request.newContext({ baseURL: apiUrl });
      await approverCtx.post('/api/v1/auth/login', {
        data: { username: 'dokafor', password: 'DemoPass123!' },
      });
      await approverCtx.post(`/api/v1/standards/${draft.id}/approve`);
      await approverCtx.dispose();

      publishedStandardId = draft.id;
      // Suppress unused-binding warning when no test uses it (in case
      // a partial test run skips the matrix). The id is read below.
      void browser;
    });

    test('assessor cannot create a draft', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.post('/api/v1/standards', {
        data: { identifier: uniqueStandardIdentifier(), name: 'No-go', version: '1.0.0' },
      });
      expect(r.status()).toBe(403);
    });

    test('assessor cannot submit a draft', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const draft = await createDraft(managerApi);

      const assessorApi = await apiAs('assessor');
      const r = await assessorApi.post(`/api/v1/standards/${draft.id}/submit`);
      expect(r.status()).toBe(403);
    });

    test('assessor cannot approve an in_review standard', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const draft = await createDraft(managerApi);
      await managerApi.post(`/api/v1/standards/${draft.id}/submit`);

      const assessorApi = await apiAs('assessor');
      const r = await assessorApi.post(`/api/v1/standards/${draft.id}/approve`);
      expect(r.status()).toBe(403);
    });

    test('standards_manager cannot approve their own submission', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const draft = await createDraft(managerApi);
      await managerApi.post(`/api/v1/standards/${draft.id}/submit`);

      const r = await managerApi.post(`/api/v1/standards/${draft.id}/approve`);
      expect(r.status()).toBe(403);
    });

    test('standards_approver cannot create a draft', async ({ apiAs }) => {
      const api = await apiAs('standards_approver');
      const r = await api.post('/api/v1/standards', {
        data: { identifier: uniqueStandardIdentifier(), name: 'No-go', version: '1.0.0' },
      });
      expect(r.status()).toBe(403);
    });

    test('standards_approver cannot submit a draft', async ({ apiAs }) => {
      const managerApi = await apiAs('standards_manager');
      const draft = await createDraft(managerApi);

      const approverApi = await apiAs('standards_approver');
      const r = await approverApi.post(`/api/v1/standards/${draft.id}/submit`);
      expect(r.status()).toBe(403);
    });

    test('all view roles can read a published standard @smoke', async ({ apiAs }) => {
      expect(publishedStandardId).toBeTruthy();
      for (const role of ['assessor', 'assessee', 'standards_manager', 'standards_approver'] as const) {
        const api = await apiAs(role);
        const r = await api.get(`/api/v1/standards/${publishedStandardId}`);
        expect(r.ok(), `role=${role} could not read published standard`).toBeTruthy();
      }
    });
  });
});

test.describe('Standards list view (UI) @smoke', () => {
  test.describe('as standards_manager', () => {
    test.use({ storageState: storageStateFor('standards_manager') });

    test('standards_manager can create a draft via the UI', async ({ page, apiAs }) => {
      const standards = new StandardsPage(page);
      await standards.goto();
      const identifier = uniqueStandardIdentifier();
      await standards.createStandard({
        identifier,
        name: `E2E UI Standard ${identifier}`,
        version: '1.0.0',
        description: 'Created via UI in the standards lifecycle spec',
      });

      // Round-trip via the API to verify persistence without relying
      // on the table's pagination state (the dashboard list is
      // ordered alphabetically by name; the new row may not be on
      // page 1 once the suite has accumulated runs).
      const api = await apiAs('standards_manager');
      const list = await api.get('/api/v1/standards?limit=100').then((r) => r.json());
      const found = (list.data as Array<{ identifier: string; state: string }>).find(
        (s) => s.identifier === identifier,
      );
      expect(found).toBeTruthy();
      expect(found!.state).toBe('draft');
    });
  });
});
