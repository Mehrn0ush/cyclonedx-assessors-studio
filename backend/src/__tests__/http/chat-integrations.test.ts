/**
 * HTTP integration tests for chat integrations management API (spec 006).
 */

import { describe, it, expect } from 'vitest';
import { setupHttpTests, loginAs } from '../helpers/http.js';

describe('Chat Integrations HTTP Routes', () => {
  setupHttpTests();

  // -----------------------------------------------------------------------
  // GET /api/v1/integrations/chat
  // -----------------------------------------------------------------------

  describe('GET /api/v1/integrations/chat', () => {
    it('should return empty list initially', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/integrations/chat');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('should reject non-admin users', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.get('/api/v1/integrations/chat');
      expect(res.status).toBe(403);
    });

    it('should reject unauthenticated requests', async () => {
      const { default: supertest } = await import('supertest');
      const { getBaseUrl } = await import('../helpers/http.js');
      const res = await supertest(getBaseUrl()).get('/api/v1/integrations/chat');
      expect(res.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/integrations/chat
  // -----------------------------------------------------------------------

  describe('POST /api/v1/integrations/chat', () => {
    it('should create a Slack integration', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/integrations/chat').send({
        name: 'Security Team Slack',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/test',
        eventCategories: ['assessment', 'evidence'],
        channelName: '#security-alerts',
      });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Security Team Slack');
      expect(res.body.platform).toBe('slack');
      expect(res.body.id).toBeDefined();
      expect(res.body.isActive).toBe(true);
    });

    it('should reject invalid Slack webhook URL', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/integrations/chat').send({
        name: 'Bad Slack',
        platform: 'slack',
        webhookUrl: 'https://example.com/not-slack',
        eventCategories: ['assessment'],
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid webhook URL');
    });

    it('should create a Teams integration', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/integrations/chat').send({
        name: 'Dev Team',
        platform: 'teams',
        webhookUrl: 'https://org.webhook.office.com/webhookb2/test',
        eventCategories: ['assessment'],
      });

      expect(res.status).toBe(201);
      expect(res.body.platform).toBe('teams');
    });

    it('should reject invalid Teams webhook URL', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/integrations/chat').send({
        name: 'Bad Teams',
        platform: 'teams',
        webhookUrl: 'https://example.com/webhook',
        eventCategories: ['assessment'],
      });

      expect(res.status).toBe(400);
    });

    it('should create a Mattermost integration', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/integrations/chat').send({
        name: 'MM Alerts',
        platform: 'mattermost',
        webhookUrl: 'https://mm.example.com/hooks/xxx',
        eventCategories: ['evidence', 'attestation'],
      });

      expect(res.status).toBe(201);
      expect(res.body.platform).toBe('mattermost');
    });

    it('should reject missing required fields', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/integrations/chat').send({
        name: 'No URL',
        platform: 'slack',
      });

      expect(res.status).toBe(400);
    });

    it('should reject non-admin users', async () => {
      const agent = await loginAs('assessor');
      const res = await agent.post('/api/v1/integrations/chat').send({
        name: 'Test',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        eventCategories: ['assessment'],
      });
      expect(res.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/integrations/chat/:id
  // -----------------------------------------------------------------------

  describe('GET /api/v1/integrations/chat/:id', () => {
    it('should return integration details with delivery stats', async () => {
      const agent = await loginAs('admin');

      // Create one first
      const createRes = await agent.post('/api/v1/integrations/chat').send({
        name: 'Detail Test',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/detail',
        eventCategories: ['assessment'],
      });

      const id = createRes.body.id;
      const res = await agent.get(`/api/v1/integrations/chat/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Detail Test');
      expect(res.body).toHaveProperty('deliveryStats');
      expect(res.body.deliveryStats.totalDeliveries).toBe(0);
    });

    it('should return 404 for nonexistent integration', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/integrations/chat/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v1/integrations/chat/:id
  // -----------------------------------------------------------------------

  describe('PUT /api/v1/integrations/chat/:id', () => {
    it('should update an integration', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/integrations/chat').send({
        name: 'Update Test',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/update',
        eventCategories: ['assessment'],
      });

      const id = createRes.body.id;
      const res = await agent.put(`/api/v1/integrations/chat/${id}`).send({
        name: 'Updated Name',
        eventCategories: ['assessment', 'evidence', 'attestation'],
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
    });

    it('should reject invalid webhook URL on update', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/integrations/chat').send({
        name: 'URL Validate',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/valid',
        eventCategories: ['assessment'],
      });

      const id = createRes.body.id;
      const res = await agent.put(`/api/v1/integrations/chat/${id}`).send({
        webhookUrl: 'https://example.com/not-slack',
      });

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v1/integrations/chat/:id
  // -----------------------------------------------------------------------

  describe('DELETE /api/v1/integrations/chat/:id', () => {
    it('should delete an integration', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/integrations/chat').send({
        name: 'Delete Test',
        platform: 'mattermost',
        webhookUrl: 'https://mm.example.com/hooks/delete',
        eventCategories: ['assessment'],
      });

      const id = createRes.body.id;
      const delRes = await agent.delete(`/api/v1/integrations/chat/${id}`);
      expect(delRes.status).toBe(200);

      // Verify it's gone
      const getRes = await agent.get(`/api/v1/integrations/chat/${id}`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for nonexistent integration', async () => {
      const agent = await loginAs('admin');
      const res = await agent.delete('/api/v1/integrations/chat/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v1/integrations/chat/:id/enable
  // -----------------------------------------------------------------------

  describe('POST /api/v1/integrations/chat/:id/enable', () => {
    it('should re-enable an integration', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/integrations/chat').send({
        name: 'Enable Test',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/enable',
        eventCategories: ['assessment'],
      });

      const id = createRes.body.id;
      const res = await agent.post(`/api/v1/integrations/chat/${id}/enable`);
      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(true);
      expect(res.body.consecutiveFailures).toBe(0);
    });

    it('should return 404 for nonexistent integration', async () => {
      const agent = await loginAs('admin');
      const res = await agent.post('/api/v1/integrations/chat/00000000-0000-0000-0000-000000000000/enable');
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v1/integrations/chat/:id/deliveries
  // -----------------------------------------------------------------------

  describe('GET /api/v1/integrations/chat/:id/deliveries', () => {
    it('should return paginated delivery log', async () => {
      const agent = await loginAs('admin');

      const createRes = await agent.post('/api/v1/integrations/chat').send({
        name: 'Delivery Test',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/deliveries',
        eventCategories: ['assessment'],
      });

      const id = createRes.body.id;
      const res = await agent.get(`/api/v1/integrations/chat/${id}/deliveries`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('offset');
    });

    it('should return 404 for nonexistent integration', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/integrations/chat/00000000-0000-0000-0000-000000000000/deliveries');
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Platform filtering
  // -----------------------------------------------------------------------

  describe('Platform query filtering', () => {
    it('should filter integrations by platform', async () => {
      const agent = await loginAs('admin');

      // Create one Slack and one Mattermost
      await agent.post('/api/v1/integrations/chat').send({
        name: 'Filter Slack',
        platform: 'slack',
        webhookUrl: 'https://hooks.slack.com/services/T/B/filter',
        eventCategories: ['assessment'],
      });
      await agent.post('/api/v1/integrations/chat').send({
        name: 'Filter MM',
        platform: 'mattermost',
        webhookUrl: 'https://mm.example.com/hooks/filter',
        eventCategories: ['evidence'],
      });

      const slackRes = await agent.get('/api/v1/integrations/chat?platform=slack');
      expect(slackRes.status).toBe(200);
      for (const i of slackRes.body.data) {
        expect(i.platform).toBe('slack');
      }

      const mmRes = await agent.get('/api/v1/integrations/chat?platform=mattermost');
      expect(mmRes.status).toBe(200);
      for (const i of mmRes.body.data) {
        expect(i.platform).toBe('mattermost');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Integrations status includes chat platforms
  // -----------------------------------------------------------------------

  describe('GET /api/v1/admin/integrations/status (chat fields)', () => {
    it('should include slack, teams, and mattermost status', async () => {
      const agent = await loginAs('admin');
      const res = await agent.get('/api/v1/admin/integrations/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('slack');
      expect(res.body.slack).toHaveProperty('enabled');
      expect(res.body.slack).toHaveProperty('integrationCount');
      expect(res.body).toHaveProperty('teams');
      expect(res.body.teams).toHaveProperty('enabled');
      expect(res.body).toHaveProperty('mattermost');
      expect(res.body.mattermost).toHaveProperty('enabled');
    });
  });
});
