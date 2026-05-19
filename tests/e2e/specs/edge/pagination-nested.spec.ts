import { test, expect } from '../../fixtures/index.js';

/**
 * Phase 3 pagination guard extension.
 *
 * The Phase 1 spec (`specs/admin/pagination.spec.ts`) covered the 6
 * top-level paginated lists touched by issue #21. There are two more
 * paginated endpoints scoped to a parent resource:
 *
 *   - GET /api/v1/webhooks/:id/deliveries
 *   - GET /api/v1/integrations/chat/:id/deliveries
 *   - GET /api/v1/audit/entity/:entityType/:entityId
 *
 * Each accepts limit + offset and routes through the same
 * validatePagination helper. If a refactor accidentally bypasses the
 * helper on a scoped route, this spec catches the regression.
 */

function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Pagination guard (nested) @regression', () => {
  test('webhook deliveries reject limit > 100', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const hook = await api
      .post('/api/v1/webhooks', {
        data: { name: uniq('e2e-pg'), url: 'https://example.com/wh', eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());
    const r = await api.get(`/api/v1/webhooks/${hook.id}/deliveries?limit=101`);
    expect(r.status()).toBe(400);
    const body = await r.json();
    expect(body.error).toBe('Invalid input');
  });

  test('webhook deliveries accept boundary limit=100', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const hook = await api
      .post('/api/v1/webhooks', {
        data: { name: uniq('e2e-pgb'), url: 'https://example.com/wh', eventTypes: ['assessment.created'] },
      })
      .then((r) => r.json());
    const r = await api.get(`/api/v1/webhooks/${hook.id}/deliveries?limit=100`);
    expect(r.ok()).toBeTruthy();
  });

  test('chat-integration deliveries reject limit > 100', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const ci = await api
      .post('/api/v1/integrations/chat', {
        data: {
          name: uniq('e2e-cpg'),
          platform: 'slack',
          webhookUrl: 'https://hooks.slack.com/services/T0/B0/X',
          eventCategories: ['assessment'],
        },
      })
      .then((r) => r.json());
    const r = await api.get(`/api/v1/integrations/chat/${ci.id}/deliveries?limit=200`);
    expect(r.status()).toBe(400);
  });

  test('audit entity-scoped endpoint rejects limit > 100', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/audit/entity/entity/00000000-0000-0000-0000-000000000000?limit=999');
    expect(r.status()).toBe(400);
  });

  test('every paginated route rejects non-numeric limit values', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const routes = [
      '/api/v1/entities?limit=NaN',
      '/api/v1/assessments?limit=hello',
      '/api/v1/evidence?limit=true',
      '/api/v1/projects?limit=null',
      '/api/v1/notifications?limit=undefined',
      '/api/v1/audit?limit={}',
    ];
    for (const route of routes) {
      const r = await api.get(route);
      expect(r.status(), route).toBe(400);
    }
  });

  test('every paginated route rejects negative offset', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const routes = ['/api/v1/entities', '/api/v1/assessments', '/api/v1/evidence', '/api/v1/projects'];
    for (const route of routes) {
      const r = await api.get(`${route}?offset=-1`);
      expect(r.status(), route).toBe(400);
    }
  });
});
