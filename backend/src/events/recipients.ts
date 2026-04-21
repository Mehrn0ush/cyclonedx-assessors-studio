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

// ---------------------------------------------------------------------------
// Affirmation resolvers
// ---------------------------------------------------------------------------
//
// Recipient policy per the PR3 design memo:
//   created           -> affirmation managers (so they know a new one
//                        needs slot assignment)
//   signatory_assigned-> the pinned user, if one is pinned. Unpinned
//                        slots notify no one because the audience is
//                        "any user with signing authority" and that is
//                        too broad for a targeted in app notification.
//   signed            -> affirmation managers (so they can seal)
//   seal_ready        -> affirmation managers (stronger nudge; the last
//                        slot just signed)
//   sealed            -> all slot signers + the assessment's assessors
//                        and assessees. Consumers of the record deserve
//                        to know the seal landed.
//   rescinded         -> same audience as sealed, because those same
//                        parties now need to know the seal no longer
//                        stands.
//
// All resolvers exclude the actor who triggered the event, since that
// user already knows.

async function getAffirmationManagerIds(db: Kysely<Database>): Promise<string[]> {
  const rows = await db
    .selectFrom('app_user')
    .innerJoin('role', 'role.id', 'app_user.role_id')
    .innerJoin('role_permission', 'role.id', 'role_permission.role_id')
    .innerJoin('permission', 'permission.id', 'role_permission.permission_id')
    .where('permission.key', '=', 'affirmations.manage')
    .where('app_user.is_active', '=', true)
    .select('app_user.id')
    .distinct()
    .execute();
  return rows.map((r) => r.id);
}

async function getAssessmentAudienceIds(
  db: Kysely<Database>,
  assessmentId: string,
): Promise<string[]> {
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
  return [
    ...assessors.map((r) => r.user_id),
    ...assessees.map((r) => r.user_id),
  ];
}

async function getSignerIdsForAffirmation(
  db: Kysely<Database>,
  affirmationId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom('affirmation_signatory')
    .where('affirmation_id', '=', affirmationId)
    .where('signed_by', 'is not', null)
    .select('signed_by')
    .execute();
  return rows
    .map((r) => r.signed_by)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function excludeActor(ids: Iterable<string>, actorId: string | null): string[] {
  const set = new Set(ids);
  if (actorId) set.delete(actorId);
  return [...set];
}

resolvers['affirmation.created'] = async (envelope, db) => {
  const managers = await getAffirmationManagerIds(db);
  return excludeActor(managers, envelope.actor.userId);
};

resolvers['affirmation.signatory_assigned'] = async (envelope, _db) => {
  const { requiredUserId } = envelope.data as { requiredUserId?: string | null };
  if (!requiredUserId) return [];
  return excludeActor([requiredUserId], envelope.actor.userId);
};

resolvers['affirmation.signed'] = async (envelope, db) => {
  const managers = await getAffirmationManagerIds(db);
  return excludeActor(managers, envelope.actor.userId);
};

resolvers['affirmation.seal_ready'] = async (envelope, db) => {
  const managers = await getAffirmationManagerIds(db);
  return excludeActor(managers, envelope.actor.userId);
};

resolvers['affirmation.sealed'] = async (envelope, db) => {
  const { affirmationId, assessmentId } = envelope.data as {
    affirmationId?: string;
    assessmentId?: string;
  };
  if (!affirmationId || !assessmentId) return [];
  const [signers, audience] = await Promise.all([
    getSignerIdsForAffirmation(db, affirmationId),
    getAssessmentAudienceIds(db, assessmentId),
  ]);
  return excludeActor([...signers, ...audience], envelope.actor.userId);
};

resolvers['affirmation.rescinded'] = async (envelope, db) => {
  const { affirmationId, assessmentId } = envelope.data as {
    affirmationId?: string;
    assessmentId?: string;
  };
  if (!affirmationId || !assessmentId) return [];
  const [signers, audience] = await Promise.all([
    getSignerIdsForAffirmation(db, affirmationId),
    getAssessmentAudienceIds(db, assessmentId),
  ]);
  return excludeActor([...signers, ...audience], envelope.actor.userId);
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
