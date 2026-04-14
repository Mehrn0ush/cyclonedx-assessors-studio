---
title: Users and Permissions
description: Managing user accounts, roles, and the permissions that govern what each role can do inside Assessors Studio.
---

Assessors Studio uses a permissions model where every action in the application is gated by a named permission key, and roles are named bundles of those keys. A user belongs to one or more roles, and their effective permissions are the union of the permissions granted to those roles. The system checks permission keys directly in the code; role names are never used as a shortcut.

## Viewing users

The Users page under Administration lists every account in the system along with the roles assigned to each, the active state of the account, and the last time the user signed in. Filters at the top narrow the list by role, by active state, or by free text against username, display name, and email. The list is paginated and can be sorted by any column.

Clicking a user opens the user detail drawer, which shows the full profile, assigned roles, group memberships if any, the last few authentication events, and the activity the user has generated in the application. Administrators edit the user from this drawer.

## Creating a user

An administrator can create a user directly from the Users page. The form collects:

- Username for sign in.
- Display name shown throughout the UI.
- Email address for notification delivery.
- Initial password, or an option to send the user a one-time setup link.
- One or more roles.

Newly created users are active by default. The first time a user signs in with a one-time link they are required to choose their own password.

OpenID Connect provisioning is on the roadmap. When it ships, users will be provisionable through an OIDC compliant identity provider: the provider will supply the username, display name, email, and (optionally) a role hint, and an administrator will be able to adjust the role assignment afterwards. Until then, every account is created locally.

## Roles

Roles are the unit of permission grant. Assessors Studio ships with a default set of roles that covers most organizations, and administrators can define additional roles for teams with unusual requirements.

The default roles are:

Administrator. Full access to every permission in the system, including user management, integrations, encryption operations, and all data. An installation always has at least one administrator; the setup wizard creates it.

Assessor. Permission to plan and carry out assessments: create assessments, work claims, attach evidence, rate claims, and produce attestations. An assessor cannot manage users, change integrations, or perform encryption operations.

Assessee. Permission to respond to evidence requests, attach evidence, view their open items, and comment on claims they are asked about. An assessee cannot plan assessments, rate claims, or produce attestations.

Standards Manager. Permission to create and edit standards through the draft lifecycle. Standards managers can import a CDXA standard, author one from scratch, and advance it through draft and review states. They cannot publish a standard; publication requires the Standards Approver role.

Standards Approver. Permission to review and publish standards. An approver signs off on a standard after a standards manager has completed it.

Auditor (read only). Permission to view every assessment, every standard, and every attestation, but not to change anything. This role is intended for regulators or external reviewers who need visibility without the risk of unintended edits.

## Permissions

Every action is backed by a permission key. Permission keys follow a `resource.action` pattern so they are easy to read in audit logs. A few examples:

- `assessments.create`, `assessments.update`, `assessments.delete`
- `claims.rate`, `claims.comment`
- `evidence.upload`, `evidence.delete`
- `standards.draft`, `standards.review`, `standards.publish`
- `attestations.sign`, `attestations.export`
- `users.create`, `users.update`, `users.impersonate`
- `admin.integrations`, `admin.encryption.rotate`

The full list is visible in the Roles administration page; each role shows every permission it grants. Permissions cannot be granted directly to users; they always flow through a role assignment.

## Custom roles

An administrator can create a custom role by choosing a name, a description, and the set of permissions the role should grant. Custom roles are useful when an organization has a team that does not fit neatly into the default roles. A common example is a small team that runs read-only audits on behalf of the internal audit function; creating a role called "Internal Audit" with read-only permissions on assessments and attestations captures the intent without overloading the default Auditor role.

Custom roles participate in the same permission lookup as default roles. Nothing in the code distinguishes them from the built in set.

## Groups

Large organizations often model teams as groups. A group is a named collection of users; roles can be granted to a group, and every user in the group inherits the roles of the group. Groups do not grant permissions directly; they are a convenience for bulk role assignment.

Groups can also be used to scope record access. An entity or an assessment can be restricted to a group, which means only users in that group can read it. Scoped access is additive to role based permissions: a user must both be in the scope and have the permission for the action.

## Deactivating users

A user who leaves the organization should be deactivated rather than deleted. Deactivation prevents sign in and removes the user from every group, but it preserves the user's activity history so claims and attestations they participated in remain attributable. The Users page supports deactivation from the detail drawer, and the action is reversible.

Deleting a user is supported but should be reserved for cases where the account was created in error. Deletion preserves activity by substituting a system placeholder for the user in historical records, so audit trails remain coherent.

## Authentication

Authentication today uses local username and password, with passwords hashed using argon2id. Multi factor authentication is supported through an authenticator app compatible with the TOTP standard.

OpenID Connect is on the roadmap. When it ships, OIDC will integrate with any OIDC compliant identity provider, and multi factor authentication for federated accounts will be delegated to the provider.

The authentication configuration is driven by environment variables and is covered in [Environment Variables](/configuration/environment-variables/).

## Audit log

Every permission sensitive action writes to an audit log: account creation, role change, permission change, password change, sign in, sign out, and every create or update on an administrative resource. The log is visible to administrators under Administration and is retained according to the organization's configured retention policy. It can also be exported for external review.

## Common workflows

Adding a new assessor. Create the user, assign the Assessor role, and optionally add the user to a group that scopes access to a specific set of entities. Send the one-time setup link.

Moving a user between teams. Remove the user from the previous group and add them to the new group. Role assignments inherited from the group change automatically.

Granting temporary elevated access. Create a custom role with the specific permissions needed for the task, assign it to the user, and revoke the assignment when the task is done. The audit log captures the grant and the revocation.

Handling a departing employee. Deactivate the user as part of the off boarding process. Their activity remains attributable in history; their account cannot be used to sign in; their group memberships are removed so any scoped access is dropped.
