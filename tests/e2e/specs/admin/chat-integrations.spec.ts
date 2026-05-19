import { test, expect } from '../../fixtures/index.js';

/**
 * Chat integrations CRUD.
 *
 * Reference (backend/src/routes/chat-integrations.ts):
 *   - Mounted at /api/v1/integrations/chat. Permission: admin.integrations.
 *   - POST validates platform-specific webhook URL prefix:
 *       slack -> https://hooks.slack.com/
 *       teams -> .webhook.office.com/ or .logic.azure.com/
 *       mattermost -> any https://
 *   - eventCategories must be a non-empty array.
 *   - POST /:id/test calls the channel handler. If the URL is fake the
 *     handler returns success=false and the route returns 502. We accept
 *     either 200 or 502 since both indicate the route is wired and only
 *     the downstream HTTP call failed.
 */

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const SLACK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';

test.describe('Chat integrations CRUD @regression', () => {
  test('admin can create a slack integration', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/integrations/chat', {
      data: {
        name: uniqueName('e2e-slack'),
        platform: 'slack',
        webhookUrl: SLACK_URL,
        eventCategories: ['assessment'],
      },
    });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.id).toBeTruthy();
    expect(body.platform).toBe('slack');
    expect(body.isActive).toBeTruthy();
  });

  test('rejects slack URL not starting with hooks.slack.com', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/integrations/chat', {
      data: {
        name: uniqueName('e2e-bad-slack'),
        platform: 'slack',
        webhookUrl: 'https://example.com/webhook',
        eventCategories: ['assessment'],
      },
    });
    expect(r.status()).toBe(400);
  });

  test('rejects creation without eventCategories', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/integrations/chat', {
      data: {
        name: uniqueName('e2e-no-cat'),
        platform: 'slack',
        webhookUrl: SLACK_URL,
        eventCategories: [],
      },
    });
    expect(r.status()).toBe(400);
  });

  test('admin can list integrations', async ({ apiAs }) => {
    const api = await apiAs('admin');
    await api.post('/api/v1/integrations/chat', {
      data: {
        name: uniqueName('e2e-list'),
        platform: 'slack',
        webhookUrl: SLACK_URL,
        eventCategories: ['assessment'],
      },
    });
    const r = await api.get('/api/v1/integrations/chat');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('admin can edit an integration', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/integrations/chat', {
        data: {
          name: uniqueName('e2e-edit'),
          platform: 'slack',
          webhookUrl: SLACK_URL,
          eventCategories: ['assessment'],
        },
      })
      .then((r) => r.json());

    const upd = await api.put(`/api/v1/integrations/chat/${created.id}`, {
      data: { name: 'Renamed integration', eventCategories: ['assessment', 'evidence'] },
    });
    expect(upd.ok()).toBeTruthy();
    const after = await upd.json();
    expect(after.name).toBe('Renamed integration');
    expect(after.eventCategories).toContain('evidence');
  });

  test('admin can disable then re-enable an integration', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/integrations/chat', {
        data: {
          name: uniqueName('e2e-toggle'),
          platform: 'slack',
          webhookUrl: SLACK_URL,
          eventCategories: ['assessment'],
        },
      })
      .then((r) => r.json());

    const disable = await api.put(`/api/v1/integrations/chat/${created.id}`, {
      data: { isActive: false },
    });
    expect(disable.ok()).toBeTruthy();
    expect((await disable.json()).isActive).toBeFalsy();

    const enable = await api.post(`/api/v1/integrations/chat/${created.id}/enable`);
    expect(enable.ok()).toBeTruthy();
    const enabled = await enable.json();
    expect(enabled.isActive).toBeTruthy();
    expect(enabled.consecutiveFailures).toBe(0);
  });

  test('POST /:id/test is wired (200 or 502 both acceptable)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/integrations/chat', {
        data: {
          name: uniqueName('e2e-test'),
          platform: 'slack',
          webhookUrl: SLACK_URL,
          eventCategories: ['assessment'],
        },
      })
      .then((r) => r.json());

    const r = await api.post(`/api/v1/integrations/chat/${created.id}/test`);
    // 200 if the handler reports success; 502 if downstream send failed.
    // Both prove the route + channel handler chain is in place.
    expect([200, 502]).toContain(r.status());
  });

  test('admin can delete an integration', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/integrations/chat', {
        data: {
          name: uniqueName('e2e-del'),
          platform: 'slack',
          webhookUrl: SLACK_URL,
          eventCategories: ['assessment'],
        },
      })
      .then((r) => r.json());

    const del = await api.delete(`/api/v1/integrations/chat/${created.id}`);
    expect(del.ok()).toBeTruthy();
  });

  test('GET /:id/deliveries returns a paginated envelope', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/integrations/chat', {
        data: {
          name: uniqueName('e2e-deliv'),
          platform: 'slack',
          webhookUrl: SLACK_URL,
          eventCategories: ['assessment'],
        },
      })
      .then((r) => r.json());

    const r = await api.get(`/api/v1/integrations/chat/${created.id}/deliveries?limit=10`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.pagination).toBeTruthy();
    expect(body.pagination.limit).toBe(10);
  });

  test.describe('RBAC', () => {
    test('non-admin cannot list integrations', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.get('/api/v1/integrations/chat');
      expect(r.status()).toBe(403);
    });

    test('non-admin cannot create an integration', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.post('/api/v1/integrations/chat', {
        data: {
          name: uniqueName('e2e-rbac'),
          platform: 'slack',
          webhookUrl: SLACK_URL,
          eventCategories: ['assessment'],
        },
      });
      expect(r.status()).toBe(403);
    });
  });
});
