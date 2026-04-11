/**
 * Unit tests for the event system barrel module (events/index.ts).
 *
 * Tests the singleton getter functions and export structure.
 * The initialization/shutdown flows are tested indirectly via HTTP
 * integration tests since they require complex cross-module wiring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock all dependencies that the events/index.ts barrel imports
vi.mock('../../db/connection.js', () => ({
  getDatabase: vi.fn(),
}));

vi.mock('../../config/index.js', () => ({
  getConfig: vi.fn(() => ({
    WEBHOOK_ENABLED: false,
    SMTP_ENABLED: false,
    SLACK_ENABLED: false,
    TEAMS_ENABLED: false,
    MATTERMOST_ENABLED: false,
  })),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Event System Barrel Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Getters before initialization', () => {
    it('getEventBus() throws before initialization', async () => {
      const { getEventBus } = await import('../../events/index.js');
      expect(() => getEventBus()).toThrow('Event system not initialized');
    });

    it('getChannelRegistry() throws before initialization', async () => {
      const { getChannelRegistry } = await import('../../events/index.js');
      expect(() => getChannelRegistry()).toThrow('Event system not initialized');
    });

    it('getRulesEngine() throws before initialization', async () => {
      const { getRulesEngine } = await import('../../events/index.js');
      expect(() => getRulesEngine()).toThrow('Event system not initialized');
    });
  });

  describe('Exports', () => {
    it('exports EventBus class', async () => {
      const { EventBus } = await import('../../events/index.js');
      expect(EventBus).toBeDefined();
      expect(typeof EventBus).toBe('function');
    });

    it('exports ChannelRegistry class', async () => {
      const { ChannelRegistry } = await import('../../events/index.js');
      expect(ChannelRegistry).toBeDefined();
      expect(typeof ChannelRegistry).toBe('function');
    });

    it('exports InAppChannel class', async () => {
      const { InAppChannel } = await import('../../events/index.js');
      expect(InAppChannel).toBeDefined();
      expect(typeof InAppChannel).toBe('function');
    });

    it('exports WebhookChannel class', async () => {
      const { WebhookChannel } = await import('../../events/index.js');
      expect(WebhookChannel).toBeDefined();
      expect(typeof WebhookChannel).toBe('function');
    });

    it('exports EmailChannel class', async () => {
      const { EmailChannel } = await import('../../events/index.js');
      expect(EmailChannel).toBeDefined();
      expect(typeof EmailChannel).toBe('function');
    });

    it('exports SlackChannel class', async () => {
      const { SlackChannel } = await import('../../events/index.js');
      expect(SlackChannel).toBeDefined();
      expect(typeof SlackChannel).toBe('function');
    });

    it('exports TeamsChannel class', async () => {
      const { TeamsChannel } = await import('../../events/index.js');
      expect(TeamsChannel).toBeDefined();
      expect(typeof TeamsChannel).toBe('function');
    });

    it('exports MattermostChannel class', async () => {
      const { MattermostChannel } = await import('../../events/index.js');
      expect(MattermostChannel).toBeDefined();
      expect(typeof MattermostChannel).toBe('function');
    });

    it('exports RulesEngine class', async () => {
      const { RulesEngine } = await import('../../events/index.js');
      expect(RulesEngine).toBeDefined();
      expect(typeof RulesEngine).toBe('function');
    });

    it('exports event catalog constants', async () => {
      const mod = await import('../../events/index.js');
      expect(mod.ASSESSMENT_CREATED).toBeDefined();
      expect(mod.ASSESSMENT_STATE_CHANGED).toBeDefined();
      expect(mod.EVIDENCE_CREATED).toBeDefined();
      expect(mod.EVIDENCE_STATE_CHANGED).toBeDefined();
      expect(mod.ATTESTATION_CREATED).toBeDefined();
    });

    it('exports initializeEventSystem function', async () => {
      const { initializeEventSystem } = await import('../../events/index.js');
      expect(initializeEventSystem).toBeDefined();
      expect(typeof initializeEventSystem).toBe('function');
    });

    it('exports shutdownEventSystem function', async () => {
      const { shutdownEventSystem } = await import('../../events/index.js');
      expect(shutdownEventSystem).toBeDefined();
      expect(typeof shutdownEventSystem).toBe('function');
    });
  });

  describe('shutdownEventSystem without prior initialization', () => {
    it('does not throw when shutting down uninitialized system', async () => {
      const { shutdownEventSystem } = await import('../../events/index.js');
      await expect(shutdownEventSystem()).resolves.not.toThrow();
    });
  });
});
