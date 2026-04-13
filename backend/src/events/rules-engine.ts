/**
 * Notification Rules Engine.
 *
 * Evaluates notification rules against events to determine which users
 * should receive notifications via which channels. Replaces hardcoded
 * recipient resolution in recipients.ts.
 */

import type { Kysely, Selectable } from 'kysely';
import type { Database } from '../db/types.js';
import { logger } from '../utils/logger.js';
import type { EventEnvelope } from './types.js';
import type { NotificationRule } from '../db/types.js';
import { ChannelRegistry } from './channel-registry.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Result of evaluating a rule against an event.
 * Contains the rule, the target user(s), and the resolved destination.
 */
export interface RuleMatch {
  rule: Selectable<NotificationRule>;
  userId?: string;
  destination?: Record<string, unknown>;
}

export class RulesEngine {
  private getDb: () => Kysely<Database>;
  private channelRegistry: ChannelRegistry | null = null;

  constructor(getDb: () => Kysely<Database>) {
    this.getDb = getDb;
  }

  /**
   * Set the channel registry (needed for dispatching to channels).
   */
  setChannelRegistry(registry: ChannelRegistry): void {
    this.channelRegistry = registry;
  }

  /**
   * Evaluate all enabled rules against an event.
   * Returns matches: rule, userId, and resolved destination.
   */
  async evaluate(envelope: EventEnvelope): Promise<RuleMatch[]> {
    const db = this.getDb();
    const matches: RuleMatch[] = [];

    // Get all enabled rules
    const rules = (await db
      .selectFrom('notification_rule')
      .where('enabled', '=', true)
      .selectAll()
      .execute()) as Selectable<NotificationRule>[];

    for (const rule of rules) {
      // Check if event type is in the rule's event_types
      const eventTypes = Array.isArray(rule.event_types) ? rule.event_types : (rule.event_types || []);
      if (eventTypes.length > 0 && !eventTypes.includes(envelope.type) && !eventTypes.includes('*')) {
        continue;
      }

      // Handle system vs. user scoped rules
      if (rule.scope === 'system') {
        // System rules can apply to everyone (no user_id filter needed)
        const match = await this.evaluateRule(rule, envelope);
        if (match) {
          matches.push(match);
        }
      } else if (rule.scope === 'user' && rule.user_id) {
        // User rules only apply to that user
        // Exclude the actor from their own notifications
        if (envelope.actor.userId === rule.user_id) {
          continue;
        }

        const match = await this.evaluateRule(rule, envelope);
        if (match) {
          match.userId = rule.user_id;
          matches.push(match);
        }
      }
    }

    return matches;
  }

  /**
   * Evaluate a single rule against an event.
   * Returns a RuleMatch if filters pass, null otherwise.
   */
  private async evaluateRule(rule: Selectable<NotificationRule>, envelope: EventEnvelope): Promise<RuleMatch | null> {
    const db = this.getDb();
    const filters = rule.filters || {};

    // Evaluate each filter
    if (filters.my_assessments) {
      const assessmentId = envelope.data.assessmentId as string | undefined;
      if (!assessmentId || !rule.user_id) {
        return null;
      }

      // Check if user is an assessor or assessee on this assessment
      const isParticipant = await db
        .selectFrom('assessment_assessor')
        .where('assessment_id', '=', assessmentId)
        .where('user_id', '=', rule.user_id)
        .executeTakeFirst();

      if (!isParticipant) {
        const isAssessee = await db
          .selectFrom('assessment_assessee')
          .where('assessment_id', '=', assessmentId)
          .where('user_id', '=', rule.user_id)
          .executeTakeFirst();

        if (!isAssessee) {
          return null;
        }
      }
    }

    if (filters.my_evidence) {
      const authorId = envelope.data.authorId as string | undefined;
      if (!authorId || authorId !== rule.user_id) {
        return null;
      }
    }

    if (filters.my_projects) {
      const projectId = envelope.data.projectId as string | undefined;
      if (!projectId || !rule.user_id) {
        return null;
      }

      // For now, we don't have a project membership table, so skip this filter
      // In the future, this would check the project_user or similar table
      logger.debug('my_projects filter not yet fully implemented');
    }

    if (filters.specific_project && filters.specific_project_value) {
      const projectId = envelope.data.projectId as string | undefined;
      if (projectId !== filters.specific_project_value) {
        return null;
      }
    }

    if (filters.specific_standard && filters.specific_standard_value) {
      const standardId = envelope.data.standardId as string | undefined;
      if (standardId !== filters.specific_standard_value) {
        return null;
      }
    }

    if (filters.specific_assessment && filters.specific_assessment_value) {
      const assessmentId = envelope.data.assessmentId as string | undefined;
      if (assessmentId !== filters.specific_assessment_value) {
        return null;
      }
    }

    // Resolve destination based on channel
    const destination = await this.resolveDestination(rule);
    if (!destination && rule.channel !== 'in_app') {
      // in_app doesn't need a resolved destination
      return null;
    }

    return {
      rule,
      destination,
    };
  }

