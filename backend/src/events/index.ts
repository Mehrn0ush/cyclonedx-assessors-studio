/**
 * Event system barrel export (spec 003).
 *
 * Provides a singleton event bus and channel registry, along with
 * initialization and shutdown functions for application lifecycle.
 */

export { EventBus } from './event-bus.js';
export { ChannelRegistry } from './channel-registry.js';
export { InAppChannel } from './in-app-channel.js';
export type { NotificationChannel } from './channel.js';
export type { EventEnvelope, Actor, EventOptions } from './types.js';
export * from './catalog.js';

import { EventBus } from './event-bus.js';
import { ChannelRegistry } from './channel-registry.js';
import { InAppChannel } from './in-app-channel.js';
import { getDatabase } from '../db/connection.js';
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

  // Future channels (webhook, email, slack, teams, mattermost) will
  // be conditionally registered here based on config flags.

  await channelRegistry.initializeAll(eventBus);
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
