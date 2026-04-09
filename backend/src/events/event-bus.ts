/**
 * In-process event bus built on Node.js EventEmitter.
 *
 * Decouples event emission from event consumption. Listeners run
 * asynchronously and errors in one listener do not affect others.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { getCategoryForType } from './catalog.js';
import type { Actor, EventEnvelope, EventOptions } from './types.js';

/** Special event name that receives all events. */
const WILDCARD = '*';

export class EventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    // Allow many listeners (one per channel + any per-type listeners)
    this.emitter.setMaxListeners(50);
  }

  /**
   * Emit a domain event. Constructs the envelope and dispatches it
   * to all matching listeners (both type-specific and wildcard).
   *
   * When `options.silent` is true, the event is not emitted.
   */
  emit(
    type: string,
    data: Record<string, unknown>,
    actor: Actor,
    options?: EventOptions,
  ): EventEnvelope | null {
    if (options?.silent) {
      return null;
    }

    const envelope: EventEnvelope = {
      id: `evt_${uuidv4()}`,
      type,
      category: getCategoryForType(type),
      timestamp: new Date().toISOString(),
      version: '1',
      actor,
      data,
    };

    // Dispatch to type-specific listeners
    this.dispatch(type, envelope);

    // Dispatch to wildcard listeners
    this.dispatch(WILDCARD, envelope);

    return envelope;
  }

  /**
   * Register a listener for a specific event type.
   */
  on(type: string, handler: (envelope: EventEnvelope) => Promise<void>): void {
    this.emitter.on(type, (envelope: EventEnvelope) => {
      this.safeInvoke(handler, envelope, type);
    });
  }

  /**
   * Register a listener that receives all events.
   */
  onAny(handler: (envelope: EventEnvelope) => Promise<void>): void {
    this.emitter.on(WILDCARD, (envelope: EventEnvelope) => {
      this.safeInvoke(handler, envelope, WILDCARD);
    });
  }

  /**
   * Remove all listeners (for testing and shutdown).
   */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  /**
   * Dispatch an envelope to listeners on the given event name.
   */
  private dispatch(eventName: string, envelope: EventEnvelope): void {
    this.emitter.emit(eventName, envelope);
  }

  /**
   * Invoke a handler and catch any errors, logging them without
   * affecting other listeners.
   */
  private async safeInvoke(
    handler: (envelope: EventEnvelope) => Promise<void>,
    envelope: EventEnvelope,
    listenerName: string,
  ): Promise<void> {
    try {
      await handler(envelope);
    } catch (error) {
      logger.error('Event listener error', {
        eventId: envelope.id,
        eventType: envelope.type,
        listener: listenerName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
