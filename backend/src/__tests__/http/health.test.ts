import { describe, it, expect, beforeAll } from 'vitest';
import {
  setupHttpTests,
  getAgent,
  loginAs,
} from '../helpers/http.js';

describe('Health HTTP Routes', () => {
  setupHttpTests();

  describe('GET /api/health', () => {
    describe('Unauthenticated callers', () => {
      it('should return 200 with simple liveness probe when not authenticated', async () => {
        const res = await getAgent()
          .get('/api/health');

        expect(res.status).toBe(200);
      });

      it('should return healthy status for unauthenticated requests', async () => {
        const res = await getAgent()
          .get('/api/health');

        expect(res.body).toHaveProperty('status');
        expect(res.body.status).toBe('healthy');
      });

      it('should include timestamp in unauthenticated response', async () => {
        const res = await getAgent()
          .get('/api/health');

        expect(res.body).toHaveProperty('timestamp');
        expect(typeof res.body.timestamp).toBe('string');
        // Verify it's a valid ISO 8601 timestamp
        const date = new Date(res.body.timestamp);
        expect(date).not.toEqual(new Date('Invalid Date'));
      });

      it('should NOT include version in unauthenticated response', async () => {
        const res = await getAgent()
          .get('/api/health');

        expect(res.body).not.toHaveProperty('version');
      });

      it('should NOT include uptime in unauthenticated response', async () => {
        const res = await getAgent()
          .get('/api/health');

        expect(res.body).not.toHaveProperty('uptime');
      });

      it('should NOT include database status in unauthenticated response', async () => {
        const res = await getAgent()
          .get('/api/health');

        expect(res.body).not.toHaveProperty('database');
      });

      it('should contain only status and timestamp for unauthenticated requests', async () => {
        const res = await getAgent()
          .get('/api/health');

        const bodyKeys = Object.keys(res.body);
        expect(bodyKeys.length).toBe(2);
        expect(bodyKeys).toEqual(expect.arrayContaining(['status', 'timestamp']));
      });
    });

    describe('Authenticated callers (admin)', () => {
      it('should return 200 for authenticated admin requests', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        expect(res.status).toBe(200);
      });

      it('should return healthy status for authenticated requests', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        expect(res.body).toHaveProperty('status');
        expect(res.body.status).toBe('healthy');
      });

      it('should include timestamp in authenticated response', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        expect(res.body).toHaveProperty('timestamp');
        expect(typeof res.body.timestamp).toBe('string');
        const date = new Date(res.body.timestamp);
        expect(date).not.toEqual(new Date('Invalid Date'));
      });

      it('should include version in authenticated response', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        expect(res.body).toHaveProperty('version');
        expect(typeof res.body.version).toBe('string');
        // Version should match semver format or fallback
        expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
      });

      it('should include uptime in authenticated response', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        expect(res.body).toHaveProperty('uptime');
        expect(typeof res.body.uptime).toBe('string');
      });

      it('should format uptime with days, hours, minutes, seconds', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        const uptime = res.body.uptime;
        // Uptime should contain at least seconds (minimal format: "0s")
        expect(uptime).toMatch(/^\d+[smhd]/);
      });

      it('should include database status in authenticated response', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        expect(res.body).toHaveProperty('database');
        expect(typeof res.body.database).toBe('string');
      });

      it('should report database as connected or disconnected', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        const dbStatus = res.body.database;
        expect(['connected', 'disconnected']).toContain(dbStatus);
      });

      it('should have exactly 5 properties in authenticated response', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        const bodyKeys = Object.keys(res.body);
        expect(bodyKeys.length).toBe(5);
        expect(bodyKeys).toEqual(expect.arrayContaining([
          'status',
          'timestamp',
          'version',
          'uptime',
          'database',
        ]));
      });

      it('should report database as connected when DB is healthy', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        // In test environment with PGlite, database should be connected
        expect(res.body.database).toBe('connected');
      });
    });

    describe('Authenticated callers (assessor)', () => {
      it('should return full health info for authenticated assessor', async () => {
        const agent = await loginAs('assessor');
        const res = await agent.get('/api/health');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'healthy');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('version');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('database');
      });
    });

    describe('Authenticated callers (assessee)', () => {
      it('should return full health info for authenticated assessee', async () => {
        const agent = await loginAs('assessee');
        const res = await agent.get('/api/health');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'healthy');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('version');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('database');
      });
    });

    describe('Response structure and format', () => {
      it('should use camelCase for all property names', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        const hasSnakeCase = Object.keys(res.body).some(key => key.includes('_'));
        expect(hasSnakeCase).toBe(false);
      });

      it('should return JSON content type', async () => {
        const res = await getAgent()
          .get('/api/health');

        expect(res.type).toMatch(/json/i);
      });

      it('timestamp should be recent (within last minute)', async () => {
        const agent = await loginAs('admin');
        const res = await agent.get('/api/health');

        const timestamp = new Date(res.body.timestamp);
        const now = new Date();
        const diffMs = now.getTime() - timestamp.getTime();

        // Allow up to 1 minute difference
        expect(diffMs).toBeLessThan(60_000);
        expect(diffMs).toBeGreaterThanOrEqual(0);
      });

      it('uptime should be increasing across multiple calls', async () => {
        const agent = await loginAs('admin');

        const res1 = await agent.get('/api/health');
        const uptime1 = res1.body.uptime;

        // Wait a moment then call again
        await new Promise(resolve => setTimeout(resolve, 100));

        const res2 = await agent.get('/api/health');
        const uptime2 = res2.body.uptime;

        // Extract seconds from uptime string for comparison
        const getSeconds = (uptimeStr: string): number => {
          const match = uptimeStr.match(/(\d+)s$/);
          return match ? parseInt(match[1], 10) : 0;
        };

        const secs1 = getSeconds(uptime1);
        const secs2 = getSeconds(uptime2);

        // Second call should have same or more seconds
        expect(secs2).toBeGreaterThanOrEqual(secs1);
      });
    });

    describe('Multiple requests', () => {
      it('should handle sequential requests without error', async () => {
        const agent = await loginAs('admin');

        for (let i = 0; i < 5; i++) {
          const res = await agent.get('/api/health');
          expect(res.status).toBe(200);
          expect(res.body.status).toBe('healthy');
        }
      });

      it('should return consistent version across requests', async () => {
        const agent = await loginAs('admin');

        const res1 = await agent.get('/api/health');
        const version1 = res1.body.version;

        const res2 = await agent.get('/api/health');
        const version2 = res2.body.version;

        expect(version1).toBe(version2);
      });

      it('should return consistent status across requests', async () => {
        const agent = await loginAs('admin');

        const statuses = [];
        for (let i = 0; i < 3; i++) {
          const res = await agent.get('/api/health');
          statuses.push(res.body.status);
        }

        // All should be 'healthy'
        expect(new Set(statuses)).toEqual(new Set(['healthy']));
      });
    });

    describe('Edge cases', () => {
      it('should handle OPTIONS request gracefully', async () => {
        const res = await getAgent()
          .options('/api/health');

        // OPTIONS should be allowed or return 200
        expect([200, 204, 405]).toContain(res.status);
      });

      it('should not leak sensitive information to unauthenticated users', async () => {
        const res = await getAgent()
          .get('/api/health');

        const bodyStr = JSON.stringify(res.body);
        // Should not contain database details or version
        expect(bodyStr).not.toContain('password');
        expect(bodyStr).not.toContain('secret');
        expect(bodyStr).not.toContain('api_key');
      });

      it('should handle rapid consecutive requests', async () => {
        const agent = await loginAs('admin');

        const requests = [];
        for (let i = 0; i < 10; i++) {
          requests.push(agent.get('/api/health'));
        }

        const responses = await Promise.all(requests);
        responses.forEach(res => {
          expect(res.status).toBe(200);
          expect(res.body.status).toBe('healthy');
        });
      });
    });
  });

  describe('GET /api/health/ (with trailing slash)', () => {
    it('should work with trailing slash for unauthenticated users', async () => {
      const res = await getAgent()
        .get('/api/health/');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('should work with trailing slash for authenticated users', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/health/');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('database');
    });
  });
});
