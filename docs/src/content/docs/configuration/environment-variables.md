---
title: Environment Variables
description: The complete reference of environment variables that configure Assessors Studio, with defaults, descriptions, and guidance for production.
---

All configuration for Assessors Studio is driven by environment variables. The backend reads them at startup and validates them against a Zod schema; a malformed value fails fast with a descriptive error rather than producing surprising behavior at runtime.

Variables can be set in any of the usual places: a `.env` file next to the backend process, the environment section of a `docker-compose.yml`, a Kubernetes `ConfigMap` or `Secret`, or directly on the shell. The application does not care where a value comes from; it only reads the final environment.

## Core

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PROVIDER` | `pglite` | Database engine. Use `pglite` for embedded local development, `postgres` for production. |
| `DATABASE_URL` | `postgresql://localhost:5432/assessors_studio` | PostgreSQL connection string. Used when `DATABASE_PROVIDER=postgres`. |
| `PGLITE_DATA_DIR` | `./data/pglite` | Directory for the embedded database files. Ignored when using PostgreSQL. |
| `JWT_SECRET` | *auto generated* | Secret for signing session tokens. When unset the backend generates a secret on first run and stores it in the `app_config` table. Set explicitly (at least 32 characters) for multi replica deployments or to manage the key externally. Changing the value invalidates all active sessions. |
| `JWT_EXPIRY` | `24h` | Token lifetime. Accepts any value the `ms` library understands, for example `24h`, `7d`, `30m`. |
| `PORT` | `3001` | HTTP port the backend listens on. |
| `LOG_LEVEL` | `info` | Verbosity of application logs. One of `error`, `warn`, `info`, `debug`. |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin. The packaged container serves the SPA and the API on the same origin, so CORS is effectively a no op in that deployment. Set this when the API is called from a different origin, such as a Vite dev server during local work or a cross origin integration. |
| `APP_URL` | `http://localhost:5173` | Public base URL of the application (for example `https://studio.example.com`). Required for notification channels that include links back to the app. |
| `NODE_ENV` | `development` | Runtime environment: `development`, `production`, or `test`. |

## Initial administrator account

No environment variables are used to seed the initial administrator. The first account is created through the in browser setup wizard the first time the application is opened. When no users exist, the API responds to any request with a pointer to `/setup`. The SPA is always served and routes to the setup wizard automatically. Credentials are never written to configuration files, container images, or deployment manifests.

## Evidence storage

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_PROVIDER` | `database` | Where new evidence attachments are stored: `database` or `s3`. |
| `UPLOAD_MAX_FILE_SIZE` | `52428800` | Maximum upload size in bytes. Default is 50 MB. |
| `S3_BUCKET` | | Bucket name. Required when `STORAGE_PROVIDER=s3`. |
| `S3_REGION` | `us-east-1` | AWS region or S3 compatible region. |
| `S3_ENDPOINT` | | Custom endpoint URL for MinIO, DigitalOcean Spaces, Backblaze B2, Cloudflare R2, and other S3 compatible providers. Leave unset for AWS S3. |
| `S3_ACCESS_KEY_ID` | | Access key. Required when `STORAGE_PROVIDER=s3` unless the process runs with ambient AWS credentials (IRSA, instance role). |
| `S3_SECRET_ACCESS_KEY` | | Secret key. Required alongside `S3_ACCESS_KEY_ID`. |
| `S3_FORCE_PATH_STYLE` | `false` | Set to `true` for MinIO and other providers that require path style addressing. AWS S3 uses virtual host style by default. |

See [Evidence Storage](/administration/storage/) for guidance on choosing between database and object storage, and for migration scripts.

## Webhook channel

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_ENABLED` | `true` | Master toggle for the webhook notification channel. |
| `WEBHOOK_TIMEOUT` | `10000` | HTTP timeout for webhook deliveries, in milliseconds. |
| `WEBHOOK_MAX_RETRIES` | `5` | Maximum retry attempts for failed deliveries. |
| `WEBHOOK_DELIVERY_RETENTION_DAYS` | `30` | Days to retain webhook delivery logs before automatic purge. |

Individual webhook targets are configured through the admin UI and stored (encrypted) in the database, not through environment variables.

