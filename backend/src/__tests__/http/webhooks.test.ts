/**
 * HTTP integration tests for webhook management API (spec 004).
 */

import { describe, it, expect } from 'vitest';
import { setupHttpTests, loginAs, getAgent, testUsers } from '../helpers/http.js';
import { getDatabase } from '../../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

describe('Webhooks HTTP Routes', () => {
  setupHttpTests();

  describe('POST /api/v1/webhooks', () => {
    it('should create a webhook as admin', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/webhooks').send({
        name: 'CI Pipeline',
        url: 'https://ci.example.com/webhook',
        eventTypes: ['assessment.state_changed', 'evidence.state_changed'],
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('CI Pipeline');
      expect(res.body.secret).toMatch(/^whsec_/);
      expect(res.body.eventTypes).toHaveLength(2);
      expect(res.body.isActive).toBe(true);
    });

    it('should reject non-admin users', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.post('/api/v1/webhooks').send({
        name: 'Test',
        url: 'https://example.com/hook',
        eventTypes: ['*'],
      });
      expect(res.status).toBe(403);
    });

    it('should reject invalid URL', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/webhooks').send({
        name: 'Bad',
        url: 'not-a-url',
        eventTypes: ['*'],
      });
      expect(res.status).toBe(400);
    });

    it('should reject missing event types', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/webhooks').send({
        name: 'No Events',
        url: 'https://example.com/hook',
        eventTypes: [],
      });
      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const agent = getAgent();
      const res = await agent.post('/api/v1/webhooks').send({
        name: 'Unauth',
        url: 'https://example.com/hook',
        eventTypes: ['*'],
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/webhooks', () => {
    it('should list all webhooks as admin', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/webhooks');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject non-admin users', async () => {
      const agent = await loginAs('assessee');
      const res = await agent.get('/api/v1/webhooks');
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/webhooks/:id', () => {
    it('should get webhook details with delivery stats', async () => {
      const agent = await loginAs('admin');

      // Create a webhook first
      const createRes = await agent.post('/api/v1/webhooks').send({
        name: 'Detail Test',
        url: 'https://detail.example.com/hook',
        eventTypes: ['*'],
      });

      const id = createRes.body.id;
      const res = await agent.get(`/api/v1/webhooks/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.name).toBe('Detail Test');
      expect(res.body.deliveryStats).toBeTruthy();
      expect(res.body.deliveryStats.totalDeliveries).toBeDefined();
    });

    it('should return 404 for non-existent webhook', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get(`/api/v1/webhooks/${uuidv4()}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/webhooks/:id', () => {
    it('should update webhook name and URL', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/webhooks').send({
        name: 'Before',
        url: 'https://before.example.com/hook',
        eventTypes: ['*'],
      });

      const res = await agent.put(`/api/v1/webhooks/${createRes.body.id}`).send({
        name: 'After',
        url: 'https://after.example.com/hook',
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('After');
      expect(res.body.url).toBe('https://after.example.com/hook');
      // Secret should NOT be in the response unless regenerated
      expect(res.body.secret).toBeUndefined();
    });

    it('should regenerate secret when requested', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/webhooks').send({
        name: 'Regen',
        url: 'https://regen.example.com/hook',
        eventTypes: ['*'],
      });

      const originalSecret = createRes.body.secret;

      const res = await agent.put(`/api/v1/webhooks/${createRes.body.id}`).send({
        regenerateSecret: true,
      });

      expect(res.status).toBe(200);
      expect(res.body.secret).toBeTruthy();
      expect(res.body.secret).not.toBe(originalSecret);
      expect(res.body.secret).toMatch(/^whsec_/);
    });
  });

  describe('DELETE /api/v1/webhooks/:id', () => {
    it('should delete webhook and its deliveries', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/webhooks').send({
        name: 'Delete Me',
        url: 'https://delete.example.com/hook',
        eventTypes: ['*'],
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.id).toBeTruthy();

      // Insert a delivery record so we can verify cascade delete
      const db = getDatabase();
      await db.insertInto('webhook_delivery').values({
        id: uuidv4(),
        webhook_id: createRes.body.id,
        event_id: 'evt_test',
        event_type: 'channel.test',
        status: 'success',
        attempt: 1,
        created_at: new Date(),
      }).execute();

      const delRes = await agent.delete(`/api/v1/webhooks/${createRes.body.id}`);
      expect(delRes.status).toBe(200);

      const getRes = await agent.get(`/api/v1/webhooks/${createRes.body.id}`);
      expect(getRes.status).toBe(404);

      // Verify delivery records were cascade deleted
      const deliveries = await db.selectFrom('webhook_delivery')
        .where('webhook_id', '=', createRes.body.id)
        .select('id')
        .execute();
      expect(deliveries).toHaveLength(0);
    });

    it('should return 404 for non-existent webhook', async () => {
      const agent = await loginAs('admin');
      const res = await agent.delete(`/api/v1/webhooks/${uuidv4()}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/webhooks/:id/enable', () => {
    it('should re-enable a disabled webhook and reset failures', async () => {
      const agent = await loginAs('admin');
      const db = getDatabase();

      const createRes = await agent.post('/api/v1/webhooks').send({
        name: 'Disabled Hook',
        url: 'https://disabled.example.com/hook',
        eventTypes: ['*'],
      });

      // Manually disable it
      await db.updateTable('webhook').set({
        is_active: false,
        consecutive_failures: 50,
      }).where('id', '=', createRes.body.id).execute();

      const res = await agent.post(`/api/v1/webhooks/${createRes.body.id}/enable`);

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
      expect(res.body.consecutiveFailures).toBe(0);

      // Verify in DB
      const webhook = await db.selectFrom('webhook')
        .where('id', '=', createRes.body.id)
        .selectAll()
        .executeTakeFirst();

      expect(webhook!.is_active).toBe(true);
      expect(webhook!.consecutive_failures).toBe(0);
    });
  });

  describe('POST /api/v1/webhooks/:id/test', () => {
    it('should emit a test event', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/webhooks').send({
        name: 'Test Hook',
        url: 'https://test.example.com/hook',
        eventTypes: ['channel.test'],
      });

      const res = await agent.post(`/api/v1/webhooks/${createRes.body.id}/test`);
      expect(res.status).toBe(200);
      expect(res.body.eventId).toBeTruthy();
      expect(res.body.eventId).toMatch(/^evt_/);
    });

    it('should return 404 for non-existent webhook', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post(`/api/v1/webhooks/${uuidv4()}/test`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/webhooks/:id/deliveries', () => {
    it('should return paginated delivery log', async () => {
      const agent = await loginAs('admin');
      const db = getDatabase();

      const createRes = await agent.post('/api/v1/webhooks').send({
        name: 'Delivery Log Hook',
        url: 'https://log.example.com/hook',
        eventTypes: ['*'],
      });

      const webhookId = createRes.body.id;

      // Insert some delivery records directly
      for (let i = 0; i < 3; i++) {
        await db.insertInto('webhook_delivery').values({
          id: uuidv4(),
          webhook_id: webhookId,
          event_id: `evt_log_${i}`,
          event_type: 'test.event',
          status: 'success',
          http_status: 200,
          attempt: 1,
          delivered_at: new Date(),
          created_at: new Date(),
        }).execute();
      }

      const res = await agent.get(`/api/v1/webhooks/${webhookId}/deliveries`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
      expect(res.body.pagination).toBeTruthy();
      expect(Number(res.body.pagination.total)).toBeGreaterThanOrEqual(3);
    });

    it('should return 404 for non-existent webhook', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get(`/api/v1/webhooks/${uuidv4()}/deliveries`);
      expect(res.status).toBe(404);
    });
  });
});
