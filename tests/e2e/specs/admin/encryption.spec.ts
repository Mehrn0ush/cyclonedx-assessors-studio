import { test, expect } from '../../fixtures/index.js';

/**
 * Admin encryption management.
 *
 * Reference (backend/src/routes/admin-encryption.ts):
 *   - Permission: admin.encryption.
 *   - GET /admin/encryption/status returns availability flag, active key
 *     version, key version history, and encrypted/plaintext counts of
 *     known sensitive fields (today: webhook secrets).
 *   - POST /admin/encryption/rotate creates a new key version and
 *     re-wraps existing encrypted values. Requires MASTER_ENCRYPTION_KEY
 *     to be configured. Returns 400 if encryption is in passthrough mode.
 *
 * The E2E backend launches without MASTER_ENCRYPTION_KEY set by default,
 * which puts encryption into passthrough mode. The rotation test
 * therefore asserts the 400 fall-through path. If a future test harness
 * provisions a master key, that branch should still hold because the
 * route is symmetric.
 */

test.describe('Encryption admin @regression', () => {
  test('GET /encryption/status returns the expected envelope', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const r = await api.get('/api/v1/admin/encryption/status');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();

    expect(typeof body.available).toBe('boolean');
    expect(typeof body.passthroughMode).toBe('boolean');
    expect(body.passthroughMode).toBe(!body.available);

    expect(Array.isArray(body.keyVersions)).toBeTruthy();
    expect(body.encryptedFields).toBeTruthy();
    expect(body.encryptedFields.webhook).toBeTruthy();
    expect(typeof body.encryptedFields.webhook.total).toBe('number');
    expect(typeof body.encryptedFields.webhook.encrypted).toBe('number');
    expect(typeof body.encryptedFields.webhook.plaintext).toBe('number');
  });

  test('POST /encryption/rotate behaves per encryption availability', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const status = await api.get('/api/v1/admin/encryption/status').then((r) => r.json());

    const r = await api.post('/api/v1/admin/encryption/rotate');
    if (status.available) {
      // With a master key, rotation must succeed and return a new version.
      expect(r.ok()).toBeTruthy();
      const body = await r.json();
      expect(body.newVersion).toBeTruthy();
      expect(typeof body.processed).toBe('number');
      expect(typeof body.rekeyed).toBe('number');
    } else {
      // In passthrough mode the route must refuse.
      expect(r.status()).toBe(400);
    }
  });

  test.describe('RBAC', () => {
    test('non-admin cannot read encryption status', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.get('/api/v1/admin/encryption/status');
      expect(r.status()).toBe(403);
    });

    test('non-admin cannot rotate encryption key', async ({ apiAs }) => {
      const api = await apiAs('assessor');
      const r = await api.post('/api/v1/admin/encryption/rotate');
      expect(r.status()).toBe(403);
    });
  });
});
