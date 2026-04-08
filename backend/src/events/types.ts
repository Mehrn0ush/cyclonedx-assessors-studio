/**
 * Core types for the event system (spec 003).
 */

/**
 * The actor (user or system) that caused the event.
 */
export interface Actor {
  userId: string | null;
  displayName: string;
}

/**
 * Standard envelope wrapping every emitted event.
 */
export interface EventEnvelope {
  /** Unique event ID, prefixed: "evt_" + UUID */
  id: string;
  /** From the catalog, e.g., "assessment.state_changed" */
  type: string;
  /** Notification rule category, e.g., "assessment" */
  category: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Payload schema version, starts at "1" */
  version: string;
  /** The user or system that caused the event */
  actor: Actor;
  /** Event-specific payload */
  data: Record<string, unknown>;
}

/**
 * Options controlling event emission behavior.
 */
export interface EventOptions {
  /** Suppress all events (for bulk operations) */
  silent?: boolean;
}