## Email channel (SMTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_ENABLED` | `false` | Master toggle for the email notification channel. |
| `SMTP_HOST` | | SMTP server hostname. |
| `SMTP_PORT` | `587` | SMTP server port. |
| `SMTP_SECURE` | `false` | Set to `true` for implicit TLS (typically port 465). |
| `SMTP_USER` | | Authentication username. |
| `SMTP_PASS` | | Authentication password. |
| `SMTP_FROM` | | Sender address. A common value is `"Assessors Studio" <noreply@example.com>`. |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` | Set to `false` only when using a self signed certificate in development. |

## Chat channels

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_ENABLED` | `false` | Enable Slack as a notification channel. |
| `TEAMS_ENABLED` | `false` | Enable Microsoft Teams as a notification channel. |
| `MATTERMOST_ENABLED` | `false` | Enable Mattermost as a notification channel. |
| `CHAT_TIMEOUT` | `10000` | HTTP timeout for chat deliveries, in milliseconds. |
| `CHAT_DELIVERY_RETENTION_DAYS` | `30` | Days to retain chat delivery logs before automatic purge. |

Individual chat destinations (channel, webhook URL) are configured through the admin UI.

## Prometheus metrics

| Variable | Default | Description |
|----------|---------|-------------|
| `METRICS_ENABLED` | `false` | Master toggle for the `/metrics` endpoint. |
| `METRICS_TOKEN` | | Bearer token required to scrape metrics. Leave empty for unauthenticated access. Recommended for any production installation that exposes metrics to a shared collector. |
| `METRICS_PREFIX` | `cdxa_` | Prefix applied to all exported metric names. |
| `METRICS_DOMAIN_REFRESH_INTERVAL` | `60` | Seconds between domain gauge refreshes. |

See [Metrics and Monitoring](/administration/metrics-and-monitoring/) for the metric catalog and alerting recommendations.

## Encryption at rest

| Variable | Default | Description |
|----------|---------|-------------|
| `MASTER_ENCRYPTION_KEY` | | 256 bit key encoded as 64 hex characters. Required in production when `REQUIRE_ENCRYPTION=true`. When unset, the encryption service operates in passthrough mode (values stored as plaintext). |
| `REQUIRE_ENCRYPTION` | `false` | When `true`, the application refuses to start if `MASTER_ENCRYPTION_KEY` is missing or too short. Production deployments should always set this to `true`. |
| `OLD_MASTER_ENCRYPTION_KEY` | | Only used by the `npm run rekey-master` CLI during master key rotation. Set this to the previous 64 character hex key so the script can decrypt existing values before re encrypting with the new key. Remove from the environment once the rekey completes. |

Generate a master key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

See [Encryption at Rest](/administration/encryption-at-rest/) for the key hierarchy, rotation procedure, and admin visibility.

## Identity providers

OpenID Connect is on the roadmap. When it ships, the `OIDC_*` environment variables will be documented here. Until then, the platform authenticates with local username and password only.

## Retention

| Variable | Default | Description |
|----------|---------|-------------|
| `AUDIT_LOG_RETENTION_DAYS` | `365` | Days to retain the audit log before automatic purge. Set higher if your compliance horizon requires it; set to `0` to retain indefinitely. |
| `SESSION_RETENTION_DAYS` | `90` | Days to retain expired sessions in the database before purge. |

## Feature flags

| Variable | Default | Description |
|----------|---------|-------------|
| `FEATURE_IMPORT_CDXA` | `true` | Enable import of CDXA standards. |
| `FEATURE_EXPORT_CDXA` | `true` | Enable export of CDXA attestations. |
| `FEATURE_BULK_OPERATIONS` | `true` | Enable bulk operations on claims and evidence (multi select rating, bulk evidence attachment). |

Feature flags default to on and are intended to let an administrator disable a capability that is not approved for their installation.

## Development only

These variables exist for development and test scenarios. Do not set them in production.

| Variable | Default | Description |
|----------|---------|-------------|
| `DEV_SEED_DATA` | `false` | Seed the database with sample users, standards, and assessments on first run. Intended for local evaluation; never enable in production. |
| `DEV_DISABLE_AUTH` | `false` | Disable authentication middleware. Every request is treated as an administrator. Never enable in production. Exists only to simplify local UI work. |

## Putting it together

A minimal production environment looks like:

```bash
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://assessors:<password>@db:5432/assessors_studio
STORAGE_PROVIDER=s3
S3_BUCKET=my-evidence
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
MASTER_ENCRYPTION_KEY=<64 hex chars>
REQUIRE_ENCRYPTION=true
JWT_SECRET=<32+ chars>
APP_URL=https://studio.example.com
CORS_ORIGIN=https://studio.example.com
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<user>
SMTP_PASS=<pass>
SMTP_FROM="Assessors Studio <noreply@example.com>"
METRICS_ENABLED=true
METRICS_TOKEN=<random 32 char>
NODE_ENV=production
LOG_LEVEL=info
```

Everything not listed above is optional or defaults to a safe value for production. Review the full table when you are configuring an integration you have not configured before.
