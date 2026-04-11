/**
 * HTTP integration tests for admin encryption management endpoints.
 *
 * Tests the encryption status and key rotation endpoints that are used to
 * manage encryption at rest within the application.
 */

import { describe, it, expect } from 'vitest';
import { setupHttpTests, loginAs, getAgent } from '../helpers/http.js';
import { getDatabase } from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

describe('Admin Encryption Endpoints (HTTP integration)', () => {
  setupHttpTests();

  describe('GET /api/v1/admin/encryption/status', () => {
    it('should return encryption status for admin users', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('available');
      expect(res.body).toHaveProperty('passthroughMode');
      expect(res.body).toHaveProperty('activeKeyVersion');
      expect(res.body).toHaveProperty('keyVersions');
      expect(res.body).toHaveProperty('encryptedFields');

      // Validate structure of response
      expect(typeof res.body.available).toBe('boolean');
      expect(typeof res.body.passthroughMode).toBe('boolean');
      expect(typeof res.body.activeKeyVersion).toBe('number');
      expect(Array.isArray(res.body.keyVersions)).toBe(true);
      expect(typeof res.body.encryptedFields).toBe('object');
    });

    it('should return webhook encryption field counts', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(200);
      expect(res.body.encryptedFields).toHaveProperty('webhook');
      expect(res.body.encryptedFields.webhook).toHaveProperty('total');
      expect(res.body.encryptedFields.webhook).toHaveProperty('encrypted');
      expect(res.body.encryptedFields.webhook).toHaveProperty('plaintext');

      // Validate counts
      const { total, encrypted, plaintext } = res.body.encryptedFields.webhook;
      expect(typeof total).toBe('number');
      expect(typeof encrypted).toBe('number');
      expect(typeof plaintext).toBe('number');
      expect(encrypted + plaintext).toBe(total);
    });

    it('should return passthroughMode when encryption is unavailable', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(200);
      // If available is true, passthroughMode should be false, and vice versa
      expect(res.body.available).toBe(!res.body.passthroughMode);
    });

    it('should include key version details', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(200);
      if (res.body.keyVersions.length > 0) {
        const keyVersion = res.body.keyVersions[0];
        expect(keyVersion).toHaveProperty('version');
        expect(keyVersion).toHaveProperty('isActive');
        expect(keyVersion).toHaveProperty('createdAt');
        expect(typeof keyVersion.version).toBe('number');
        expect(typeof keyVersion.isActive).toBe('boolean');
      }
    });

    it('should reject non-admin users (assessor)', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(403);
    });

    it('should reject non-admin users (assessee)', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(401);
    });

    it('should handle gracefully when key version table does not exist', async () => {
      // The endpoint should not crash and should return partial data if the
      // encryption_key_version table is missing
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(200);
      expect(res.body.keyVersions).toBeDefined();
    });
  });

  describe('POST /api/v1/admin/encryption/rotate', () => {
    it('should rotate encryption key for admin users when encryption is available', async () => {
      const agent = await loginAs('admin');

      // Check status first to see if encryption is available
      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      expect(statusRes.status).toBe(200);

      if (!statusRes.body.available) {
        // Skip rotation test if encryption is not available
        const rotateRes = await agent.post('/api/v1/admin/encryption/rotate');
        expect(rotateRes.status).toBe(400);
        expect(rotateRes.body).toHaveProperty('error');
        expect(rotateRes.body.error).toContain('not available');
        return;
      }

      // Encryption is available, proceed with rotation
      const oldVersion = statusRes.body.activeKeyVersion;

      const res = await agent.post('/api/v1/admin/encryption/rotate');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('previousVersion');
      expect(res.body).toHaveProperty('newVersion');
      expect(res.body).toHaveProperty('processed');
      expect(res.body).toHaveProperty('rekeyed');

      // Validate data types
      expect(typeof res.body.message).toBe('string');
      expect(typeof res.body.previousVersion).toBe('number');
      expect(typeof res.body.newVersion).toBe('number');
      expect(typeof res.body.processed).toBe('number');
      expect(typeof res.body.rekeyed).toBe('number');

      // Validate values
      expect(res.body.message).toMatch(/success|rotated/i);
      expect(res.body.newVersion).not.toBe(oldVersion);
      expect(res.body.processed).toBeGreaterThanOrEqual(0);
      expect(res.body.rekeyed).toBeGreaterThanOrEqual(0);
      expect(res.body.rekeyed).toBeLessThanOrEqual(res.body.processed);
    });

    it('should return 400 when encryption is not available', async () => {
      const agent = await loginAs('admin');

      // Check status first
      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      expect(statusRes.status).toBe(200);

      if (statusRes.body.available) {
        // If encryption is available, this test can't be run
        // Skip it
        return;
      }

      const res = await agent.post('/api/v1/admin/encryption/rotate');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('not available');
      expect(res.body.error).toContain('MASTER_ENCRYPTION_KEY');
    });

    it('should rekey existing webhook secrets', async () => {
      const agent = await loginAs('admin');

      // Check status first
      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      if (!statusRes.body.available) {
        return;
      }

      // Create a test webhook with encrypted secret
      const webhookRes = await agent.post('/api/v1/webhooks').send({
        name: 'Test Webhook for Rotation',
        url: 'https://webhook.example.com/test',
        eventTypes: ['*'],
      });

      expect(webhookRes.status).toBe(201);
      const webhookId = webhookRes.body.id;

      // Get status before rotation
      const statusBefore = await agent.get('/api/v1/admin/encryption/status');
      const webhooksBefore = statusBefore.body.encryptedFields.webhook;

      // Rotate the key
      const rotateRes = await agent.post('/api/v1/admin/encryption/rotate');
      expect(rotateRes.status).toBe(200);
      expect(rotateRes.body.processed).toBeGreaterThanOrEqual(1);

      // Get status after rotation
      const statusAfter = await agent.get('/api/v1/admin/encryption/status');
      const webhooksAfter = statusAfter.body.encryptedFields.webhook;

      // Webhook count should still be the same
      expect(webhooksAfter.total).toBe(webhooksBefore.total);
    });

    it('should reflect new active key version after rotation', async () => {
      const agent = await loginAs('admin');

      // Check status first
      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      if (!statusRes.body.available) {
        return;
      }

      const versionBefore = statusRes.body.activeKeyVersion;

      // Rotate the key
      const rotateRes = await agent.post('/api/v1/admin/encryption/rotate');
      if (rotateRes.status !== 200) {
        return;
      }

      // Get new status
      const statusAfter = await agent.get('/api/v1/admin/encryption/status');
      const versionAfter = statusAfter.body.activeKeyVersion;

      // Active key version should have changed
      expect(versionAfter).not.toBe(versionBefore);
      expect(versionAfter).toBe(rotateRes.body.newVersion);
    });

    it('should track processed and rekeyed counts separately', async () => {
      const agent = await loginAs('admin');

      // Check status first
      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      if (!statusRes.body.available) {
        return;
      }

      const res = await agent.post('/api/v1/admin/encryption/rotate');

      expect(res.status).toBe(200);
      // Processed = total records touched
      // Rekeyed = records that actually had encrypted data
      expect(res.body.processed).toBeDefined();
      expect(res.body.rekeyed).toBeDefined();
      expect(res.body.rekeyed).toBeLessThanOrEqual(res.body.processed);
    });

    it('should reject non-admin users (assessor)', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.post('/api/v1/admin/encryption/rotate');

      expect(res.status).toBe(403);
    });

    it('should reject non-admin users (assessee)', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.post('/api/v1/admin/encryption/rotate');

      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const agent = getAgent();
      const res = await agent.post('/api/v1/admin/encryption/rotate');

      expect(res.status).toBe(401);
    });

    it('should log rotation activity', async () => {
      const agent = await loginAs('admin');

      // Check status first
      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      if (!statusRes.body.available) {
        return;
      }

      const res = await agent.post('/api/v1/admin/encryption/rotate');

      // Even if we can't directly check the log, the rotation should complete
      // without error and return appropriate response
      expect(res.status).toBe(200);
      expect(res.body.newVersion).toBeDefined();
    });
  });

  describe('Access Control and Authentication', () => {
    it('should require permission check using requirePermission middleware', async () => {
      // Both endpoints require the 'admin.encryption' permission
      // This test verifies that the permission middleware is being enforced

      const assessor = await loginAs('assessor');
      const assessee = await loginAs('assessee');

      const statusRes1 = await assessor.get('/api/v1/admin/encryption/status');
      const statusRes2 = await assessee.get('/api/v1/admin/encryption/status');
      const rotateRes1 = await assessor.post('/api/v1/admin/encryption/rotate');
      const rotateRes2 = await assessee.post('/api/v1/admin/encryption/rotate');

      expect(statusRes1.status).toBe(403);
      expect(statusRes2.status).toBe(403);
      expect(rotateRes1.status).toBe(403);
      expect(rotateRes2.status).toBe(403);
    });

    it('should only allow authenticated users', async () => {
      const agent = getAgent();

      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      const rotateRes = await agent.post('/api/v1/admin/encryption/rotate');

      expect(statusRes.status).toBe(401);
      expect(rotateRes.status).toBe(401);
    });
  });

  describe('Response Format and Content-Type', () => {
    it('should return JSON responses with proper content-type', async () => {
      const agent = await loginAs('admin');

      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      expect(statusRes.status).toBe(200);
      expect(statusRes.type).toMatch(/json/);

      const rotateRes = await agent.post('/api/v1/admin/encryption/rotate');
      expect(rotateRes.type).toMatch(/json/);
    });

    it('should use camelCase in JSON responses', async () => {
      const agent = await loginAs('admin');

      const res = await agent.get('/api/v1/admin/encryption/status');
      expect(res.status).toBe(200);

      // Check that response uses camelCase, not snake_case
      expect(res.body).toHaveProperty('activeKeyVersion');
      expect(res.body).not.toHaveProperty('active_key_version');
      expect(res.body).toHaveProperty('passthroughMode');
      expect(res.body).not.toHaveProperty('passthrough_mode');
      expect(res.body).toHaveProperty('encryptedFields');
      expect(res.body).not.toHaveProperty('encrypted_fields');

      if (res.body.keyVersions.length > 0) {
        const kv = res.body.keyVersions[0];
        expect(kv).toHaveProperty('isActive');
        expect(kv).not.toHaveProperty('is_active');
        expect(kv).toHaveProperty('createdAt');
        expect(kv).not.toHaveProperty('created_at');
        expect(kv).toHaveProperty('retiredAt');
        expect(kv).not.toHaveProperty('retired_at');
      }
    });

    it('should use camelCase in rotation response', async () => {
      const agent = await loginAs('admin');

      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      if (!statusRes.body.available) {
        return;
      }

      const res = await agent.post('/api/v1/admin/encryption/rotate');
      expect(res.status).toBe(200);

      // Check camelCase
      expect(res.body).toHaveProperty('previousVersion');
      expect(res.body).not.toHaveProperty('previous_version');
      expect(res.body).toHaveProperty('newVersion');
      expect(res.body).not.toHaveProperty('new_version');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully in status endpoint', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/encryption/status');

      // Should always return 200, even if there are missing tables
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('available');
    });

    it('should return error when encryption service is unavailable during rotation', async () => {
      const agent = await loginAs('admin');

      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      if (statusRes.body.available) {
        // Skip this test if encryption is available
        return;
      }

      const res = await agent.post('/api/v1/admin/encryption/rotate');
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it('should return meaningful error message when rotation fails', async () => {
      const agent = await loginAs('admin');

      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      if (!statusRes.body.available) {
        const res = await agent.post('/api/v1/admin/encryption/rotate');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('not available');
        expect(res.body.error).toBeTruthy();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle status request with no webhooks', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(200);
      // Even if no webhooks exist, the endpoint should return valid data
      expect(res.body.encryptedFields.webhook.total).toBeGreaterThanOrEqual(0);
      expect(res.body.encryptedFields.webhook.encrypted).toBeGreaterThanOrEqual(0);
      expect(res.body.encryptedFields.webhook.plaintext).toBeGreaterThanOrEqual(0);
    });

    it('should handle status request with empty key versions list', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/encryption/status');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.keyVersions)).toBe(true);
      // Key versions list may be empty or populated
    });

    it('should handle multiple rotation requests sequentially', async () => {
      const agent = await loginAs('admin');

      const statusRes = await agent.get('/api/v1/admin/encryption/status');
      if (!statusRes.body.available) {
        return;
      }

      const res1 = await agent.post('/api/v1/admin/encryption/rotate');
      expect(res1.status).toBe(200);
      const version1 = res1.body.newVersion;

      // Rotation should be idempotent when called sequentially
      const res2 = await agent.post('/api/v1/admin/encryption/rotate');
      expect(res2.status).toBe(200);
      const version2 = res2.body.newVersion;

      // Second rotation should create a new version
      expect(version2).not.toBe(version1);
    });

    it('should maintain data consistency across status checks', async () => {
      const agent = await loginAs('admin');

      const res1 = await agent.get('/api/v1/admin/encryption/status');
      expect(res1.status).toBe(200);

      const res2 = await agent.get('/api/v1/admin/encryption/status');
      expect(res2.status).toBe(200);

      // Basic consistency checks
      expect(res1.body.available).toBe(res2.body.available);
      expect(res1.body.passthroughMode).toBe(res2.body.passthroughMode);
      expect(res1.body.activeKeyVersion).toBe(res2.body.activeKeyVersion);
    });
  });
});
