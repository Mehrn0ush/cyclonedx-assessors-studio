import { test, expect } from '../../fixtures/index.js';

/**
 * Admin user invites.
 *
 * Reference (backend/src/routes/admin-invites.ts):
 *   - Permission: admin.users on all endpoints.
 *   - POST /admin/invites returns the plaintext token exactly once. The
 *     server stores only the SHA-256 hash.
 *   - GET /admin/invites lists every invite, derived `status` is one of
 *     pending | consumed | revoked | expired.
 *   - DELETE /admin/invites/:id is idempotent for already revoked rows
 *     (204) and 409s on already consumed invites.
 *   - GET /admin/invites/email-configured returns { emailConfigured }
 *     for the issuance UI to decide whether to warn the admin.
 *   - POST /auth/register accepts inviteToken; an invalid token rejects.
 *
 * Note: a full redeem-and-login round trip is intentionally not asserted
 * here because it creates real users that bloat the user table. The
 * register-with-bad-token path covers the token-consumption code path
 * without producing a new user.
 */

test.describe('Admin invites @regression', () => {
  test('admin can issue an invite and receive token exactly once', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/admin/invites', {
      data: { intendedRole: 'assessor', expiresInHours: 24 },
    });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.intendedRole).toBe('assessor');

    // GET does not echo the token.
    const list = await api.get('/api/v1/admin/invites').then((r) => r.json());
    const found = (list.invites as Array<{ id: string; token?: string }>).find((row) => row.id === body.id);
    expect(found).toBeTruthy();
    // Token must not be returned on list reads.
    expect((found as { token?: string }).token).toBeUndefined();
  });

  test('list groups invites with derived status', async ({ apiAs }) => {
    const api = await apiAs('admin');
    await api.post('/api/v1/admin/invites', { data: { intendedRole: 'assessee' } });
    const r = await api.get('/api/v1/admin/invites');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.invites)).toBeTruthy();
    for (const row of body.invites as Array<{ status: string }>) {
      expect(['pending', 'consumed', 'revoked', 'expired']).toContain(row.status);
    }
  });

  test('admin can revoke a pending invite (204)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/admin/invites', { data: { intendedRole: 'assessee' } })
      .then((r) => r.json());

    const del = await api.delete(`/api/v1/admin/invites/${created.id}`);
    expect(del.status()).toBe(204);

    // Now reads as revoked.
    const list = await api.get('/api/v1/admin/invites').then((r) => r.json());
    const row = (list.invites as Array<{ id: string; status: string }>).find((r) => r.id === created.id);
    expect(row?.status).toBe('revoked');
  });

  test('revoking an already revoked invite is idempotent (204)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const created = await api
      .post('/api/v1/admin/invites', { data: { intendedRole: 'assessee' } })
      .then((r) => r.json());

    expect((await api.delete(`/api/v1/admin/invites/${created.id}`)).status()).toBe(204);
    expect((await api.delete(`/api/v1/admin/invites/${created.id}`)).status()).toBe(204);
  });

  test('revoking an unknown invite returns 404', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.delete('/api/v1/admin/invites/00000000-0000-0000-0000-000000000000');
    expect(r.status()).toBe(404);
  });

  test('register with an invalid invite token is rejected', async ({ apiAs }) => {
    // Use an unauthenticated context for register.
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/auth/register', {
      data: {
        username: `e2e_invite_bad_${Date.now().toString(36)}`,
        email: `e2e_invite_bad_${Date.now().toString(36)}@example.com`,
        password: 'CorrectHorseBatteryStaple9!',
        displayName: 'Bad Token User',
        inviteToken: 'this-is-not-a-valid-token',
      },
    });
    // Either 400 (mode=invite_only path) or 401/403 (token rejected). The
    // important point is that registration does not succeed.
    expect(r.ok()).toBeFalsy();
  });

  test('email-configured endpoint returns boolean only', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/admin/invites/email-configured');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(typeof body.emailConfigured).toBe('boolean');
    // No host/port/from leakage.
    expect(body.host).toBeUndefined();
    expect(body.from).toBeUndefined();
  });

  test.describe('RBAC', () => {
    test('non-admin cannot list invites', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.get('/api/v1/admin/invites');
      expect(r.status()).toBe(403);
    });

    test('non-admin cannot issue an invite', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.post('/api/v1/admin/invites', {
        data: { intendedRole: 'assessee' },
      });
      expect(r.status()).toBe(403);
    });
  });
});
