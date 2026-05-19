import { test, expect } from '../../fixtures/index.js';

/**
 * Webhooks full CRUD + delivery log.
 *
 * Reference (backend/src/routes/webhooks.ts):
 *   - Permission: admin.webhooks. All routes admin-only.
 *   - POST returns the cleartext secret exactly once. PUT can regenerate.
 *   - URL goes through isPrivateOrReservedUrl — public HTTPS only.
 *   - POST /:id/test emits a CHANNEL_TEST event through the event bus.
 *   - POST /:id/enable resets is_active + consecutive_failures.
 *   - GET /:id/deliveries paginates the delivery log.
 *
 * A separate spec (specs/admin/webhooks.spec.ts) covers the basic
 * "admin opens view, non-admin 403" assertion. This one covers the
 * full CRUD surface.
 */

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const PUBLIC_TEST_URL = 'https://example.com/webhook';

test.describe('Webhooks full CRUD @regression', () => {
  test('admin can create a webhook and receive the secret', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/webhooks', {
      data: {
        name: uniqueName('e2e-hook'),
        url: PUBLIC_TEST_URL,
        eventTypes: ['assessment.created'],
      },
    });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.id).toBeTruthy();
    expect(typeof body.secret).toBe('string');
    expect(body.secret.startsWith('whsec_')).toBeTruthy();
    expect(body.isActive).toBeTruthy();
  });

  test('rejects private/loopback URLs', async ({ apiAs }) => {
    const api = await apiAs('admin');
    for (const url of [
      'http://localhost/webhook',
      'http://127.0.0.1/webhook',
      'http://10.0.0.1/webhook',
    ]) {
      const r = await api.post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-bad'), url, eventTypes: ['assessment.created'] },
      });
      expect(r.status(), `expected 400 for ${url}`).toBe(400);
    }
  });

  test('rejects creation without eventTypes', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/webhooks', {
      data: { name: uniqueName('e2e-noev'), url: PUBLIC_TEST_URL, eventTypes: [] },
    });
    expect(r.status()).toBe(400);
  });

  test('admin can list webhooks', async ({ apiAs }) => {
    const api = await apiAs('admin');
    await api.post('/api/v1/webhooks', {
      data: { name: uniqueName('e2e-list'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
    });
    const r = await api.get('/api/v1/webhooks');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('admin can edit a webhook (no secret returned)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-edit'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());

    const upd = await api.put(`/api/v1/webhooks/${created.id}`, {
      data: { name: 'Renamed webhook', eventTypes: ['assessment.created', 'evidence.submitted'] },
    });
    expect(upd.ok()).toBeTruthy();
    const after = await upd.json();
    expect(after.name).toBe('Renamed webhook');
    expect(after.secret).toBeUndefined(); // secret not rotated, not returned
  });

  test('regenerateSecret returns a fresh secret exactly once', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-rot'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());
    const originalSecret = created.secret as string;

    const rot = await api.put(`/api/v1/webhooks/${created.id}`, {
      data: { regenerateSecret: true },
    });
    expect(rot.ok()).toBeTruthy();
    const after = await rot.json();
    expect(typeof after.secret).toBe('string');
    expect(after.secret).not.toBe(originalSecret);

    // Read-back endpoint must not echo the secret.
    const read = await api.get(`/api/v1/webhooks/${created.id}`).then((r) => r.json());
    expect(read.secret).toBeUndefined();
  });

  test('admin can disable then re-enable a webhook', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-toggle'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());

    const disable = await api.put(`/api/v1/webhooks/${created.id}`, { data: { isActive: false } });
    expect(disable.ok()).toBeTruthy();
    expect((await disable.json()).isActive).toBeFalsy();

    const enable = await api.post(`/api/v1/webhooks/${created.id}/enable`);
    expect(enable.ok()).toBeTruthy();
    const enabled = await enable.json();
    expect(enabled.isActive).toBeTruthy();
    expect(enabled.consecutiveFailures).toBe(0);
  });

  test('POST /:id/test emits a test event', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-test'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());

    const r = await api.post(`/api/v1/webhooks/${created.id}/test`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.message).toMatch(/emitted/i);
  });

  test('GET /:id returns delivery stats envelope', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-stats'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());

    const r = await api.get(`/api/v1/webhooks/${created.id}`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.deliveryStats).toBeTruthy();
    expect(typeof body.deliveryStats.totalDeliveries).toBe('number');
    expect(typeof body.deliveryStats.successfulDeliveries).toBe('number');
  });

  test('GET /:id/deliveries is paginated', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-deliv'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());

    const r = await api.get(`/api/v1/webhooks/${created.id}/deliveries?limit=10&offset=0`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.pagination).toMatchObject({ limit: 10, offset: 0 });
    expect(typeof body.pagination.total).toBe('number');
  });

  test('admin can delete a webhook', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-del'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());

    const del = await api.delete(`/api/v1/webhooks/${created.id}`);
    expect(del.ok()).toBeTruthy();

    const after = await api.get(`/api/v1/webhooks/${created.id}`);
    expect(after.status()).toBe(404);
  });

  test.describe('RBAC', () => {
    test('non-admin cannot list webhooks', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.get('/api/v1/webhooks');
      expect(r.status()).toBe(403);
    });

    test('non-admin cannot create a webhook', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.post('/api/v1/webhooks', {
        data: { name: uniqueName('e2e-rbac'), url: PUBLIC_TEST_URL, eventTypes: ['assessment.created'] },
      });
      expect(r.status()).toBe(403);
    });
  });
});