  /**
   * Resolve the delivery destination for a rule based on channel and user profile.
   */
  private async resolveDestination(rule: Selectable<NotificationRule>): Promise<any> {
    if (rule.channel === 'in_app') {
      return {};
    }

    if (!rule.user_id) {
      return rule.destination;
    }

    const db = this.getDb();
    const user = await db
      .selectFrom('app_user')
      .where('id', '=', rule.user_id)
      .selectAll()
      .executeTakeFirst();

    if (!user) {
      return null;
    }

    switch (rule.channel) {
      case 'email':
        return { email: user.email };
      case 'slack':
        if (!user.slack_user_id) {
          logger.debug('User has no Slack ID', { userId: rule.user_id });
          return null;
        }
        return { slackUserId: user.slack_user_id };
      case 'teams':
        if (!user.teams_user_id) {
          logger.debug('User has no Teams ID', { userId: rule.user_id });
          return null;
        }
        return { teamsUserId: user.teams_user_id };
      case 'mattermost':
        if (!user.mattermost_username) {
          logger.debug('User has no Mattermost username', { userId: rule.user_id });
          return null;
        }
        return { mattermostUsername: user.mattermost_username };
      case 'webhook':
        return rule.destination; // Use configured webhook endpoint
      default:
        return null;
    }
  }

  /**
   * Process an event: evaluate rules and dispatch to appropriate channels.
   */
  async processEvent(envelope: EventEnvelope): Promise<void> {
    if (!this.channelRegistry) {
      logger.warn('RulesEngine: ChannelRegistry not set, skipping event processing');
      return;
    }

    try {
      const matches = await this.evaluate(envelope);

      // Group matches by channel
      const byChannel: Record<string, RuleMatch[]> = {};
      for (const match of matches) {
        const channel = match.rule.channel;
        if (!byChannel[channel]) {
          byChannel[channel] = [];
        }
        byChannel[channel].push(match);
      }

      // Dispatch to each channel
      for (const [channelName, channelMatches] of Object.entries(byChannel)) {
        if (channelName === 'in_app') {
          // Special handling for in-app: create notifications directly
          await this.deliverInApp(envelope, channelMatches);
        } else {
          // Other channels are dispatched via the channel registry
          const channel = this.channelRegistry.getChannel(channelName);
          if (channel && channel.handles(envelope)) {
            // For now, the channel's process() handles it
            // In future, we could call a specialized method with matches
            await channel.process(envelope);
          }
        }
      }
    } catch (error) {
      logger.error('RulesEngine: Error processing event', {
        eventId: envelope.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Deliver in-app notifications to matched users.
   */
  private async deliverInApp(envelope: EventEnvelope, matches: RuleMatch[]): Promise<void> {
    const db = this.getDb();
    const title = this.buildTitle(envelope);
    const message = this.buildMessage(envelope);
    const link = this.buildLink(envelope);

    for (const match of matches) {
      const userId = match.rule.user_id || match.userId;
      if (!userId) {
        continue;
      }

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
  }

  /**
   * Build a human readable notification title from an event envelope.
   */
  private buildTitle(envelope: EventEnvelope): string {
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
  private buildMessage(envelope: EventEnvelope): string {
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
        return `${this.buildTitle(envelope)}: ${name || type}`;
    }
  }

  /**
   * Build a link for the notification.
   */
  private buildLink(envelope: EventEnvelope): string | null {
    const { type, data } = envelope;

    if (type.startsWith('evidence.') && data.evidenceId) {
      return `/evidence/${String(data.evidenceId)}`;
    }
    if (type.startsWith('assessment.') && data.assessmentId) {
      return `/assessments/${String(data.assessmentId)}`;
    }
    if (type.startsWith('attestation.') && data.attestationId) {
      return `/attestations/${String(data.attestationId)}`;
    }
    if (type.startsWith('project.') && data.projectId) {
      return `/projects/${String(data.projectId)}`;
    }
    return null;
  }
}
