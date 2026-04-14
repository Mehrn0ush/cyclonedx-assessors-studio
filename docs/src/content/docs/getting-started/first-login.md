---
title: First Login
description: Walk through the setup wizard on a fresh Assessors Studio install to seed the first administrator account.
---

On a fresh install, Assessors Studio has no users. The first person to visit the application is redirected to the setup wizard, where they create the initial administrator account. This page walks through the wizard step by step and explains the decisions you are making as you go.

:::note
The setup wizard only appears when the user table is empty. After the first administrator is created, every subsequent request goes through normal authentication. If you need to reset the wizard on a test system, see [Troubleshooting](/operations/troubleshooting/#resetting-the-setup-wizard).
:::

## Before you begin

The administrator account you create in the wizard carries every permission in the system. Treat it like the root user on a server: keep it named after a real person, store the password in a password manager, and as soon as the first admin is active, invite co-administrators and enable multi-factor authentication on the shared account store if your authentication model supports it.

You will need an email address, a display name, a username, and a password at least twelve characters long. The wizard does not send any email, so the address you enter is only used for notifications later.

## Step 1: Welcome screen

Navigate to the application URL in a browser. If the service is reachable and the user table is empty, the browser is redirected to `/setup`. The welcome screen identifies the installation you are about to configure (by name and build) and offers a single button to continue.

If you do not see the welcome screen and instead see the normal sign-in page, it means an administrator already exists. Sign in with existing credentials, or, on a system you control, see [Troubleshooting](/operations/troubleshooting/#resetting-the-setup-wizard) to start over.

## Step 2: Administrator details

Enter a username, a display name, an email address, and a password. The display name is what other users see next to your comments and actions; the username is what you type when you sign in. The email address is used for notification delivery, not for verification: no confirmation email is sent.

The password must be at least twelve characters long, and the wizard enforces a complexity check before accepting the form. Passwords are hashed with argon2id, so there is no way to recover a forgotten password from the database; you would have to reset it through the administration UI after signing back in.

## Step 3: Confirm and create

The wizard displays a summary of the account it is about to create. Confirm the information is correct and click Create. The system writes the user record, marks the setup as complete, and signs you in automatically. From that point onward the system is live.

## What happens next

You are landed on the administrator dashboard. The first things most people do are:

1. Visit the [Users and Permissions](/administration/users-and-permissions/) page and invite at least one additional administrator. Running with a single admin account is a durability risk.
2. Visit the [Integrations](/administration/integrations/) page and configure the notification channels your organization uses. Even on a fresh install, you probably want outgoing email and at least one chat integration.
3. Import or author your first standard through the [Standards Lifecycle](/administration/standards-lifecycle/).
4. Enroll the first entity you intend to assess.

The [Guided Tour](/getting-started/tour/) page gives a walkthrough of the interface. The [Your First Assessment](/getting-started/first-assessment/) page takes you through an end-to-end assessment so you can see the full workflow before you set one up for real.
