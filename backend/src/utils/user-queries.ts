/**
 * Shared user query helper functions.
 * Extracted from auth.ts and users.ts to reduce duplication.
 */

import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/**
 * Standard user select columns for profile responses.
 */
export const USER_PROFILE_COLUMNS = [
  'id',
  'username',
  'email',
  'display_name',
  'role',
  'is_active',
  'has_completed_onboarding',
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
 */
export function formatUserProfile(user: {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  role: string;
  has_completed_onboarding?: boolean | null;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    hasCompletedOnboarding: user.has_completed_onboarding || false,
  };
}
