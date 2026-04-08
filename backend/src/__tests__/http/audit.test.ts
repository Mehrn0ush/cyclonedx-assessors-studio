import { describe, it, expect } from 'vitest';
import { setupHttpTests, getAgent, loginAs, testUsers } from '../helpers/http.js';
import { v4 as uuidv4 } from 'uuid';

describe('Audit HTTP Routes', () => {
  setupHttpTests();

  describe('GET /api/v1/audit', () => {
    it('should require authentication', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/audit');

      expect(res.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.get('/api/v1/audit');

      expect(res.status).toBe(403);
    });

    it('should return audit logs for admin', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
    });

    it('should return pagination info', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit');

      expect(res.status).toBe(200);
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('offset');
      expect(res.body.pagination).toHaveProperty('total');
    });

    it('should return logs with camelCase properties', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const log = res.body.data[0];
        expect(log).toHaveProperty('createdAt');
        expect(log).not.toHaveProperty('created_at');
      }
    });
  });

  describe('GET /api/v1/audit with filters', () => {
    it('should filter by entityType', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit?entityType=project');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should filter by entityId', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = uuidv4();
      const res = await adminAgent.get(`/api/v1/audit?entityId=${entityId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('should filter by userId', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get(
        `/api/v1/audit?userId=${testUsers.admin.id}`
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('should filter by action', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit?action=CREATE');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('should combine multiple filters', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get(
        `/api/v1/audit?entityType=project&action=CREATE&userId=${testUsers.admin.id}`
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('pagination');
    });
  });

  describe('GET /api/v1/audit/entity/:entityType/:entityId', () => {
    it('should require authentication', async () => {
      const agent = getAgent();
      const projectId = uuidv4();
      const res = await agent.get(`/api/v1/audit/entity/project/${projectId}`);

      expect(res.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const assessorAgent = await loginAs('assessor');
      const projectId = uuidv4();
      const res = await assessorAgent.get(
        `/api/v1/audit/entity/project/${projectId}`
      );

      expect(res.status).toBe(403);
    });

    it('should return filtered logs for entity', async () => {
      const adminAgent = await loginAs('admin');
      const projectId = uuidv4();
      const res = await adminAgent.get(`/api/v1/audit/entity/project/${projectId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
    });

    it('should return empty list for non-existent entity', async () => {
      const adminAgent = await loginAs('admin');
      const nonExistentId = uuidv4();
      const res = await adminAgent.get(
        `/api/v1/audit/entity/project/${nonExistentId}`
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should return logs with camelCase properties for entity endpoint', async () => {
      const adminAgent = await loginAs('admin');
      const projectId = uuidv4();
      const res = await adminAgent.get(`/api/v1/audit/entity/project/${projectId}`);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const log = res.body.data[0];
        expect(log).toHaveProperty('createdAt');
        expect(log).not.toHaveProperty('created_at');
        expect(log).toHaveProperty('entityType');
        expect(log).not.toHaveProperty('entity_type');
      }
    });

    it('should support different entity types', async () => {
      const adminAgent = await loginAs('admin');
      const entityId = uuidv4();

      const projectRes = await adminAgent.get(
        `/api/v1/audit/entity/project/${entityId}`
      );
      expect(projectRes.status).toBe(200);

      const standardRes = await adminAgent.get(
        `/api/v1/audit/entity/standard/${entityId}`
      );
      expect(standardRes.status).toBe(200);

      const assessmentRes = await adminAgent.get(
        `/api/v1/audit/entity/assessment/${entityId}`
      );
      expect(assessmentRes.status).toBe(200);
    });
  });

  describe('Audit log content structure', () => {
    it('should include required audit log fields', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const log = res.body.data[0];
        expect(log).toHaveProperty('id');
        expect(log).toHaveProperty('userId');
        expect(log).toHaveProperty('action');
        expect(log).toHaveProperty('entityType');
        expect(log).toHaveProperty('entityId');
        expect(log).toHaveProperty('createdAt');
      }
    });

    it('should have valid action values', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit');

      expect(res.status).toBe(200);
      const validActions = ['CREATE', 'UPDATE', 'DELETE', 'READ'];
      for (const log of res.body.data) {
        expect(validActions).toContain(log.action);
      }
    });
  });

  describe('Audit pagination', () => {
    it('should respect limit parameter', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBeDefined();
    });

    it('should respect offset parameter', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit?offset=0');

      expect(res.status).toBe(200);
      expect(res.body.pagination.offset).toBeDefined();
    });

    it('should return total count in pagination', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit');

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBeDefined();
      expect(typeof res.body.pagination.total).toBe('number');
    });
  });

  describe('RBAC for audit access', () => {
    it('admin can access all audit logs', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/audit');

      expect(res.status).toBe(200);
    });

    it('assessor cannot access audit logs', async () => {
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent.get('/api/v1/audit');

      expect(res.status).toBe(403);
    });

    it('assessee cannot access audit logs', async () => {
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.get('/api/v1/audit');

      expect(res.status).toBe(403);
    });

    it('only admin can access entity audit endpoint', async () => {
      const assessorAgent = await loginAs('assessor');
      const projectId = uuidv4();
      const res = await assessorAgent.get(
        `/api/v1/audit/entity/project/${projectId}`
      );

      expect(res.status).toBe(403);
    });
  });
});
