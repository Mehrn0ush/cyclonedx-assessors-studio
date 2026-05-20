import { test, expect } from '../../fixtures/index.js';
import type { APIRequestContext } from '@playwright/test';

/**
 * Notification rules CRUD.
 *
 * Reference (backend/src/routes/notification-rules.ts and
 * notification-rules-helpers.ts):
 *   - User-owned rules live at /api/v1/notification-rules. No admin
 *     permission required; each user can create rules for themselves.
 *   - Admin-managed global rules live at
 *     /api/v1/admin/notification-rules (admin.notification_rules).
 *
 * Wire shape:
 *   - createRuleSchema: { name, channel (singular enum), eventTypes
 *     (array of allowed strings), filters?, destination?, enabled? }
 *   - channel ∈ in_app | email | slack | teams | mattermost | webhook
 *   - eventTypes must come from USER_VALID_EVENT_TYPES
 *
 * The GET /notification-rules endpoint returns the row array directly,
 * NOT a { data: [...] } envelope.
 */

interface RuleCreate {
  name: string;
  eventTypes: string[];
  channel: 'in_app' | 'email' | 'slack' | 'teams' | 'mattermost' | 'webhook';
}

async function createRule(
  api: APIRequestContext,
  overrides: Partial<RuleCreate> = {},
) {
  const r = await api.post('/api/v1/notification-rules', {
    data: {
      name: overrides.name ?? `E2E rule ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      eventTypes: overrides.eventTypes ?? ['assessment.state_changed'],
      channel: overrides.channel ?? 'email',
    },
  });
  return r;
}

test.describe('Notification rules CRUD @smoke', () => {
  test('admin can create a notification rule', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await createRule(api);
    expect([200, 201], `unexpected status ${r.status()}: ${await r.text()}`).toContain(r.status());
    const body = await r.json();
    expect(body.id).toBeTruthy();
  });

  test('assessor can create their own notification rule', async ({ apiAs }) => {
    const api = await apiAs('assessor');
    const r = await createRule(api);
    expect([200, 201]).toContain(r.status());
  });

  test('admin can list their own rules', async ({ apiAs }) => {
    const api = await apiAs('admin');
    await createRule(api);
    const r = await api.get('/api/v1/notification-rules');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    // GET returns the array directly, not { data: [...] }.
    expect(Array.isArray(body), `expected array, got ${typeof body}: ${JSON.stringify(body).slice(0, 200)}`).toBeTruthy();
  });

  test('admin can edit their own rule', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = (await createRule(api).then((r) => r.json())) as { id: string };
    expect(created.id).toBeTruthy();
    const upd = await api.put(`/api/v1/notification-rules/${created.id}`, {
      data: { name: 'Renamed rule' },
    });
    expect(upd.ok(), `update failed: ${upd.status()} ${await upd.text()}`).toBeTruthy();
  });

  test('admin can delete their own rule', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = (await createRule(api).then((r) => r.json())) as { id: string };
    const r = await api.delete(`/api/v1/notification-rules/${created.id}`);
    expect([200, 204]).toContain(r.status());
  });

  test('rejects an event type outside the USER allowlist', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/notification-rules', {
      data: {
        name: `e2e bad type ${Date.now().toString(36)}`,
        eventTypes: ['standard.imported'], // admin-only event type, not user
        channel: 'email',
      },
    });
    expect(r.status()).toBe(400);
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
