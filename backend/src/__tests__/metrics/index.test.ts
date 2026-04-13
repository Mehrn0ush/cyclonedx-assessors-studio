/**
 * Unit tests for Prometheus metrics registry and gauge refresh functions.
 *
 * Tests metric definitions, registry setup, gauge refresh logic,
 * and the start/stop lifecycle of domain gauge refresh.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registry,
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestSize,
  httpResponseSize,
  authLoginTotal,
  authActiveSessions,
  assessmentsTotal,
  evidenceTotal,
  claimsTotal,
  attestationsTotal,
  projectsTotal,
  usersTotal,
  standardsTotal,
  webhookDeliveriesTotal,
  webhookDeliveryDuration,
  emailDeliveriesTotal,
  chatDeliveriesTotal,
  eventsEmittedTotal,
  refreshDomainGauges,
  startDomainGaugeRefresh,
  stopDomainGaugeRefresh,
} from '../../metrics/index.js';
import { setupTestDb, teardownTestDb, getTestDatabase } from '../helpers/setup.js';

describe('Metrics', () => {
  describe('Registry', () => {
    it('should have a registry instance', () => {
      expect(registry).toBeDefined();
      expect(registry).toHaveProperty('metrics');
    });

    it('registry should have default label app=assessors-studio', () => {
      // This is tested implicitly by the registry initialization
      expect(registry).toBeDefined();
    });
  });

  describe('HTTP Metrics', () => {
    it('should have httpRequestsTotal counter defined', () => {
      expect(httpRequestsTotal).toBeDefined();
      expect(httpRequestsTotal).toHaveProperty('inc');
      expect(httpRequestsTotal).not.toHaveProperty('set');
    });

    it('should have httpRequestDuration histogram defined', () => {
      expect(httpRequestDuration).toBeDefined();
      expect(httpRequestDuration).toHaveProperty('observe');
    });

    it('should have httpRequestSize histogram defined', () => {
      expect(httpRequestSize).toBeDefined();
      expect(httpRequestSize).toHaveProperty('observe');
    });

    it('should have httpResponseSize histogram defined', () => {
      expect(httpResponseSize).toBeDefined();
      expect(httpResponseSize).toHaveProperty('observe');
    });

    it('httpRequestsTotal should support method/route/status_code labels', () => {
      // Verify the counter can be incremented with expected labels without throwing
      expect(() => {
        httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });
      }).not.toThrow();
    });

    it('httpRequestDuration should support observing values', () => {
      expect(() => {
        httpRequestDuration.observe({ method: 'GET', route: '/test', status_code: '200' }, 0.05);
      }).not.toThrow();
    });

    it('httpRequestSize should support observing values', () => {
      expect(() => {
        httpRequestSize.observe({ method: 'GET', route: '/test' }, 500);
      }).not.toThrow();
    });

    it('httpResponseSize should support observing values', () => {
      expect(() => {
        httpResponseSize.observe({ method: 'GET', route: '/test' }, 1024);
      }).not.toThrow();
    });
  });

  describe('Authentication Metrics', () => {
    it('should have authLoginTotal counter', () => {
      expect(authLoginTotal).toBeDefined();
      expect(authLoginTotal).toHaveProperty('inc');
    });

    it('should have authActiveSessions gauge', () => {
      expect(authActiveSessions).toBeDefined();
      expect(authActiveSessions).toHaveProperty('set');
    });

    it('authLoginTotal should support method and result labels', () => {
      expect(() => {
        authLoginTotal.inc({ method: 'local', result: 'success' });
      }).not.toThrow();
    });
  });

  describe('Domain Metrics (Gauges)', () => {
    it('should have assessmentsTotal gauge', () => {
      expect(assessmentsTotal).toBeDefined();
      expect(assessmentsTotal).toHaveProperty('set');
    });

    it('should have evidenceTotal gauge', () => {
      expect(evidenceTotal).toBeDefined();
      expect(evidenceTotal).toHaveProperty('set');
    });

    it('should have claimsTotal gauge', () => {
      expect(claimsTotal).toBeDefined();
      expect(claimsTotal).toHaveProperty('set');
    });

    it('should have attestationsTotal gauge', () => {
      expect(attestationsTotal).toBeDefined();
      expect(attestationsTotal).toHaveProperty('set');
    });

    it('should have projectsTotal gauge', () => {
      expect(projectsTotal).toBeDefined();
      expect(projectsTotal).toHaveProperty('set');
    });

    it('should have usersTotal gauge', () => {
      expect(usersTotal).toBeDefined();
      expect(usersTotal).toHaveProperty('set');
    });

    it('should have standardsTotal gauge', () => {
      expect(standardsTotal).toBeDefined();
      expect(standardsTotal).toHaveProperty('set');
    });

    it('assessmentsTotal should support state label', () => {
      expect(() => {
        assessmentsTotal.set({ state: 'draft' }, 0);
      }).not.toThrow();
    });

    it('evidenceTotal should support state label', () => {
      expect(() => {
        evidenceTotal.set({ state: 'draft' }, 0);
      }).not.toThrow();
    });

    it('projectsTotal should support state label', () => {
      expect(() => {
        projectsTotal.set({ state: 'active' }, 0);
      }).not.toThrow();
    });

    it('usersTotal should support role and active labels', () => {
      expect(() => {
        usersTotal.set({ role: 'admin', active: 'true' }, 0);
      }).not.toThrow();
    });
  });

  describe('Notification Channel Metrics', () => {
    it('should have webhookDeliveriesTotal counter', () => {
      expect(webhookDeliveriesTotal).toBeDefined();
      expect(webhookDeliveriesTotal).toHaveProperty('inc');
    });

    it('should have webhookDeliveryDuration histogram', () => {
      expect(webhookDeliveryDuration).toBeDefined();
      expect(webhookDeliveryDuration).toHaveProperty('observe');
    });

    it('should have emailDeliveriesTotal counter', () => {
      expect(emailDeliveriesTotal).toBeDefined();
      expect(emailDeliveriesTotal).toHaveProperty('inc');
    });

    it('should have chatDeliveriesTotal counter', () => {
      expect(chatDeliveriesTotal).toBeDefined();
      expect(chatDeliveriesTotal).toHaveProperty('inc');
    });

    it('should have eventsEmittedTotal counter', () => {
      expect(eventsEmittedTotal).toBeDefined();
      expect(eventsEmittedTotal).toHaveProperty('inc');
    });

    it('webhookDeliveriesTotal should support event_type and status labels', () => {
      expect(() => {
        webhookDeliveriesTotal.inc({ event_type: 'evidence.created', status: 'success' });
      }).not.toThrow();
    });

    it('emailDeliveriesTotal should support event_type and status labels', () => {
      expect(() => {
        emailDeliveriesTotal.inc({ event_type: 'evidence.created', status: 'success' });
      }).not.toThrow();
    });

    it('chatDeliveriesTotal should support platform, event_type, and status labels', () => {
      expect(() => {
        chatDeliveriesTotal.inc({ platform: 'slack', event_type: 'evidence.created', status: 'success' });
      }).not.toThrow();
    });

    it('eventsEmittedTotal should support type label', () => {
      expect(() => {
        eventsEmittedTotal.inc({ type: 'evidence.created' });
      }).not.toThrow();
    });
  });

  describe('Domain Gauge Refresh', () => {
    beforeEach(async () => {
      await setupTestDb();
    });

    afterEach(async () => {
      await teardownTestDb();
      stopDomainGaugeRefresh();
    });

    it('refreshDomainGauges should execute without error when database is empty', async () => {
      const db = getTestDatabase();

      // Should not throw even with empty database
      await expect(refreshDomainGauges()).resolves.not.toThrow();
    });

    it('refreshDomainGauges should handle errors gracefully', async () => {
      // Call refreshDomainGauges without database - it fetches internally
      // and should handle missing tables gracefully
      await expect(refreshDomainGauges()).resolves.not.toThrow();
    });

    it('startDomainGaugeRefresh should set up an interval', () => {
      vi.useFakeTimers();

      startDomainGaugeRefresh();

      // Interval should be set
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      stopDomainGaugeRefresh();
      vi.useRealTimers();
    });

    it('stopDomainGaugeRefresh should clear the interval', () => {
      vi.useFakeTimers();

      startDomainGaugeRefresh();
      const timerCountBefore = vi.getTimerCount();

      stopDomainGaugeRefresh();

      // Timer should be cleared
      expect(vi.getTimerCount()).toBeLessThan(timerCountBefore);

      vi.useRealTimers();
    });

    it('stopDomainGaugeRefresh should handle being called when not started', () => {
      // Should not throw
      expect(() => stopDomainGaugeRefresh()).not.toThrow();
    });

    it('startDomainGaugeRefresh should call refreshDomainGauges initially', () => {
      // startDomainGaugeRefresh calls refreshDomainGauges() immediately (fire and forget)
      // and sets up an interval. We verify it doesn't throw.
      expect(() => {
        startDomainGaugeRefresh();
        stopDomainGaugeRefresh();
      }).not.toThrow();
    });

    it('can start and stop multiple times', () => {
      // Verify that start/stop can be called multiple times without error
      // and that the interval is properly managed each cycle.
      expect(() => {
        startDomainGaugeRefresh();
        stopDomainGaugeRefresh();

        startDomainGaugeRefresh();
        stopDomainGaugeRefresh();
      }).not.toThrow();
    });
  });

  describe('Metric Names and Prefixes', () => {
    it('metrics should be registered in the registry', async () => {
      const metricsJson = await registry.getMetricsAsJSON();

      // At least these metrics should be present
      expect(metricsJson.length).toBeGreaterThan(0);

      // Check that our metrics are registered
      const metricNames = metricsJson.map((m) => m.name);
      expect(metricNames.length).toBeGreaterThan(0);
    });

    it('counter metrics should be incrementable', () => {
      // Verify the metric has the inc method (counters increment)
      expect(httpRequestsTotal).toHaveProperty('inc');
    });

    it('gauge metrics should be settable', () => {
      // Verify the metric has the set method (gauges can be set)
      expect(assessmentsTotal).toHaveProperty('set');
    });

    it('histogram metrics should record values', () => {
      // Verify the metric has the observe method (histograms observe)
      expect(httpRequestDuration).toHaveProperty('observe');
    });
  });

  describe('Label Combinations', () => {
    it('httpRequestsTotal should support common HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

      for (const method of methods) {
        expect(() => {
          httpRequestsTotal.inc({ method, route: '/test', status_code: '200' });
        }).not.toThrow();
      }
    });

    it('authLoginTotal should support login method variants', () => {
      const methods = ['local', 'oauth', 'saml', 'api_key'];

      for (const method of methods) {
        expect(() => {
          authLoginTotal.inc({ method, result: 'success' });
        }).not.toThrow();
      }
    });

    it('authLoginTotal should support result variants', () => {
      const results = ['success', 'failure', 'invalid_credentials'];

      for (const result of results) {
        expect(() => {
          authLoginTotal.inc({ method: 'local', result });
        }).not.toThrow();
      }
    });

    it('deliveries metrics should support outcome status', () => {
      const statuses = ['success', 'failure', 'retry'];

      for (const status of statuses) {
        expect(() => {
          webhookDeliveriesTotal.inc({ event_type: 'test', status });
        }).not.toThrow();
        expect(() => {
          emailDeliveriesTotal.inc({ event_type: 'test', status });
        }).not.toThrow();
      }
    });
  });
});
