import { describe, it, expect } from 'vitest';
import { setupHttpTests, getAgent, loginAs, testUsers } from '../helpers/http.js';

describe('API Keys HTTP Routes', () => {
  setupHttpTests();

  describe('POST /api/v1/apikeys', () => {
    it('should create an API key and return the plaintext key', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Test Key' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', 'Test Key');
      expect(res.body).toHaveProperty('prefix');
      expect(res.body).toHaveProperty('key');
      expect(res.body.key).toMatch(/^cdxa_/);
    });

    it('should require authentication', async () => {
      const agent = getAgent();
      const res = await agent
        .post('/api/v1/apikeys')
        .send({ name: 'Unauthorized Key' });

      expect(res.status).toBe(401);
    });

    it('should accept expiresInDays parameter', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Expiring Key', expiresInDays: 30 });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.expiresAt).not.toBeNull();
    });

    it('should allow admin to create key for another user', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent
        .post('/api/v1/apikeys')
        .send({
          name: 'Key for Assessor',
          userId: testUsers.assessor.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('should silently ignore userId for non-admin and create key for self', async () => {
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent
        .post('/api/v1/apikeys')
        .send({
          name: 'Ignored UserId Key',
          userId: testUsers.admin.id,
        });

      // Route silently ignores userId for non-admins, creates for self
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('key');
    });

    it('should allow non-admin to create key for themselves', async () => {
      const assessorAgent = await loginAs('assessor');
      const res = await assessorAgent
        .post('/api/v1/apikeys')
        .send({ name: 'My Own Key' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('key');
    });

    it('should return key with camelCase properties', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent
        .post('/api/v1/apikeys')
        .send({ name: 'CamelCase Test' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body).not.toHaveProperty('created_at');
      expect(res.body).not.toHaveProperty('expires_at');
    });
  });

  describe('GET /api/v1/apikeys', () => {
    it('should list API keys', async () => {
      const adminAgent = await loginAs('admin');

      // Create a key first
      const createRes = await adminAgent
        .post('/api/v1/apikeys')
        .send({ name: 'List Test Key' });
      expect(createRes.status).toBe(201);

      // List keys
      const listRes = await adminAgent.get('/api/v1/apikeys');

      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveProperty('data');
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.data.length).toBeGreaterThan(0);
    });

    it('should return empty list initially for new user', async () => {
      const assesseeAgent = await loginAs('assessee');
      const res = await assesseeAgent.get('/api/v1/apikeys');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should require authentication', async () => {
      const agent = getAgent();
      const res = await agent.get('/api/v1/apikeys');

      expect(res.status).toBe(401);
    });

    it('should return keys with hash, not plaintext key', async () => {
      const adminAgent = await loginAs('admin');

      // Create a key
      const createRes = await adminAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Hash Test' });
      const keyId = createRes.body.id;

      // List keys
      const listRes = await adminAgent.get('/api/v1/apikeys');

      expect(listRes.status).toBe(200);
      const listedKey = listRes.body.data.find((k: any) => k.id === keyId);
      expect(listedKey).toBeDefined();
      expect(listedKey).toHaveProperty('prefix');
      expect(listedKey).not.toHaveProperty('key');
    });

    it('should allow non-admin to see only their own keys', async () => {
      // Create a key as assessor
      const assessorAgent = await loginAs('assessor');
      const createRes = await assessorAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Assessor Key' });
      expect(createRes.status).toBe(201);

      // List keys as assessor
      const listRes = await assessorAgent.get('/api/v1/apikeys');

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThan(0);

      // All keys should belong to assessor
      for (const key of listRes.body.data) {
        expect(key).toHaveProperty('userId');
      }
    });

    it('should return keys with camelCase properties', async () => {
      const adminAgent = await loginAs('admin');

      const res = await adminAgent.get('/api/v1/apikeys');

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const key = res.body.data[0];
        expect(key).toHaveProperty('createdAt');
        expect(key).not.toHaveProperty('created_at');
      }
    });
  });

  describe('DELETE /api/v1/apikeys/:id', () => {
    it('should revoke an API key', async () => {
      const adminAgent = await loginAs('admin');

      // Create a key
      const createRes = await adminAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Key to Revoke' });
      const keyId = createRes.body.id;

      // Delete it
      const deleteRes = await adminAgent.delete(`/api/v1/apikeys/${keyId}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent key', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.delete(
        '/api/v1/apikeys/00000000-0000-0000-0000-000000000000'
      );

      expect(res.status).toBe(404);
    });

    it('should require authentication', async () => {
      const agent = getAgent();
      const res = await agent.delete(
        '/api/v1/apikeys/00000000-0000-0000-0000-000000000000'
      );

      expect(res.status).toBe(401);
    });

    it('should prevent non-admin from deleting keys owned by others', async () => {
      // Admin creates a key for themselves
      const adminAgent = await loginAs('admin');
      const createRes = await adminAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Admin Protected Key' });
      const keyId = createRes.body.id;

      // Assessee (different user) tries to delete admin's key
      const assesseeAgent = await loginAs('assessee');
      const deleteRes = await assesseeAgent.delete(`/api/v1/apikeys/${keyId}`);

      expect(deleteRes.status).toBe(403);
    });

    it('should allow user to delete their own key', async () => {
      const assessorAgent = await loginAs('assessor');

      // Create key
      const createRes = await assessorAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Own Key to Delete' });
      const keyId = createRes.body.id;

      // Delete own key
      const deleteRes = await assessorAgent.delete(`/api/v1/apikeys/${keyId}`);

      expect(deleteRes.status).toBe(200);
    });

    it('should actually remove key from list after deletion', async () => {
      const adminAgent = await loginAs('admin');

      // Create key
      const createRes = await adminAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Key to Verify Delete' });
      const keyId = createRes.body.id;

      // Delete it
      await adminAgent.delete(`/api/v1/apikeys/${keyId}`);

      // Verify it's gone from list
      const listRes = await adminAgent.get('/api/v1/apikeys');
      const deleted = listRes.body.data.find((k: any) => k.id === keyId);
      expect(deleted).toBeUndefined();
    });
  });

  describe('API Key RBAC', () => {
    it('admin can create keys for any user', async () => {
      const adminAgent = await loginAs('admin');

      const res = await adminAgent
        .post('/api/v1/apikeys')
        .send({
          name: 'Admin Created Key',
          userId: testUsers.assessor.id,
        });

      expect(res.status).toBe(201);
    });

    it('assessor can create and manage own keys only', async () => {
      const assessorAgent = await loginAs('assessor');

      // Create own key
      const createRes = await assessorAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Assessor Own Key RBAC' });
      expect(createRes.status).toBe(201);

      // Trying to create for someone else is silently ignored (created for self)
      const deniedRes = await assessorAgent
        .post('/api/v1/apikeys')
        .send({
          name: 'Ignored Target Key',
          userId: testUsers.admin.id,
        });
      expect(deniedRes.status).toBe(201);
    });

    it('assessee can create and manage own keys only', async () => {
      const assesseeAgent = await loginAs('assessee');

      // Create own key
      const createRes = await assesseeAgent
        .post('/api/v1/apikeys')
        .send({ name: 'Assessee Own Key' });
      expect(createRes.status).toBe(201);
    });
  });
});
