---
title: Notifications
description: How notifications are generated, where they are delivered, and how users control their own preferences.
---

Notifications keep users informed about events that concern them without requiring them to check the application. The notification engine generates events for every meaningful state change in the system, routes them to the right people based on rules, and delivers them through the channels each user prefers.

## What generates a notification

Notifications are fired for events that require someone's attention or represent a material state change. Typical examples include:

- An assessment is assigned to you.
- A claim you are responsible for has been updated by a teammate.
- Evidence you requested has been attached.
- A comment addressed to you has been posted.
- A standard you own has been submitted for approval.
- An assessment you care about has entered Review or Completed state.
- An attestation you signed has been downloaded by an external consumer.

Not every event produces a notification for every user. The notification engine uses rules (configured by administrators) and per-user preferences to decide who hears about what.

## Where notifications arrive

The bell icon in the top bar opens the in-app notifications drawer. Every notification you have received is listed with a title, a short description, and a link through to the object it concerns. Unread notifications are highlighted; read notifications are retained so you can scroll back through recent activity.

Beyond the in-app drawer, notifications can be delivered through external channels:

- Email, for anyone with a valid email address configured.
- Slack, in a channel or via direct message, when the Slack integration is enabled.
- Microsoft Teams, via an incoming webhook the administrator configured.
- Mattermost, through the same mechanism.
- Webhooks, for downstream systems that consume notification payloads programmatically.

The administrator configures which channels are available and how the default routing works. See [Integrations](/administration/integrations/) for setup.

## Controlling your own preferences

Every user controls which notifications they receive through which channels. Open your profile menu and choose Preferences → Notifications to see the full matrix. Each event category (Assessment, Claim, Evidence, Standard, Attestation, Admin) can be independently routed to in-app, email, and any enabled chat channel.

A common pattern is to send everything to the in-app drawer (so nothing is lost), send the urgent categories (claim activity, evidence requests, direct mentions) to email, and send the collaborative categories to a team chat channel. You can override the default routing at any time; the administrator's defaults are suggestions, not locks.

## Digest vs real-time

For high-frequency categories, notifications can be batched into a periodic digest rather than delivered one at a time. The digest cadence is configurable per category: every hour, every four hours, once a day, or once a week. The digest collapses many events into a single message with a summary.

Real-time delivery is the default for events that require fast response (evidence requested of you, a comment mentioning you, a claim assigned to you). Digest mode is the default for events that are informational (a teammate updated a claim, a new attestation was downloaded).

## Muting and snoozing

You can mute a specific object (an entity, an assessment, a standard) to stop receiving notifications about it temporarily. Muting is reversible; snoozing is the same action with a time limit. Both operations are safe: muting does not change the underlying permissions, it only suppresses notifications for you.

## Administrator-level routing

Administrators can define organization-wide routing rules that ensure certain events always reach the right audience regardless of individual preferences. A rule might say "every overdue claim in a regulatory standard goes to the compliance Slack channel, every week, regardless of user preferences." These rules are layered on top of user preferences, not in place of them. The documentation for authoring rules is in [Integrations](/administration/integrations/).

## Debugging delivery

If a notification does not arrive, the notification log (accessible to administrators) records every attempt to deliver a notification, including the channel, the target, the outcome, and the response if there was one. A failed Slack delivery, for example, records the Slack error and the retry schedule. The log is the first place to look when a notification should have arrived and did not.
