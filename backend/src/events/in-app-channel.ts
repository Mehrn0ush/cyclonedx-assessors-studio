/**
 * In-app notification channel.
 *
 * Thin wrapper for creating in-app notifications. The rules engine
 * handles recipient resolution and calls deliverToUser() directly.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { logger } from '../utils/logger.js';
import type { NotificationChannel } from './channel.js';
import type { EventEnvelope } from './types.js';
import { resolveRecipients } from './recipients.js';

/**
 * Build a human readable notification title from an event envelope.
 */
function buildTitle(envelope: EventEnvelope): string {
  const { type, data } = envelope;

  switch (type) {
    case 'evidence.state_changed': {
      const state = data.newState as string | undefined;
      if (state === 'in_review') return 'Evidence Submitted for Review';
      if (state === 'approved' || state === 'claimed') return 'Evidence Approved';
      if (state === 'in_progress') return 'Evidence Rejected';
      return 'Evidence State Changed';
    }
    case 'assessment.state_changed': {
      const state = data.newState as string | undefined;
      if (state === 'in_progress') return 'Assessment Started';
      if (state === 'completed') return 'Assessment Completed';
      return 'Assessment State Changed';
    }
    case 'assessment.created':
      return 'New Assessment Created';
    case 'attestation.created':
      return 'Attestation Created';
    case 'attestation.signed':
      return 'Attestation Signed';
    default:
      return type.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Build a human readable notification message from an event envelope.
 */
function buildMessage(envelope: EventEnvelope): string {
  const { type, data } = envelope;
  const name = (data.evidenceName || data.assessmentTitle || data.name || '') as string;

  switch (type) {
    case 'evidence.state_changed': {
      const state = data.newState as string | undefined;
      if (state === 'in_review') return `Evidence "${name}" has been submitted for your review`;
      if (state === 'approved' || state === 'claimed') return `Your evidence "${name}" has been approved`;
      if (state === 'in_progress') {
        const reason = data.rejectionReason as string | undefined;
        return reason
          ? `Your evidence "${name}" has been rejected. Reason: ${reason}`
          : `Your evidence "${name}" has been rejected`;
      }
      return `Evidence "${name}" state changed to ${state}`;
    }
    case 'assessment.state_changed': {
      const state = data.newState as string | undefined;
      const title = (data.assessmentTitle || '') as string;
      if (state === 'in_progress') return `Assessment "${title}" has been started`;
      if (state === 'completed') return `Assessment "${title}" has been completed`;
      return `Assessment "${title}" state changed to ${state}`;
    }
    case 'assessment.created':
      return `Assessment "${(data.assessmentTitle || '') as string}" has been created`;
    default:
      return `${buildTitle(envelope)}: ${name || envelope.type}`;
  }
}

/**
 * Build a link for the notification.
 */
function buildLink(envelope: EventEnvelope): string | null {
  const { type, data } = envelope;

  if (type.startsWith('evidence.') && data.evidenceId) {
    return `/evidence/${data.evidenceId}`;
  }
  if (type.startsWith('assessment.') && data.assessmentId) {
    return `/assessments/${data.assessmentId}`;
  }
  if (type.startsWith('attestation.') && data.attestationId) {
    return `/attestations/${data.attestationId}`;
  }
  if (type.startsWith('project.') && data.projectId) {
    return `/projects/${data.projectId}`;
  }
  return null;
}

export class InAppChannel implements NotificationChannel {
  name = 'in_app';
  private getDb: () => Kysely<Database>;

  constructor(getDb: () => Kysely<Database>) {
    this.getDb = getDb;
  }

  async initialize(): Promise<void> {
    // No external connections needed for in-app
    logger.debug('InAppChannel initialized');
  }

  /**
   * The in-app channel handles all events that have a recipient resolver.
   * Events without resolvers are silently skipped.
   */
  handles(_envelope: EventEnvelope): boolean {
    // Let process() handle the filtering via resolveRecipients
    return true;
  }

  async process(envelope: EventEnvelope): Promise<void> {
    const db = this.getDb();
    const recipients = await resolveRecipients(envelope, db);

    if (recipients.length === 0) {
      return;
    }

    for (const userId of recipients) {
      await this.deliverToUser(envelope, userId);
    }
  }

  /**
   * Deliver an in-app notification to a specific user.
   * Called by the rules engine when a rule matches.
   */
  async deliverToUser(envelope: EventEnvelope, userId: string): Promise<void> {
    const db = this.getDb();
    const title = buildTitle(envelope);
    const message = buildMessage(envelope);
    const link = buildLink(envelope);

    try {
      await db
        .insertInto('notification')
        .values({
          id: uuidv4(),
          user_id: userId,
          type: envelope.type.replace(/\./g, '_'),
          title,
          message,
          link: link || undefined,
          is_read: false,
        })
        .execute();
    } catch (error) {
      logger.error('Failed to create in-app notification', {
        eventId: envelope.id,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up
  }
}
