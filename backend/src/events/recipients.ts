/**
 * Recipient resolution for in-app notifications.
 *
 * Each event type has a resolver that returns the user IDs who
 * should receive a notification.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import type { EventEnvelope } from './types.js';

export type RecipientResolver = (
  envelope: EventEnvelope,
  db: Kysely<Database>,
) => Promise<string[]>;

/**
 * Registry of resolvers keyed by event type.
 */
const resolvers: Record<string, RecipientResolver> = {};

/**
 * evidence.state_changed: notify the author when approved/rejected,
 * or the reviewer when submitted for review.
 */
resolvers['evidence.state_changed'] = async (envelope, _db) => {
  const { newState, authorId, reviewerId } = envelope.data as {
    newState?: string;
    authorId?: string;
    reviewerId?: string;
  };

  if (newState === 'in_review' && reviewerId) {
    return [reviewerId];
  }

  if ((newState === 'approved' || newState === 'claimed' || newState === 'in_progress') && authorId) {
    // "in_progress" here means a rejection (reviewer resets to in_progress)
    return [authorId];
  }

  return [];
};

/**
 * assessment.state_changed: notify all assessors and assessees
 * on the assessment.
 */
resolvers['assessment.state_changed'] = async (envelope, db) => {
  const { assessmentId } = envelope.data as { assessmentId?: string };
  if (!assessmentId) return [];

  const assessors = await db
    .selectFrom('assessment_assessor')
    .where('assessment_id', '=', assessmentId)
    .select('user_id')
    .execute();

  const assessees = await db
    .selectFrom('assessment_assessee')
    .where('assessment_id', '=', assessmentId)
    .select('user_id')
    .execute();

  const userIds = new Set([
    ...assessors.map((r) => r.user_id),
    ...assessees.map((r) => r.user_id),
  ]);

  // Exclude the actor who triggered the event
  if (envelope.actor.userId) {
    userIds.delete(envelope.actor.userId);
  }

  return [...userIds];
};

/**
 * assessment.created: notify admins and assessors on the project.
 */
resolvers['assessment.created'] = async (envelope, db) => {
  const { assessmentId } = envelope.data as { assessmentId?: string };
  if (!assessmentId) return [];

  const assessors = await db
    .selectFrom('assessment_assessor')
    .where('assessment_id', '=', assessmentId)
    .select('user_id')
    .execute();

  const assessees = await db
    .selectFrom('assessment_assessee')
    .where('assessment_id', '=', assessmentId)
    .select('user_id')
    .execute();

  const userIds = new Set([
    ...assessors.map((r) => r.user_id),
    ...assessees.map((r) => r.user_id),
  ]);

  if (envelope.actor.userId) {
    userIds.delete(envelope.actor.userId);
  }

  return [...userIds];
};

/**
 * Resolve recipients for the given event. Returns an empty array
 * if no resolver is registered for the event type.
 */
export async function resolveRecipients(
  envelope: EventEnvelope,
  db: Kysely<Database>,
): Promise<string[]> {
  const resolver = resolvers[envelope.type];
  if (!resolver) {
    return [];
  }
  return resolver(envelope, db);
}
