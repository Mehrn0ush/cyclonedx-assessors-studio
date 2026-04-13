/**
 * In-app notification channel.
 *
 * Thin wrapper for creating in-app notifications. The rules engine
 * handles recipient resolution and calls deliverToUser() directly.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { logger } from '../utils/logger.js';
import type { NotificationChannel } from './channel.js';
import type { EventEnvelope } from './types.js';
import { resolveRecipients } from './recipients.js';
import { buildTitle, buildMessage, buildLink, insertNotification } from './notification-utils.js';

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

    await insertNotification(db, envelope, userId, title, message, link);
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up
  }
}
