/**
 * Event system barrel export.
 *
 * Provides a singleton event bus and channel registry, along with
 * initialization and shutdown functions for application lifecycle.
 */

export { EventBus } from './event-bus.js';
export { ChannelRegistry } from './channel-registry.js';
export { InAppChannel } from './in-app-channel.js';
export { WebhookChannel } from './webhook-channel.js';
export { EmailChannel } from './channels/email.js';
export { SlackChannel } from './channels/chat-slack.js';
export { TeamsChannel } from './channels/chat-teams.js';
export { MattermostChannel } from './channels/chat-mattermost.js';
export { RulesEngine } from './rules-engine.js';
export type { NotificationChannel } from './channel.js';
export type { EventEnvelope, Actor, EventOptions } from './types.js';
export type { RuleMatch } from './rules-engine.js';
export * from './catalog.js';

import { EventBus } from './event-bus.js';
import { ChannelRegistry } from './channel-registry.js';
import { InAppChannel } from './in-app-channel.js';
import { WebhookChannel } from './webhook-channel.js';
import { EmailChannel } from './channels/email.js';
import { SlackChannel } from './channels/chat-slack.js';
import { TeamsChannel } from './channels/chat-teams.js';
import { MattermostChannel } from './channels/chat-mattermost.js';
import { RulesEngine } from './rules-engine.js';
import { getDatabase } from '../db/connection.js';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

let eventBus: EventBus | null = null;
let channelRegistry: ChannelRegistry | null = null;
let rulesEngine: RulesEngine | null = null;

/**
 * Initialize the event system: create the bus, register channels,
 * wire the rules engine, and set up the event bus listener.
 */
export async function initializeEventSystem(): Promise<void> {
  eventBus = new EventBus();
  channelRegistry = new ChannelRegistry();

  // In-app channel is always registered
  const inAppChannel = new InAppChannel(() => getDatabase());
  channelRegistry.register(inAppChannel);

  // Webhook channel: registered when WEBHOOK_ENABLED=true
  const config = getConfig();
  if (config.WEBHOOK_ENABLED) {
    const webhookChannel = new WebhookChannel(() => getDatabase());
    channelRegistry.register(webhookChannel);

    // Wire the emitter callback after initialization so the webhook
    // channel can emit events (e.g., channel.webhook.disabled) without
    // a circular dependency on the event bus.
    await channelRegistry.initializeAll(eventBus!);
    webhookChannel.setEmitter((type, data) => {
      if (eventBus) {
        eventBus.emit(type, data, { userId: null, displayName: 'System' });
      }
    });
  } else {
    await channelRegistry.initializeAll(eventBus!);
  }

  // Email channel: registered when SMTP_ENABLED=true
  if (config.SMTP_ENABLED) {
    const emailChannel = new EmailChannel(() => getDatabase());
    channelRegistry.register(emailChannel);
  }

  // Chat channels: registered when *_ENABLED=true
  if (config.SLACK_ENABLED) {
    const slackChannel = new SlackChannel(() => getDatabase());
    channelRegistry.register(slackChannel);
    slackChannel.setEmitter((type, data) => {
      eventBus!.emit(type, data, { userId: null, displayName: 'System' });
    });
  }

  if (config.TEAMS_ENABLED) {
    const teamsChannel = new TeamsChannel(() => getDatabase());
    channelRegistry.register(teamsChannel);
    teamsChannel.setEmitter((type, data) => {
      eventBus!.emit(type, data, { userId: null, displayName: 'System' });
    });
  }

  if (config.MATTERMOST_ENABLED) {
    const mattermostChannel = new MattermostChannel(() => getDatabase());
    channelRegistry.register(mattermostChannel);
    mattermostChannel.setEmitter((type, data) => {
      eventBus!.emit(type, data, { userId: null, displayName: 'System' });
    });
  }

  // Initialize rules engine
  rulesEngine = new RulesEngine(() => getDatabase());
  rulesEngine.setChannelRegistry(channelRegistry);

  // Wire rules engine into event bus: process every event through rules
  eventBus.onAny(async (envelope) => {
    try {
      await rulesEngine!.processEvent(envelope);
    } catch (error) {
      logger.error('Rules engine error processing event', {
        eventId: envelope.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  logger.info('Event system initialized', {
    channels: channelRegistry.getChannelNames(),
    rulesEngineEnabled: true,
  });
}

/**
 * Shut down the event system gracefully.
 */
export async function shutdownEventSystem(): Promise<void> {
  if (channelRegistry) {
    await channelRegistry.shutdownAll();
  }
  if (eventBus) {
    eventBus.removeAllListeners();
  }
  eventBus = null;
  channelRegistry = null;
  rulesEngine = null;
  logger.info('Event system shut down');
}

/**
 * Get the singleton event bus. Throws if the system has not been initialized.
 */
export function getEventBus(): EventBus {
  if (!eventBus) {
    throw new Error('Event system not initialized. Call initializeEventSystem() first.');
  }
  return eventBus;
}

/**
 * Get the singleton channel registry.
 */
export function getChannelRegistry(): ChannelRegistry {
  if (!channelRegistry) {
    throw new Error('Event system not initialized. Call initializeEventSystem() first.');
  }
  return channelRegistry;
}

/**
 * Get the singleton rules engine.
 */
export function getRulesEngine(): RulesEngine {
  if (!rulesEngine) {
    throw new Error('Event system not initialized. Call initializeEventSystem() first.');
  }
  return rulesEngine;
}
