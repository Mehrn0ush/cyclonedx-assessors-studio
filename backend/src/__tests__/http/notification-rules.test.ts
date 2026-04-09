/**
 * Integration tests for notification rules API.
 *
 * Tests system rule CRUD, user rule CRUD, validation, user profile updates,
 * and rule evaluation against events.
 */

import { describe, it, expect } from 'vitest';
import {
  setupHttpTests,
  loginAs,
} from '../helpers/http.js';

setupHttpTests();

describe('Notification Rules API', () => {
  describe('System Rules (Admin Only)', () => {
    it('should list system rules (admin only)', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.get('/api/v1/admin/notification-rules');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject non-admin listing system rules', async () => {
      const userAgent = await loginAs('assessee');
      const res = await userAgent.get('/api/v1/admin/notification-rules');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions');
    });

    it('should create a system rule', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.post('/api/v1/admin/notification-rules').send({
        name: 'Notify all on assessment state change',
        channel: 'in_app',
        eventTypes: ['assessment.state_changed'],
        filters: {},
        destination: {},
        enabled: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Notify all on assessment state change');
      expect(res.body.scope).toBe('system');
      expect(res.body.channel).toBe('in_app');
      // camelCase middleware transforms event_types -> eventTypes
      const eventTypes = Array.isArray(res.body.eventTypes)
        ? res.body.eventTypes
        : JSON.parse(res.body.eventTypes);
      expect(eventTypes).toEqual(['assessment.state_changed']);
    });

    it('should reject system rule with invalid event type', async () => {
      const adminAgent = await loginAs('admin');
      const res = await adminAgent.post('/api/v1/admin/notification-rules').send({
        name: 'Invalid rule',
        channel: 'in_app',
        eventTypes: ['invalid.event.type'],
        filters: {},
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid event type');
    });

    it('should get a system rule by id', async () => {
      const adminAgent = await loginAs('admin');

      // Create rule
      const createRes = await adminAgent.post('/api/v1/admin/notification-rules').send({
        name: 'Test rule',
        channel: 'email',
        eventTypes: ['evidence.state_changed'],
      });

      const ruleId = createRes.body.id;

      // Get rule
      const getRes = await adminAgent.get(`/api/v1/admin/notification-rules/${ruleId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(ruleId);
      expect(getRes.body.name).toBe('Test rule');
    });

    it('should update a system rule', async () => {
      const adminAgent = await loginAs('admin');

      // Create rule
      const createRes = await adminAgent.post('/api/v1/admin/notification-rules').send({
        name: 'Original name',
        channel: 'in_app',
        eventTypes: ['assessment.created'],
        enabled: true,
      });

      const ruleId = createRes.body.id;

      // Update rule
      const updateRes = await adminAgent.put(`/api/v1/admin/notification-rules/${ruleId}`).send({
        name: 'Updated name',
        enabled: false,
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('Updated name');
      expect(updateRes.body.enabled).toBe(false);
    });

    it('should delete a system rule', async () => {
      const adminAgent = await loginAs('admin');

      // Create rule
      const createRes = await adminAgent.post('/api/v1/admin/notification-rules').send({
        name: 'To delete',
        channel: 'slack',
        eventTypes: ['attestation.signed'],
      });

      const ruleId = createRes.body.id;

      // Delete rule
      const deleteRes = await adminAgent.delete(`/api/v1/admin/notification-rules/${ruleId}`);

      expect(deleteRes.status).toBe(204);

      // Verify deletion
      const getRes = await adminAgent.get(`/api/v1/admin/notification-rules/${ruleId}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('User Rules', () => {
    it('should list current user rules', async () => {
      const userAgent = await loginAs('assessee');
      const res = await userAgent.get('/api/v1/notification-rules');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should create a user rule', async () => {
      const userAgent = await loginAs('assessee');
      const res = await userAgent.post('/api/v1/notification-rules').send({
        name: 'My evidence notifications',
        channel: 'email',
        eventTypes: ['evidence.state_changed'],
        filters: {
          my_evidence: true,
        },
        enabled: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.scope).toBe('user');
      // camelCase middleware transforms user_id -> userId
      expect(res.body.userId).toBeDefined();
      expect(res.body.name).toBe('My evidence notifications');
    });

    it('should reject user rule with invalid event type', async () => {
      const userAgent = await loginAs('assessee');
      const res = await userAgent.post('/api/v1/notification-rules').send({
        name: 'Bad rule',
        channel: 'slack',
        eventTypes: ['nonexistent.event'],
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid event type');
    });

    it('should get user rule by id', async () => {
      const userAgent = await loginAs('assessee');

      // Create rule
      const createRes = await userAgent.post('/api/v1/notification-rules').send({
        name: 'My rule',
        channel: 'teams',
        eventTypes: ['assessment.state_changed'],
        filters: {
          my_assessments: true,
        },
      });

      const ruleId = createRes.body.id;

      // Get rule
      const getRes = await userAgent.get(`/api/v1/notification-rules/${ruleId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(ruleId);
    });

    it('should prevent accessing other user rules', async () => {
      const user1 = await loginAs('assessee');
      const user2 = await loginAs('assessor');

      // User 1 creates rule
      const createRes = await user1.post('/api/v1/notification-rules').send({
        name: 'User 1 rule',
        channel: 'in_app',
        eventTypes: ['assessment.created'],
      });

      const ruleId = createRes.body.id;

      // User 2 tries to get it
      const getRes = await user2.get(`/api/v1/notification-rules/${ruleId}`);

      expect(getRes.status).toBe(404);
    });

    it('should update user rule', async () => {
      const userAgent = await loginAs('assessee');

      // Create rule
      const createRes = await userAgent.post('/api/v1/notification-rules').send({
        name: 'Original',
        channel: 'mattermost',
        eventTypes: ['evidence.state_changed'],
        enabled: true,
      });

      const ruleId = createRes.body.id;

      // Update rule
      const updateRes = await userAgent.put(`/api/v1/notification-rules/${ruleId}`).send({
        name: 'Updated',
        enabled: false,
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.name).toBe('Updated');
      expect(updateRes.body.enabled).toBe(false);
    });

    it('should delete user rule', async () => {
      const userAgent = await loginAs('assessee');

      // Create rule
      const createRes = await userAgent.post('/api/v1/notification-rules').send({
        name: 'To delete',
        channel: 'webhook',
        eventTypes: ['attestation.created'],
      });

      const ruleId = createRes.body.id;

      // Delete rule
      const deleteRes = await userAgent.delete(`/api/v1/notification-rules/${ruleId}`);

      expect(deleteRes.status).toBe(204);

      // Verify deletion
      const getRes = await userAgent.get(`/api/v1/notification-rules/${ruleId}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('User Profile Updates', () => {
    it('should update user chat identities', async () => {
      const userAgent = await loginAs('assessee');

      const res = await userAgent.patch('/api/v1/auth/me').send({
        slackUserId: 'U12345',
        teamsUserId: 'user@teams.com',
        mattermostUsername: 'john.doe',
      });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      // Note: camelCaseResponse middleware converts snake_case to camelCase
      expect(res.body.user.slackUserId).toBe('U12345');
      expect(res.body.user.teamsUserId).toBe('user@teams.com');
      expect(res.body.user.mattermostUsername).toBe('john.doe');
    });

    it('should update email notifications preference', async () => {
      const userAgent = await loginAs('assessee');

      const res = await userAgent.patch('/api/v1/auth/me').send({
        emailNotifications: false,
      });

      expect(res.status).toBe(200);
      expect(res.body.user.emailNotifications).toBe(false);
    });

    it('should clear chat identities', async () => {
      const userAgent = await loginAs('assessee');

      // First set them
      await userAgent.patch('/api/v1/auth/me').send({
        slackUserId: 'U12345',
      });

      // Then clear
      const res = await userAgent.patch('/api/v1/auth/me').send({
        slackUserId: null,
      });

      expect(res.status).toBe(200);
      expect(res.body.user.slackUserId).toBeNull();
    });

    it('should validate patch input', async () => {
      const userAgent = await loginAs('assessee');

      const res = await userAgent.patch('/api/v1/auth/me').send({
        invalidField: 'should be ignored',
      });

      // Should succeed with empty updates (validation allows optional fields)
      expect(res.status).toBe(200);
    });
  });

  describe('Rules Evaluation Against Events', () => {
    it('should reject empty rule creation', async () => {
      const adminAgent = await loginAs('admin');

      const res = await adminAgent.post('/api/v1/admin/notification-rules').send({
        name: '',
        channel: 'in_app',
        eventTypes: [],
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation failed');
    });

    it('should allow wildcard event type', async () => {
      const adminAgent = await loginAs('admin');

      const res = await adminAgent.post('/api/v1/admin/notification-rules').send({
        name: 'All events',
        channel: 'in_app',
        eventTypes: ['*'],
      });

      expect(res.status).toBe(201);
      const eventTypes = Array.isArray(res.body.eventTypes)
        ? res.body.eventTypes
        : JSON.parse(res.body.eventTypes);
      expect(eventTypes).toContain('*');
    });
  });
});
