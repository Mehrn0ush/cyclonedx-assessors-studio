import { test, expect } from '../../fixtures/index.js';

/**
 * Notification rules CRUD.
 *
 * Reference (backend/src/routes/notification-rules.ts):
 *   - User-owned rules: each authenticated user can create rules
 *     for their own subscription. No admin permission required.
 *   - Admin-managed global rules live at
 *     /api/v1/admin/notification-rules (admin.notification_rules
 *     permission). User rules are at /api/v1/notification-rules.
 *
 * Rules carry { name, eventType, channels[], filters? }. The
 * specifics differ per build but the CRUD shape is stable.
 */

interface RuleCreate {
  name: string;
  eventType: string;
  channels?: string[];
}

async function createRule(api: Awaited<ReturnType<typeof import('@playwright/test').request.newContext>>, overrides: Partial<RuleCreate> = {}) {
  const r = await api.post('/api/v1/notification-rules', {
    data: {
      name: overrides.name ?? `E2E rule ${Date.now().toString(36)}`,
      eventType: overrides.eventType ?? 'assessment.state_changed',
      channels: overrides.channels ?? ['email'],
    },
  });
  return r;
}

test.describe('Notification rules CRUD @smoke', () => {
  test('admin can create a notification rule', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await createRule(api);
    expect([200, 201]).toContain(r.status());
    const body = await r.json();
    expect(body.id ?? body.data?.id).toBeTruthy();
  });

  test('assessor can create their own notification rule', async ({ apiAs }) => {
    const api = await apiAs('assessor');
    const r = await createRule(api);
    expect([200, 201]).toContain(r.status());
  });

  test('admin can list their own rules', async ({ apiAs }) => {
    const api = await apiAs('admin');
    await createRule(api, { name: `E2E listable ${Date.now().toString(36)}` });
    const r = await api.get('/api/v1/notification-rules');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('admin can edit their own rule', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = (await createRule(api).then((r) => r.json())) as { id?: string; data?: { id: string } };
    const id = created.id ?? created.data?.id;
    expect(id).toBeTruthy();
    const upd = await api.put(`/api/v1/notification-rules/${id}`, {
      data: { name: 'Renamed rule' },
    });
    expect(upd.ok()).toBeTruthy();
  });

  test('admin can delete their own rule', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = (await createRule(api).then((r) => r.json())) as { id?: string; data?: { id: string } };
    const id = created.id ?? created.data?.id;
    const r = await api.delete(`/api/v1/notification-rules/${id}`);
    expect([200, 204]).toContain(r.status());
  });

  test('GET /admin/notification-rules requires admin.notification_rules', async ({ apiAs }) => {
    const adminApi = await apiAs('admin');
    const adminRes = await adminApi.get('/api/v1/admin/notification-rules');
    expect(adminRes.ok(), `admin could not read /admin/notification-rules`).toBeTruthy();

    const assessorApi = await apiAs('assessor');
    const assessorRes = await assessorApi.get('/api/v1/admin/notification-rules');
    expect(assessorRes.status()).toBe(403);
  });
});
