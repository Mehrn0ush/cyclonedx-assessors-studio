/**
 * Tests for /api/v1/admin/platform-keys.
 *
 * Covers:
 *   - Authentication and permission gating (platform_keys.rotate is
 *     admin only).
 *   - Listing keys with stable ordering (active first).
 *   - The /active endpoint bootstrapping a fresh key when none
 *     exists, and then returning the same key on subsequent calls.
 *   - POST /rotate generating a fresh keypair, flipping the previous
 *     active key to inactive, and returning public material only.
 *   - Optional algorithm parameter (accepted values and rejection of
 *     unknown values).
 *   - camelCase response envelope and PEM shape.
 */
import { describe, it, expect } from 'vitest';
import { setupHttpTests, getAgent, loginAs } from '../helpers/http.js';

const BASE = '/api/v1/admin/platform-keys';

describe('Admin Platform Keys (HTTP integration)', () => {
  setupHttpTests();

  describe('Authentication and authorization', () => {
    it('returns 401 for unauthenticated list requests', async () => {
      const agent = getAgent();
      const res = await agent.get(BASE);
      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated active key requests', async () => {
      const agent = getAgent();
      const res = await agent.get(`${BASE}/active`);
      expect(res.status).toBe(401);
    });

    it('returns 401 for unauthenticated rotate requests', async () => {
      const agent = getAgent();
      const res = await agent.post(`${BASE}/rotate`).send({});
      expect(res.status).toBe(401);
    });

    it('returns 403 for assessee on list', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get(BASE);
      expect(res.status).toBe(403);
    });

    it('returns 403 for assessor on list', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get(BASE);
      expect(res.status).toBe(403);
    });

    it('returns 403 for assessee on active endpoint', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get(`${BASE}/active`);
      expect(res.status).toBe(403);
    });

    it('returns 403 for assessor on active endpoint', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get(`${BASE}/active`);
      expect(res.status).toBe(403);
    });

    it('returns 403 for assessee on rotate', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.post(`${BASE}/rotate`).send({});
      expect(res.status).toBe(403);
    });

    it('returns 403 for assessor on rotate', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.post(`${BASE}/rotate`).send({});
      expect(res.status).toBe(403);
    });
  });

  describe('GET /active', () => {
    it('returns the active platform key, bootstrapping if needed', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get(`${BASE}/active`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      const key = res.body.data;
      expect(key).toHaveProperty('id');
      expect(key).toHaveProperty('fingerprint');
      expect(key).toHaveProperty('algorithm');
      expect(key).toHaveProperty('publicKeyPem');
      expect(key).toHaveProperty('isActive', true);
      expect(key).toHaveProperty('createdAt');
      // Private material must never leak through the HTTP surface.
      expect(key).not.toHaveProperty('privateKeyPem');
      expect(key).not.toHaveProperty('private_key_pem');
      expect(key).not.toHaveProperty('privateKeyEncrypted');
      expect(key).not.toHaveProperty('private_key_encrypted');
      expect(typeof key.publicKeyPem).toBe('string');
      expect(key.publicKeyPem).toContain('BEGIN PUBLIC KEY');
      expect(typeof key.fingerprint).toBe('string');
      expect(key.fingerprint.length).toBeGreaterThan(0);
    });

    it('is idempotent across repeated calls', async () => {
      const agent = await loginAs('admin');
      const first = await agent.get(`${BASE}/active`);
      const second = await agent.get(`${BASE}/active`);
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.data.id).toBe(second.body.data.id);
      expect(first.body.data.fingerprint).toBe(second.body.data.fingerprint);
      expect(first.body.data.publicKeyPem).toBe(second.body.data.publicKeyPem);
    });

    it('responds with camelCase fields only', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get(`${BASE}/active`);
      expect(res.status).toBe(200);
      const key = res.body.data;
      expect(key).toHaveProperty('isActive');
      expect(key).not.toHaveProperty('is_active');
      expect(key).toHaveProperty('publicKeyPem');
      expect(key).not.toHaveProperty('public_key_pem');
      expect(key).toHaveProperty('createdAt');
      expect(key).not.toHaveProperty('created_at');
    });
  });

  describe('GET /', () => {
    it('returns at least one key with the active one first', async () => {
      const agent = await loginAs('admin');
      // Ensure at least one key exists.
      await agent.get(`${BASE}/active`);

      const res = await agent.get(BASE);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // Exactly one key must be active at any time.
      const activeKeys = res.body.data.filter((k: { isActive: boolean }) => k.isActive);
      expect(activeKeys.length).toBe(1);

      // Active key ordered first.
      expect(res.body.data[0].isActive).toBe(true);

      // No private material on any row.
      for (const key of res.body.data) {
        expect(key).not.toHaveProperty('privateKeyPem');
        expect(key).not.toHaveProperty('private_key_encrypted');
        expect(key).toHaveProperty('publicKeyPem');
      }
    });
  });

  describe('POST /rotate', () => {
    it('mints a fresh keypair and marks the previous active key inactive', async () => {
      const agent = await loginAs('admin');

      const before = await agent.get(`${BASE}/active`);
      expect(before.status).toBe(200);
      const previousFingerprint = before.body.data.fingerprint;
      const previousId = before.body.data.id;

      const res = await agent.post(`${BASE}/rotate`).send({});
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('data');
      const newKey = res.body.data;

      expect(newKey).toHaveProperty('id');
      expect(newKey).toHaveProperty('fingerprint');
      expect(newKey).toHaveProperty('publicKeyPem');
      expect(newKey).toHaveProperty('isActive', true);
      expect(newKey).toHaveProperty('rotatedAt');
      expect(newKey).toHaveProperty('rotatedBy');
      // The rotate response embeds the id of the admin who triggered
      // it. Any non-empty string is fine for contract purposes.
      expect(typeof newKey.rotatedBy).toBe('string');

      // Must differ from the previous active key.
      expect(newKey.id).not.toBe(previousId);
      expect(newKey.fingerprint).not.toBe(previousFingerprint);

      // Private material is never returned.
      expect(newKey).not.toHaveProperty('privateKeyPem');
      expect(newKey).not.toHaveProperty('private_key_encrypted');

      // The /active endpoint now returns the new key.
      const after = await agent.get(`${BASE}/active`);
      expect(after.status).toBe(200);
      expect(after.body.data.id).toBe(newKey.id);
      expect(after.body.data.fingerprint).toBe(newKey.fingerprint);

      // The listing retains the previous key as inactive.
      const list = await agent.get(BASE);
      expect(list.status).toBe(200);
      const previousRow = list.body.data.find(
        (k: { id: string }) => k.id === previousId,
      );
      expect(previousRow).toBeDefined();
      expect(previousRow.isActive).toBe(false);
      // Exactly one active key after rotation.
      const actives = list.body.data.filter((k: { isActive: boolean }) => k.isActive);
      expect(actives.length).toBe(1);
      expect(actives[0].id).toBe(newKey.id);
    });

    it('accepts an explicit algorithm override', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post(`${BASE}/rotate`).send({ algorithm: 'ES256' });
      expect(res.status).toBe(201);
      expect(res.body.data.algorithm).toBe('ES256');
      expect(res.body.data.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    });

    it('rejects an unknown algorithm with 400', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post(`${BASE}/rotate`).send({ algorithm: 'BOGUS' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('supports back-to-back rotations, each producing a new fingerprint', async () => {
      const agent = await loginAs('admin');
      const a = await agent.post(`${BASE}/rotate`).send({});
      expect(a.status).toBe(201);
      const b = await agent.post(`${BASE}/rotate`).send({});
      expect(b.status).toBe(201);
      expect(a.body.data.fingerprint).not.toBe(b.body.data.fingerprint);

      const list = await agent.get(BASE);
      expect(list.status).toBe(200);
      // Rotations never delete historic rows; the list grows.
      const ids = list.body.data.map((k: { id: string }) => k.id);
      expect(ids).toContain(a.body.data.id);
      expect(ids).toContain(b.body.data.id);
    });
  });
});
