/**
 * Event catalog: the single source of truth for every domain event in
 * the application (spec 003).
 *
 * Each event has a dot-separated type string ({domain}.{action}) and
 * belongs to a category used for notification rule grouping.
 */

// ---------------------------------------------------------------------------
// Event type constants
// ---------------------------------------------------------------------------

// Assessment events
export const ASSESSMENT_CREATED = 'assessment.created';
export const ASSESSMENT_STATE_CHANGED = 'assessment.state_changed';
export const ASSESSMENT_DELETED = 'assessment.deleted';
export const ASSESSMENT_ASSIGNED = 'assessment.assigned';

// Evidence events
export const EVIDENCE_CREATED = 'evidence.created';
export const EVIDENCE_STATE_CHANGED = 'evidence.state_changed';
export const EVIDENCE_ATTACHMENT_ADDED = 'evidence.attachment_added';
export const EVIDENCE_ATTACHMENT_REMOVED = 'evidence.attachment_removed';

// Claim events
export const CLAIM_CREATED = 'claim.created';
export const CLAIM_UPDATED = 'claim.updated';

// Attestation events
export const ATTESTATION_CREATED = 'attestation.created';
export const ATTESTATION_SIGNED = 'attestation.signed';
export const ATTESTATION_EXPORTED = 'attestation.exported';

// Project events
export const PROJECT_CREATED = 'project.created';
export const PROJECT_STATE_CHANGED = 'project.state_changed';
export const PROJECT_ARCHIVED = 'project.archived';

// Standard events
export const STANDARD_IMPORTED = 'standard.imported';
export const STANDARD_STATE_CHANGED = 'standard.state_changed';

// User and access events
export const USER_CREATED = 'user.created';
export const USER_DEACTIVATED = 'user.deactivated';
export const APIKEY_CREATED = 'apikey.created';

// Channel lifecycle events
export const CHANNEL_WEBHOOK_DISABLED = 'channel.webhook.disabled';
export const CHANNEL_TEST = 'channel.test';

// ---------------------------------------------------------------------------
// Type-to-category mapping
// ---------------------------------------------------------------------------

const TYPE_CATEGORY_MAP: Record<string, string> = {
  [ASSESSMENT_CREATED]: 'assessment',
  [ASSESSMENT_STATE_CHANGED]: 'assessment',
  [ASSESSMENT_DELETED]: 'assessment',
  [ASSESSMENT_ASSIGNED]: 'assessment',

  [EVIDENCE_CREATED]: 'evidence',
  [EVIDENCE_STATE_CHANGED]: 'evidence',
  [EVIDENCE_ATTACHMENT_ADDED]: 'evidence',
  [EVIDENCE_ATTACHMENT_REMOVED]: 'evidence',

  [CLAIM_CREATED]: 'claim',
  [CLAIM_UPDATED]: 'claim',

  [ATTESTATION_CREATED]: 'attestation',
  [ATTESTATION_SIGNED]: 'attestation',
  [ATTESTATION_EXPORTED]: 'attestation',

  [PROJECT_CREATED]: 'project',
  [PROJECT_STATE_CHANGED]: 'project',
  [PROJECT_ARCHIVED]: 'project',

  [STANDARD_IMPORTED]: 'standard',
  [STANDARD_STATE_CHANGED]: 'standard',

  [USER_CREATED]: 'system',
  [USER_DEACTIVATED]: 'system',
  [APIKEY_CREATED]: 'system',

  [CHANNEL_WEBHOOK_DISABLED]: 'system',
  [CHANNEL_TEST]: 'system',
};

/**
 * Resolve the notification category for an event type.
 * Falls back to the domain prefix (everything before the first dot)
 * if the type is not explicitly mapped.
 */
export function getCategoryForType(type: string): string {
  if (TYPE_CATEGORY_MAP[type]) {
    return TYPE_CATEGORY_MAP[type];
  }
  const dot = type.indexOf('.');
  return dot > 0 ? type.substring(0, dot) : 'unknown';
}

/**
 * All known event types as a flat array.
 */
export const ALL_EVENT_TYPES = Object.keys(TYPE_CATEGORY_MAP);

/**
 * All known categories as a deduplicated array.
 */
export const ALL_CATEGORIES = [...new Set(Object.values(TYPE_CATEGORY_MAP))];
