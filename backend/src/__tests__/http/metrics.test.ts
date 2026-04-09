/**
 * HTTP integration tests for the Prometheus metrics endpoint (spec 007).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { setupHttpTests, loginAs } from '../helpers/http.js';

describe('Prometheus Metrics Endpoint', () => {
  setupHttpTests();

  // -----------------------------------------------------------------------
  // GET /metrics
  // -----------------------------------------------------------------------

  describe('GET /metrics', () => {
    it('should return metrics in Prometheus exposition format', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');
      const res = await supertest(getBaseUrl()).get('/metrics');

      expect(res.status).toBe(200);
      // Prometheus content type
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      // Should contain default Node.js metrics
      expect(res.text).toContain('process_cpu');
      // Should contain our custom prefix
      expect(res.text).toContain('cdxa_');
    });

    it('should contain HTTP request metrics', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      // Make a few requests first to generate metrics
      const agent = await loginAs('admin');
      await agent.get('/api/v1/projects');
      await agent.get('/api/v1/standards');

      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('cdxa_http_requests_total');
      expect(res.text).toContain('cdxa_http_request_duration_seconds');
    });

    it('should contain domain gauge metrics', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      // Trigger a domain gauge refresh
      const { refreshDomainGauges } = await import('../../metrics/index.js');
      await refreshDomainGauges();

      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('cdxa_users_total');
    });

    it('should contain authentication metrics', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      // The loginAs call in setupHttpTests generates auth_login_total metrics
      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('cdxa_auth_login_total');
    });

    it('should contain notification channel metric definitions', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);
      // These may have 0 values but should still be declared in HELP text
      expect(res.text).toContain('cdxa_webhook_deliveries_total');
      expect(res.text).toContain('cdxa_email_deliveries_total');
      expect(res.text).toContain('cdxa_chat_deliveries_total');
      expect(res.text).toContain('cdxa_events_emitted_total');
    });

    it('should be parseable as valid Prometheus exposition format', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);

      // Basic exposition format validation: lines should be either
      // comments (starting with #), metric lines, or empty
      const lines = res.text.split('\n').filter((l: string) => l.trim().length > 0);
      for (const line of lines) {
        const isComment = line.startsWith('#');
        // Metric lines: name{labels} value [timestamp]
        // Allow for scientific notation, NaN, +Inf, -Inf
        const isMetric = /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})?\s+/.test(line);
        expect(isComment || isMetric).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Bearer Token Auth
  // -----------------------------------------------------------------------

  describe('Bearer token authentication', () => {
    it('should accept requests without token when METRICS_TOKEN is not set', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      // In test env, METRICS_TOKEN is not set (empty string default)
      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Health endpoint simplification
  // -----------------------------------------------------------------------

  describe('GET /api/health (simplified)', () => {
    it('should return minimal health for unauthenticated requests', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      const res = await supertest(getBaseUrl()).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.timestamp).toBeDefined();
      // Should NOT contain detailed system metrics
      expect(res.body.memory).toBeUndefined();
      expect(res.body.system).toBeUndefined();
      expect(res.body.disk).toBeUndefined();
    });

    it('should return version, uptime, and database status for authenticated requests', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.version).toBeDefined();
      expect(res.body.uptime).toBeDefined();
      expect(res.body.database).toBe('connected');
      // Should NOT contain old detailed metrics
      expect(res.body.memory).toBeUndefined();
      expect(res.body.system).toBeUndefined();
      expect(res.body.disk).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Route label normalization
  // -----------------------------------------------------------------------

  describe('Route label normalization', () => {
    it('should use Express route patterns not actual paths', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      // Hit a parameterized route
      const agent = await loginAs('admin');
      await agent.get('/api/v1/projects/00000000-0000-0000-0000-000000000000');

      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);

      // Should contain the route pattern, not the actual UUID
      expect(res.text).toContain('/api/v1/projects/:id');
    });
  });

  // -----------------------------------------------------------------------
  // Admin integrations status includes metrics
  // -----------------------------------------------------------------------

  describe('GET /api/v1/admin/integrations/status (metrics field)', () => {
    it('should include metrics status', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/integrations/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('metrics');
      expect(res.body.metrics).toHaveProperty('enabled');
      expect(res.body.metrics).toHaveProperty('prefix');
      expect(res.body.metrics).toHaveProperty('domainRefreshInterval');
      expect(res.body.metrics).toHaveProperty('tokenConfigured');
      expect(res.body.metrics.prefix).toBe('cdxa_');
    });
  });

  // -----------------------------------------------------------------------
  // Auth login counter
  // -----------------------------------------------------------------------

  describe('Auth login counter', () => {
    it('should increment on successful login', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      // Login
      await loginAs('admin');

      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('cdxa_auth_login_total{method="local",result="success"');
    });

    it('should increment on failed login', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');

      // Attempt a bad login
      await supertest(getBaseUrl())
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent', password: 'badpassword1' });

      const res = await supertest(getBaseUrl()).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('cdxa_auth_login_total{method="local",result="failure"');
    });
  });
});
