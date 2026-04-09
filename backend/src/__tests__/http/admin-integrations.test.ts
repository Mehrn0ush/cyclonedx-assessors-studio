/**
 * HTTP integration tests for admin integrations endpoints.
 */

import { describe, it, expect } from 'vitest';
import { setupHttpTests, loginAs } from '../helpers/http.js';

describe('Admin Integrations HTTP Routes', () => {
  setupHttpTests();

  // -----------------------------------------------------------------------
  // GET /api/v1/admin/integrations/status
  // -----------------------------------------------------------------------

  describe('GET /api/v1/admin/integrations/status', () => {
    it('should return full integration status for admin', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/integrations/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('storage');
      expect(res.body).toHaveProperty('smtp');
      expect(res.body).toHaveProperty('webhook');

      // Storage should have provider and maxFileSize
      expect(res.body.storage).toHaveProperty('provider');
      expect(res.body.storage).toHaveProperty('maxFileSize');

      // SMTP should have enabled flag and config fields
      expect(res.body.smtp).toHaveProperty('enabled');
      expect(res.body.smtp).toHaveProperty('port');
      expect(res.body.smtp).toHaveProperty('userConfigured');
      expect(res.body.smtp).toHaveProperty('passConfigured');

      // Webhook should have enabled flag
      expect(res.body.webhook).toHaveProperty('enabled');
    });

    it('should reject non-admin users', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/admin/integrations/status');
      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');
      const res = await supertest(getBaseUrl()).get('/api/v1/admin/integrations/status');
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/admin/integrations/smtp
  // -----------------------------------------------------------------------

  describe('GET /api/v1/admin/integrations/smtp', () => {
    it('should return SMTP config for admin', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/integrations/smtp');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('enabled');
      expect(res.body).toHaveProperty('port');
      expect(res.body).toHaveProperty('secure');
      expect(res.body).toHaveProperty('userConfigured');
      expect(res.body).toHaveProperty('passConfigured');
      expect(res.body).toHaveProperty('tlsRejectUnauthorized');

      // In test environment SMTP is disabled by default
      expect(res.body.enabled).toBe(false);
    });

    it('should never expose the actual password', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/integrations/smtp');

      expect(res.status).toBe(200);
      // The response should contain passConfigured boolean, not the actual pass
      expect(typeof res.body.passConfigured).toBe('boolean');
      expect(res.body).not.toHaveProperty('pass');
      expect(res.body).not.toHaveProperty('password');
    });

    it('should reject non-admin users', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get('/api/v1/admin/integrations/smtp');
      expect(res.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/admin/integrations/test/smtp
  // -----------------------------------------------------------------------

  describe('POST /api/v1/admin/integrations/test/smtp', () => {
    it('should return 400 when SMTP is not enabled', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/admin/integrations/test/smtp');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not enabled');
    });

    it('should reject non-admin users', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.post('/api/v1/admin/integrations/test/smtp');
      expect(res.status).toBe(403);
    });
  });
});
