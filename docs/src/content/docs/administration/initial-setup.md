---
title: Initial Setup Wizard
description: What the first-visit setup wizard does, when it is visible, and how to reset it on a test system.
---

The setup wizard is the first screen a fresh Assessors Studio install shows. It creates the initial administrator account and marks the installation as configured. This page is a reference for operators who need to understand what the wizard does, what it does not do, and how to handle edge cases.

## When the wizard appears

The wizard appears on any request to the application when the user table is empty. The system checks on every request; the first request (from any browser) is redirected to `/setup`, where the wizard form is displayed. As soon as an administrator is created, the check stops returning true and subsequent requests go through normal authentication.

The wizard does not use a flag file, a setup token, or any other out-of-band state. The condition is simply "zero users in the database." This means that if you restore an empty database from a backup, the wizard will be visible again until the first user is created, and that if you somehow removed every user from the database, the wizard would reappear.

## What the wizard does

The wizard creates a single user with the Administrator role and marks the user as active. The password is hashed with argon2id and stored in the users table. The user's id, created-at, and updated-at timestamps are populated. No other records are created: no standards, no entities, no integrations.

The wizard does not send an email. The address you enter is stored against the user record for notification delivery later, but no verification email or welcome email is sent. The password is what you typed; there is no reset link and no temporary password.

The wizard does not install or configure any integrations. Those are explicit post-setup steps, each with their own page in this section.

## Inputs

The wizard collects:

- Username (used for sign-in).
- Display name (the friendly name shown next to activity).
- Email address (for notification delivery, not verification).
- Password (at least twelve characters, argon2id-hashed).

All four fields are required. The username must be unique; since the system is empty, this check is a formality, but the constraint is enforced by the database.

## What the wizard is not

The wizard is not a reset path. If an administrator forgets their password, the wizard does not help; an existing administrator must reset the password through the Users administration page. If every administrator has lost access to the system, recovery requires direct database access; see [Troubleshooting](/operations/troubleshooting/).

The wizard is not a configuration step. It does not collect anything about SMTP, Slack, S3, encryption, or any other integration. Configuration is driven by environment variables and the in-app administrative pages, not by the wizard.

## Resetting on a test system

On a test system where you want to re-run the wizard, delete the users from the database and reload the page. The conventional path for a PGlite install is to stop the stack, delete the data volume, and start again; see [Troubleshooting](/operations/troubleshooting/#resetting-the-setup-wizard) for the exact commands for each deployment.

Do not reset the wizard on a production system. The act of deleting users invalidates active sessions for every other user, is destructive if anything else depends on those user records (comments, assessments, signed attestations), and is not a supported recovery path. If you have lost access to an administrator account in production, see [Operations: Troubleshooting](/operations/troubleshooting/) for the supported recovery workflow.

## Multi-replica installs

On a multi-replica install, the wizard is visible on any replica that sees an empty user table. In practice this means it is visible from every replica until the first user is created, after which the creation is visible to every replica through the shared database. The JWT signing secret should be set explicitly via `JWT_SECRET` on multi-replica installs so that tokens issued by one replica verify on any other replica; see [Environment Variables](/configuration/environment-variables/).
