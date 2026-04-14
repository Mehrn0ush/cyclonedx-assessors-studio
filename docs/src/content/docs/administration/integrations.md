---
title: Integrations
description: Connecting Assessors Studio to notification channels, identity providers, object storage, and downstream consumers.
---

Assessors Studio is designed to cooperate with the rest of an organization's software stack rather than to replace it. Most integrations are enabled and configured through environment variables, with some runtime state (webhook targets, notification rules, chat destinations) managed through the admin UI. This page summarizes the integrations that ship with the platform, where they are configured, and what to check when one stops working.

## Identity providers

Authentication today is local username and password: passwords are hashed with argon2id and stored in the application database.

OpenID Connect is on the roadmap. When it ships, OIDC will integrate with any OIDC compliant provider (Okta, Entra ID, Keycloak, Auth0, Google Workspace). Identity provider configuration will be driven through environment variables, with role mapping applied on sign in from claims supplied by the provider.

## Notification channels

The event system fans out notable events (claim updates, assessment state changes, evidence uploads, attestation publications) to one or more notification channels. Four channels ship with the platform.

Webhook. A generic outbound HTTP channel. Assessors Studio signs every payload so a downstream receiver can verify authenticity, retries failed deliveries with exponential backoff, and retains delivery logs for audit. Enable with `WEBHOOK_ENABLED=true`; the targets themselves are managed through the admin UI.

Email (SMTP). Delivers transactional notifications to any SMTP server. Most organizations point this at their internal mail relay. Enable with `SMTP_ENABLED=true` and set the `SMTP_*` environment variables.

Chat. Delivers to Slack, Microsoft Teams, or Mattermost. Each provider has an independent toggle (`SLACK_ENABLED`, `TEAMS_ENABLED`, `MATTERMOST_ENABLED`); destinations (channel, webhook URL) are configured through the admin UI and are stored encrypted in the database.

In app. Every user has a notification inbox inside the platform. This channel is always on and cannot be disabled.

## Notification rules

Notification rules decide what gets sent to whom. A rule matches events by type (claim rated, attestation produced, assessment overdue), by scope (entity, standard, assessment), and by audience (role, user, group), then fans the event out to the configured channels. Rules are authored through the admin UI and stored in the database; they are not environment driven.

The Notification Rules page under Administration lists every active rule, the events it targets, the channels it delivers to, and the last delivery timestamp. Inactive rules are retained so they can be re enabled without losing their configuration. A rule can be tested from its detail page: the test fires a synthetic event and reports the resulting deliveries.

## Object storage

Evidence can be stored inside the application database or in an S3 compatible object store. Object storage is the recommended configuration for any installation with a meaningful volume of evidence, because it decouples evidence size from database size, simplifies backups, and lets operators take advantage of lifecycle policies on the bucket itself.

To enable object storage, set `STORAGE_PROVIDER=s3` and configure the `S3_*` variables. Any provider that speaks the S3 API works: AWS S3, MinIO, DigitalOcean Spaces, Backblaze B2, Cloudflare R2. Path style addressing is available for providers that require it. See [Evidence Storage](/administration/storage/) for the storage model and the trade offs between providers.

## Metrics

Prometheus style metrics are exposed at `/metrics`. The endpoint is disabled by default and must be enabled with `METRICS_ENABLED=true`. An optional bearer token (`METRICS_TOKEN`) restricts who can scrape. See [Metrics and Monitoring](/administration/metrics-and-monitoring/) for the metric catalog and how to plug it into Prometheus or Grafana.

## Import and export

Assessors Studio imports and exports standards as CDXA documents and assessments as CDXA attestations. Both are first class CycloneDX artifacts: any tool that speaks CycloneDX can consume them, and any tool that produces a conformant CDXA standard can be imported into the catalog.

Imports run through `/api/v1/import`; exports through `/api/v1/export`. Both endpoints accept credentials that map to the same role based permissions as the UI, so programmatic access respects the same authorization boundaries.

## API keys

Programmatic integrations authenticate with API keys rather than with user credentials. API keys are created through the UI under Administration and are tied to a user (for audit attribution) with a scoped set of permissions that can be a subset of the user's effective permissions. A key carries an expiration, a last used timestamp, and a revocation mechanism.

API keys are displayed once at creation. The system stores only the hash of the key; regenerating a key invalidates the previous one. Keys are delivered in the `X-Api-Key` header.

## Admin integrations page

The admin UI has a single Integrations page that shows the live state of every configured integration: which notification channels are enabled, whether the object store is reachable, whether the metrics endpoint is serving, how many API keys are active, and the most recent successful and failed delivery for each channel. The page is intended as the one stop view an operator checks when an integration is misbehaving.

The Integrations page does not itself change configuration for environment driven integrations; it surfaces their state so an operator can spot drift. Changes to SMTP or S3 settings still flow through environment variables and require a restart of the service to take effect.

## Common workflows

Enabling email notifications. Set `SMTP_ENABLED=true`, supply the `SMTP_*` variables, restart the service. Create a notification rule that targets the email channel for the events you care about. Test the rule from its detail page.

Adding a Slack destination. Set `SLACK_ENABLED=true`, restart the service. In the admin UI, add a Slack destination with the channel and webhook URL. Create a notification rule targeting the Slack channel. Test the rule.

Moving evidence to S3. Set `STORAGE_PROVIDER=s3`, supply the `S3_*` variables, restart the service. New evidence will land in the bucket; existing evidence remains in the database and is read from there. Run the migration script described in [Evidence Storage](/administration/storage/) to move existing evidence into the bucket.

Issuing an API key for CI. Under Administration, create an API key tied to a service account user with only the permissions the CI needs (typically `standards.read` and `attestations.export`). Store the key as a secret in the CI system and set it in the `X-Api-Key` header on API calls.
