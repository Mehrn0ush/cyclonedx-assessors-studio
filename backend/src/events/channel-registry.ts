/**
 * Channel registry: manages notification channel lifecycle.
 *
 * Channels register at startup. The registry initializes them all,
 * wires them into the event bus, and shuts them down gracefully.
 */

import { logger } from '../utils/logger.js';
import type { NotificationChannel } from './channel.js';
import type { EventBus } from './event-bus.js';
import type { EventEnvelope } from './types.js';

export class ChannelRegistry {
  private channels = new Map<string, NotificationChannel>();

  /**
   * Register a notification channel. Throws if a channel with the
   * same name is already registered.
   */
  register(channel: NotificationChannel): void {
    if (this.channels.has(channel.name)) {
      throw new Error(`Channel "${channel.name}" is already registered`);
    }
    this.channels.set(channel.name, channel);
    logger.info(`Notification channel registered: ${channel.name}`);
  }

  /**
   * Initialize all registered channels and wire them into the event bus.
   * Each channel subscribes to all events via `onAny` and decides
   * per event whether to handle it.
   */
  async initializeAll(eventBus: EventBus): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.initialize();
        logger.info(`Notification channel initialized: ${channel.name}`);
      } catch (error) {
        logger.error(`Failed to initialize channel: ${channel.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue initializing other channels
        continue;
      }

      // Wire this channel into the event bus
      const channelName = channel.name;
      eventBus.onAny(async (envelope: EventEnvelope) => {
        if (!channel.handles(envelope)) {
          return;
        }
        try {
          await channel.process(envelope);
        } catch (error) {
          logger.error(`Channel "${channelName}" failed to process event`, {
            eventId: envelope.id,
            eventType: envelope.type,
            channel: channelName,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }

  /**
   * Shut down all registered channels gracefully.
   */
  async shutdownAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.shutdown();
        logger.info(`Notification channel shut down: ${channel.name}`);
      } catch (error) {
        logger.error(`Failed to shut down channel: ${channel.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Look up a channel by name.
   */
  getChannel(name: string): NotificationChannel | undefined {
    return this.channels.get(name);
  }

  /**
   * All registered channel names.
   */
  getChannelNames(): string[] {
    return [...this.channels.keys()];
  }
}
