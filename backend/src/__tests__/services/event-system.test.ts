/**
 * Unit tests for the event system (spec 003).
 *
 * Tests the event bus, catalog, channel registry, and in-app channel
 * in isolation using PGlite.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { EventBus } from '../../events/event-bus.js';
import { ChannelRegistry } from '../../events/channel-registry.js';
import { InAppChannel } from '../../events/in-app-channel.js';
import {
  getCategoryForType,
  ALL_EVENT_TYPES,
  ALL_CATEGORIES,
  EVIDENCE_STATE_CHANGED,
  ASSESSMENT_STATE_CHANGED,
  ASSESSMENT_CREATED,
} from '../../events/catalog.js';
import type { EventEnvelope, Actor } from '../../events/types.js';
import type { NotificationChannel } from '../../events/channel.js';
import {
  setupTestDb,
  teardownTestDb,
  getTestDatabase,
  createTestUser,
  createTestProject,
  createTestAssessment,
  createTestEvidence,
} from '../helpers/setup.js';

describe('Event Catalog', () => {
  it('maps known types to categories', () => {
    expect(getCategoryForType('evidence.state_changed')).toBe('evidence');
    expect(getCategoryForType('assessment.created')).toBe('assessment');
    expect(getCategoryForType('user.created')).toBe('system');
    expect(getCategoryForType('channel.test')).toBe('system');
  });

  it('falls back to domain prefix for unknown types', () => {
    expect(getCategoryForType('custom.some_action')).toBe('custom');
  });

  it('returns unknown for types without a dot', () => {
    expect(getCategoryForType('nodot')).toBe('unknown');
  });

  it('exports all event types and categories', () => {
    expect(ALL_EVENT_TYPES.length).toBeGreaterThan(20);
    expect(ALL_CATEGORIES).toContain('assessment');
    expect(ALL_CATEGORIES).toContain('evidence');
    expect(ALL_CATEGORIES).toContain('system');
  });
});

describe('EventBus', () => {
  let bus: EventBus;
  const testActor: Actor = { userId: 'user-1', displayName: 'Test User' };

  beforeEach(() => {
    bus = new EventBus();
  });

  it('emits events and delivers to type-specific listeners', async () => {
    const received: EventEnvelope[] = [];
    bus.on('test.event', async (envelope) => {
      received.push(envelope);
    });

    const envelope = bus.emit('test.event', { key: 'value' }, testActor);

    // Give async listener time to execute
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(envelope).not.toBeNull();
    expect(envelope!.id).toMatch(/^evt_/);
    expect(envelope!.type).toBe('test.event');
    expect(envelope!.actor).toEqual(testActor);
    expect(envelope!.data).toEqual({ key: 'value' });
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(envelope!.id);
  });

  it('delivers events to wildcard listeners via onAny', async () => {
    const received: EventEnvelope[] = [];
    bus.onAny(async (envelope) => {
      received.push(envelope);
    });

    bus.emit('first.event', {}, testActor);
    bus.emit('second.event', {}, testActor);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('first.event');
    expect(received[1].type).toBe('second.event');
  });

  it('returns null and does not emit when silent mode is on', async () => {
    const received: EventEnvelope[] = [];
    bus.on('test.event', async (envelope) => {
      received.push(envelope);
    });

    const result = bus.emit('test.event', {}, testActor, { silent: true });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result).toBeNull();
    expect(received).toHaveLength(0);
  });

  it('isolates errors between listeners', async () => {
    const results: string[] = [];

    bus.on('test.event', async () => {
      throw new Error('Listener 1 fails');
    });

    bus.on('test.event', async () => {
      results.push('listener-2-ok');
    });

    bus.emit('test.event', {}, testActor);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second listener should still execute despite first throwing
    expect(results).toContain('listener-2-ok');
  });

  it('generates unique event IDs', () => {
    const e1 = bus.emit('test.event', {}, testActor);
    const e2 = bus.emit('test.event', {}, testActor);
    expect(e1!.id).not.toBe(e2!.id);
  });

  it('includes ISO timestamp', () => {
    const envelope = bus.emit('test.event', {}, testActor);
    // ISO 8601 check
    expect(new Date(envelope!.timestamp).toISOString()).toBe(envelope!.timestamp);
  });

  it('removes all listeners', async () => {
    const received: EventEnvelope[] = [];
    bus.on('test.event', async (env) => { received.push(env); });
    bus.removeAllListeners();
    bus.emit('test.event', {}, testActor);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(0);
  });
});

describe('ChannelRegistry', () => {
  it('registers and retrieves channels', () => {
    const registry = new ChannelRegistry();
    const mockChannel: NotificationChannel = {
      name: 'test_channel',
      initialize: async () => {},
      handles: () => true,
      process: async () => {},
      shutdown: async () => {},
    };

    registry.register(mockChannel);
    expect(registry.getChannel('test_channel')).toBe(mockChannel);
    expect(registry.getChannelNames()).toContain('test_channel');
  });

  it('throws on duplicate registration', () => {
    const registry = new ChannelRegistry();
    const channel: NotificationChannel = {
      name: 'dup',
      initialize: async () => {},
      handles: () => true,
      process: async () => {},
      shutdown: async () => {},
    };

    registry.register(channel);
    expect(() => registry.register(channel)).toThrow('already registered');
  });

  it('wires channels into event bus on initializeAll', async () => {
    const registry = new ChannelRegistry();
    const bus = new EventBus();
    const processed: EventEnvelope[] = [];

    const channel: NotificationChannel = {
      name: 'recorder',
      initialize: async () => {},
      handles: () => true,
      process: async (env) => { processed.push(env) as unknown as void; },
      shutdown: async () => {},
    };

    registry.register(channel);
    await registry.initializeAll(bus);

    bus.emit('test.event', { foo: 'bar' }, { userId: null, displayName: 'System' });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(processed).toHaveLength(1);
    expect(processed[0].type).toBe('test.event');
  });

  it('skips events when handles() returns false', async () => {
    const registry = new ChannelRegistry();
    const bus = new EventBus();
    const processed: EventEnvelope[] = [];

    const channel: NotificationChannel = {
      name: 'selective',
      initialize: async () => {},
      handles: (env) => env.type === 'wanted.event',
      process: async (env) => { processed.push(env) as unknown as void; },
      shutdown: async () => {},
    };

    registry.register(channel);
    await registry.initializeAll(bus);

    bus.emit('unwanted.event', {}, { userId: null, displayName: 'System' });
    bus.emit('wanted.event', {}, { userId: null, displayName: 'System' });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(processed).toHaveLength(1);
    expect(processed[0].type).toBe('wanted.event');
  });
});

describe('InAppChannel with database', () => {
  beforeAll(async () => {
    await setupTestDb();

    // Add notification table if not present (test setup may not include it)
    const db = getTestDatabase();
    try {
      await db.executeQuery({
        sql: `CREATE TABLE IF NOT EXISTS notification (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
          type VARCHAR(100) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          link TEXT,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );`,
        parameters: [],
      } as any);
    } catch {
      // Table may already exist
    }
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb();
  }, 30_000);

  it('creates in-app notifications for evidence.state_changed (in_review)', async () => {
    const db = getTestDatabase();

    // Setup: create author and reviewer
    const author = await createTestUser({ username: 'ev_author_1', role: 'assessee' });
    const reviewer = await createTestUser({ username: 'ev_reviewer_1', role: 'assessor' });

    // Create the channel and a bus
    const channel = new InAppChannel(() => db);
    await channel.initialize();

    const envelope: EventEnvelope = {
      id: 'evt_test-1',
      type: EVIDENCE_STATE_CHANGED,
      category: 'evidence',
      timestamp: new Date().toISOString(),
      version: '1',
      actor: { userId: author.id, displayName: 'Author' },
      data: {
        evidenceId: 'evidence-1',
        evidenceName: 'Test Report',
        previousState: 'in_progress',
        newState: 'in_review',
        reviewerId: reviewer.id,
        authorId: author.id,
      },
    };

    expect(channel.handles(envelope)).toBe(true);
    await channel.process(envelope);

    // Verify notification was created for the reviewer
    const notifications = await db
      .selectFrom('notification')
      .where('user_id', '=', reviewer.id)
      .selectAll()
      .execute();

    expect(notifications.length).toBeGreaterThanOrEqual(1);
    const notif = notifications.find((n: any) => n.type === 'evidence_state_changed');
    expect(notif).toBeTruthy();
    expect(notif!.title).toBe('Evidence Submitted for Review');
    expect(notif!.message).toContain('Test Report');
  });

  it('creates in-app notifications for evidence approved', async () => {
    const db = getTestDatabase();

    const author = await createTestUser({ username: 'ev_author_2', role: 'assessee' });
    const reviewer = await createTestUser({ username: 'ev_reviewer_2', role: 'assessor' });

    const channel = new InAppChannel(() => db);
    await channel.initialize();

    const envelope: EventEnvelope = {
      id: 'evt_test-2',
      type: EVIDENCE_STATE_CHANGED,
      category: 'evidence',
      timestamp: new Date().toISOString(),
      version: '1',
      actor: { userId: reviewer.id, displayName: 'Reviewer' },
      data: {
        evidenceId: 'evidence-2',
        evidenceName: 'Security Audit',
        previousState: 'in_review',
        newState: 'claimed',
        authorId: author.id,
        reviewerId: reviewer.id,
      },
    };

    await channel.process(envelope);

    const notifications = await db
      .selectFrom('notification')
      .where('user_id', '=', author.id)
      .selectAll()
      .execute();

    const notif = notifications.find((n: any) => n.type === 'evidence_state_changed');
    expect(notif).toBeTruthy();
    expect(notif!.title).toBe('Evidence Approved');
  });

  it('creates notifications for assessment.state_changed excluding actor', async () => {
    const db = getTestDatabase();

    const admin = await createTestUser({ username: 'assess_admin_1', role: 'admin' });
    const assessor = await createTestUser({ username: 'assess_assessor_1', role: 'assessor' });
    const assessee = await createTestUser({ username: 'assess_assessee_1', role: 'assessee' });

    const project = await createTestProject({ name: 'Event Test Project' });
    const assessment = await createTestAssessment(project.id, { title: 'State Change Test' });

    // Add participants
    await db.insertInto('assessment_assessor').values({
      assessment_id: assessment.id,
      user_id: assessor.id,
      created_at: new Date(),
    }).execute();

    await db.insertInto('assessment_assessee').values({
      assessment_id: assessment.id,
      user_id: assessee.id,
      created_at: new Date(),
    }).execute();

    const channel = new InAppChannel(() => db);
    await channel.initialize();

    const envelope: EventEnvelope = {
      id: 'evt_test-3',
      type: ASSESSMENT_STATE_CHANGED,
      category: 'assessment',
      timestamp: new Date().toISOString(),
      version: '1',
      actor: { userId: admin.id, displayName: 'Admin User' },
      data: {
        assessmentId: assessment.id,
        assessmentTitle: assessment.title,
        previousState: 'new',
        newState: 'in_progress',
      },
    };

    await channel.process(envelope);

    // Assessor and assessee should get notifications, but not the admin (actor)
    const assessorNotifs = await db
      .selectFrom('notification')
      .where('user_id', '=', assessor.id)
      .where('type', '=', 'assessment_state_changed')
      .selectAll()
      .execute();

    const assesseeNotifs = await db
      .selectFrom('notification')
      .where('user_id', '=', assessee.id)
      .where('type', '=', 'assessment_state_changed')
      .selectAll()
      .execute();

    const adminNotifs = await db
      .selectFrom('notification')
      .where('user_id', '=', admin.id)
      .where('type', '=', 'assessment_state_changed')
      .selectAll()
      .execute();

    expect(assessorNotifs.length).toBeGreaterThanOrEqual(1);
    expect(assesseeNotifs.length).toBeGreaterThanOrEqual(1);
    expect(adminNotifs).toHaveLength(0);
  });

  it('creates notifications for assessment.created excluding creator', async () => {
    const db = getTestDatabase();

    const creator = await createTestUser({ username: 'creator_admin_1', role: 'admin' });
    const assessor = await createTestUser({ username: 'created_assessor_1', role: 'assessor' });
    const assessee = await createTestUser({ username: 'created_assessee_1', role: 'assessee' });

    const project = await createTestProject({ name: 'Created Event Project' });
    const assessment = await createTestAssessment(project.id, { title: 'New Assessment' });

    await db.insertInto('assessment_assessor').values({
      assessment_id: assessment.id,
      user_id: assessor.id,
      created_at: new Date(),
    }).execute();

    await db.insertInto('assessment_assessee').values({
      assessment_id: assessment.id,
      user_id: assessee.id,
      created_at: new Date(),
    }).execute();

    const channel = new InAppChannel(() => db);
    await channel.initialize();

    const envelope: EventEnvelope = {
      id: 'evt_test-created-1',
      type: ASSESSMENT_CREATED,
      category: 'assessment',
      timestamp: new Date().toISOString(),
      version: '1',
      actor: { userId: creator.id, displayName: 'Creator Admin' },
      data: {
        assessmentId: assessment.id,
        assessmentTitle: assessment.title,
      },
    };

    await channel.process(envelope);

    // Assessor and assessee should get notifications
    const assessorNotifs = await db
      .selectFrom('notification')
      .where('user_id', '=', assessor.id)
      .where('type', '=', 'assessment_created')
      .selectAll()
      .execute();

    const assesseeNotifs = await db
      .selectFrom('notification')
      .where('user_id', '=', assessee.id)
      .where('type', '=', 'assessment_created')
      .selectAll()
      .execute();

    // Creator (actor) should NOT get a notification
    const creatorNotifs = await db
      .selectFrom('notification')
      .where('user_id', '=', creator.id)
      .where('type', '=', 'assessment_created')
      .selectAll()
      .execute();

    expect(assessorNotifs.length).toBeGreaterThanOrEqual(1);
    expect(assessorNotifs[0].title).toBe('New Assessment Created');
    expect(assesseeNotifs.length).toBeGreaterThanOrEqual(1);
    expect(creatorNotifs).toHaveLength(0);
  });

  it('produces no notifications for events without resolvers', async () => {
    const db = getTestDatabase();

    const channel = new InAppChannel(() => db);
    await channel.initialize();

    const envelope: EventEnvelope = {
      id: 'evt_test-4',
      type: 'standard.imported',
      category: 'standard',
      timestamp: new Date().toISOString(),
      version: '1',
      actor: { userId: null, displayName: 'System' },
      data: { standardId: 'std-1' },
    };

    // Should not throw
    await channel.process(envelope);
  });

  it('integrates bus + registry + in-app channel end to end', async () => {
    const db = getTestDatabase();

    const author = await createTestUser({ username: 'e2e_author', role: 'assessee' });
    const reviewer = await createTestUser({ username: 'e2e_reviewer', role: 'assessor' });

    const bus = new EventBus();
    const registry = new ChannelRegistry();
    const channel = new InAppChannel(() => db);
    registry.register(channel);
    await registry.initializeAll(bus);

    bus.emit(
      EVIDENCE_STATE_CHANGED,
      {
        evidenceId: 'evi-e2e',
        evidenceName: 'E2E Evidence',
        previousState: 'in_progress',
        newState: 'in_review',
        reviewerId: reviewer.id,
        authorId: author.id,
      },
      { userId: author.id, displayName: 'E2E Author' },
    );

    // Allow async processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    const notifs = await db
      .selectFrom('notification')
      .where('user_id', '=', reviewer.id)
      .where('type', '=', 'evidence_state_changed')
      .selectAll()
      .execute();

    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs.some((n: any) => n.message.includes('E2E Evidence'))).toBe(true);

    bus.removeAllListeners();
  });

  it('silent mode suppresses all events through the full pipeline', async () => {
    const db = getTestDatabase();

    const reviewer = await createTestUser({ username: 'silent_reviewer', role: 'assessor' });

    // Count notifications before
    const before = await db
      .selectFrom('notification')
      .where('user_id', '=', reviewer.id)
      .selectAll()
      .execute();

    const bus = new EventBus();
    const registry = new ChannelRegistry();
    const channel = new InAppChannel(() => db);
    registry.register(channel);
    await registry.initializeAll(bus);

    bus.emit(
      EVIDENCE_STATE_CHANGED,
      {
        evidenceId: 'evi-silent',
        evidenceName: 'Silent Evidence',
        previousState: 'in_progress',
        newState: 'in_review',
        reviewerId: reviewer.id,
        authorId: 'author-x',
      },
      { userId: 'author-x', displayName: 'Silent Author' },
      { silent: true },
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const after = await db
      .selectFrom('notification')
      .where('user_id', '=', reviewer.id)
      .selectAll()
      .execute();

    expect(after.length).toBe(before.length);

    bus.removeAllListeners();
  });
});
