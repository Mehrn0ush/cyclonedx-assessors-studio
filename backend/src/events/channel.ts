/**
 * Notification channel abstraction (spec 003).
 *
 * Every delivery channel (in-app, email, webhook, chat) implements
 * this interface. The channel registry manages their lifecycle and
 * the event bus dispatches events to channels via their handlers.
 */

import type { EventEnvelope } from './types.js';

/**
 * A notification delivery channel.
 */
export interface NotificationChannel {
  /** Unique channel name, e.g., "in_app", "email", "webhook", "slack" */
  name: string;

  /** Called once at startup to verify config and establish connections. */
  initialize(): Promise<void>;

  /** Quick filter: return true if this channel should process the event. */
  handles(envelope: EventEnvelope): boolean;

  /** Deliver the notification for this event. */
  process(envelope: EventEnvelope): Promise<void>;

  /** Graceful cleanup on shutdown. */
  shutdown(): Promise<void>;
}
