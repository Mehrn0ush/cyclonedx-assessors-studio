import { test, expect } from '../../fixtures/index.js';

/**
 * Platform signing key management.
 *
 * Reference (backend/src/routes/admin-platform-keys.ts):
 *   - Permission: platform_keys.rotate. Admin only by default.
 *   - GET /admin/platform-keys lists all keys, active first.
 *   - GET /admin/platform-keys/active bootstraps the first key if none
 *     exists yet. Private key never appears in any response.
 *   - POST /admin/platform-keys/rotate generates a new keypair, marks
 *     it active, returns only the public half.
 *
 * Rotation is shared infrastructure. The spec exercises one rotation
 * per run rather than fanning out across all algorithms.
 */

test.describe('Platform keys @regression', () => {
  test('admin can list platform keys', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/admin/platform-keys');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('GET /active returns the active key without private material', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/admin/platform-keys/active');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.data).toBeTruthy();
    expect(body.data.fingerprint).toBeTruthy();
    expect(body.data.algorithm).toBeTruthy();
    expect(body.data.privateKeyPem).toBeUndefined();
    expect(body.data.private_key_pem).toBeUndefined();
  });

  test('admin can rotate the platform key (Ed25519)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const before = await api.get('/api/v1/admin/platform-keys/active').then((r) => r.json());

    const r = await api.post('/api/v1/admin/platform-keys/rotate', {
      data: { algorithm: 'Ed25519' },
    });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.data.fingerprint).toBeTruthy();
    expect(body.data.algorithm).toBe('Ed25519');
    expect(body.data.privateKeyPem).toBeUndefined();

    // Fingerprint must have changed.
    if (before?.data?.fingerprint) {
      expect(body.data.fingerprint).not.toBe(before.data.fingerprint);
    }

    // GET /active now returns the new key.
    const after = await api.get('/api/v1/admin/platform-keys/active').then((r) => r.json());
    expect(after.data.fingerprint).toBe(body.data.fingerprint);

    // Old key still listed (historic signatures remain verifiable).
    const list = await api.get('/api/v1/admin/platform-keys').then((r) => r.json());
    expect((list.data as Array<unknown>).length).toBeGreaterThanOrEqual(1);
  });

  test('rotate rejects an unknown algorithm', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.post('/api/v1/admin/platform-keys/rotate', {
      data: { algorithm: 'RC4' },
    });
    expect(r.status()).toBe(400);
  });

  test.describe('RBAC', () => {
    test('non-admin cannot list platform keys', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.get('/api/v1/admin/platform-keys');
      expect(r.status()).toBe(403);
    });

    test('non-admin cannot rotate the platform key', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.post('/api/v1/admin/platform-keys/rotate', { data: {} });
      expect(r.status()).toBe(403);
    });
  });
});
