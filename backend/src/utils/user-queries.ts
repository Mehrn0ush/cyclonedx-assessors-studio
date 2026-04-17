/**
 * Shared user query helper functions.
 * Extracted from auth.ts and users.ts to reduce duplication.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * Standard user select columns for profile responses.
 *
 * Intentionally excludes password_hash and any other secret material,
 * so callers can forward the row straight into a JSON response without
 * worrying about leaking credentials. Notification identifiers
 * (slack_user_id, teams_user_id, mattermost_username) and the
 * email_notifications preference are included because formatUserProfile
 * surfaces them on /me-shaped responses, and the frontend relies on
 * them to drive the notification settings pane.
 */
export const USER_PROFILE_COLUMNS = [
  'id',
  'username',
  'email',
  'display_name',
  'role',
  'is_active',
  'has_completed_onboarding',
  'slack_user_id',
  'teams_user_id',
  'mattermost_username',
  'email_notifications',
  'last_login_at',
  'created_at',
] as const;

/**
 * Fetch a user by ID with all standard profile fields.
 */
export async function fetchUserById(db: Kysely<Database>, userId: string) {
  return db
    .selectFrom('app_user')
    .where('id', '=', userId)
    .select(USER_PROFILE_COLUMNS)
    .executeTakeFirst();
}

/**
 * Fetch a user by username.
 */
export async function fetchUserByUsername(db: Kysely<Database>, username: string) {
  return db
    .selectFrom('app_user')
    .where('username', '=', username)
    .selectAll()
    .executeTakeFirst();
}

/**
 * Fetch a user by email.
 */
export async function fetchUserByEmail(db: Kysely<Database>, email: string) {
  return db
    .selectFrom('app_user')
    .where('email', '=', email)
    .selectAll()
    .executeTakeFirst();
}

/**
 * Fetch a user with minimal fields for assignment pickers.
 */
export async function fetchAssignableUsers(db: Kysely<Database>) {
  return db
    .selectFrom('app_user')
    .where('is_active', '=', true)
    .select(['id', 'display_name', 'username', 'role'])
    .orderBy('display_name', 'asc')
    .execute();
}

/**
 * Format user profile response object.
 *
 * Returns only the fields that are safe to expose on the wire. Never
 * include password_hash or any other secret material here. Notification
 * identifiers and preferences are optional on the input and are passed
 * through when present; that lets the auth /me endpoints and the
 * notification-rules routes share a single projection without leaking
 * server-only columns.
 */
export function formatUserProfile(user: {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  role: string;
  has_completed_onboarding?: boolean | null;
  slack_user_id?: string | null;
  teams_user_id?: string | null;
  mattermost_username?: string | null;
  email_notifications?: boolean | null;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    hasCompletedOnboarding: user.has_completed_onboarding || false,
    slackUserId: user.slack_user_id ?? null,
    teamsUserId: user.teams_user_id ?? null,
    mattermostUsername: user.mattermost_username ?? null,
    emailNotifications: user.email_notifications ?? true,
  };
}
