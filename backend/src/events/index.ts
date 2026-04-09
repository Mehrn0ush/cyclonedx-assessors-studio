/**
 * Event system barrel export (spec 003).
 *
 * Provides a singleton event bus and channel registry, along with
 * initialization and shutdown functions for application lifecycle.
 */

export { EventBus } from './event-bus.js';
export { ChannelRegistry } from './channel-registry.js';
export { InAppChannel } from './in-app-channel.js';
export { WebhookChannel } from './webhook-channel.js';
export { EmailChannel } from './channels/email.js';
export type { NotificationChannel } from './channel.js';
export type { EventEnvelope, Actor, EventOptions } from './types.js';
export * from './catalog.js';

import { EventBus } from './event-bus.js';
import { ChannelRegistry } from './channel-registry.js';
import { InAppChannel } from './in-app-channel.js';
import { WebhookChannel } from './webhook-channel.js';
import { EmailChannel } from './channels/email.js';
import { getDatabase } from '../db/connection.js';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

let eventBus: EventBus | null = null;
let channelRegistry: ChannelRegistry | null = null;

/**
 * Initialize the event system: create the bus, register channels,
 * and wire everything together.
 */
export async function initializeEventSystem(): Promise<void> {
  eventBus = new EventBus();
  channelRegistry = new ChannelRegistry();

  // In-app channel is always registered
  const inAppChannel = new InAppChannel(() => getDatabase());
  channelRegistry.register(inAppChannel);

  // Webhook channel (spec 004): registered when WEBHOOK_ENABLED=true
  const config = getConfig();
  if (config.WEBHOOK_ENABLED) {
    const webhookChannel = new WebhookChannel(() => getDatabase());
    channelRegistry.register(webhookChannel);

    // Wire the emitter callback after initialization so the webhook
    // channel can emit events (e.g., channel.webhook.disabled) without
    // a circular dependency on the event bus.
    await channelRegistry.initializeAll(eventBus);
    webhookChannel.setEmitter((type, data) => {
      eventBus.emit(type, data, { userId: null, displayName: 'System' });
    });
  } else {
    await channelRegistry.initializeAll(eventBus);
  }

  // Email channel (spec 005): registered when SMTP_ENABLED=true
  if (config.SMTP_ENABLED) {
    const emailChannel = new EmailChannel(() => getDatabase());
    channelRegistry.register(emailChannel);
  }

  // Future channels (slack, teams, mattermost) will be
  // conditionally registered here based on config flags.
  logger.info('Event system initialized', {
    channels: channelRegistry.getChannelNames(),
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
