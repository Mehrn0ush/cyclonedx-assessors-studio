/**
 * Single source of truth for the set of role keys this build of the
 * application recognizes.
 *
 * The same five values are also enforced by:
 *  - the `app_user.role` CHECK constraint in db/migrate.ts
 *  - the `user_invite.intended_role` CHECK constraint in db/migrate.ts
 *  - the seeded rows in the `role` table (db/seed.ts)
 *  - the Kysely type definitions in db/types.ts
 *
 * When this list changes, those four call sites must change in lockstep.
 *
 * Note on the authorization model: at runtime, access decisions are
 * driven by permission keys looked up via role_permission joins, not by
 * the role key string. This constant is only used for input validation
 * on endpoints that persist a role key into the database.
 */
export const VALID_ROLE_KEYS = [
  'admin',
  'assessor',
  'assessee',
  'standards_manager',
  'standards_approver',
] as const;

export type RoleKey = typeof VALID_ROLE_KEYS[number];
