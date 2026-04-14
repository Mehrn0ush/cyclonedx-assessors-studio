---
title: Logging
description: The application log format, how to configure verbosity, what to capture in aggregation, and how to correlate logs with requests.
---

Assessors Studio emits structured JSON logs to standard out. One line per event, each line a self contained JSON object. The format is deliberately simple: it is designed to be grep friendly on a developer laptop and ship friendly to any log aggregation platform without transformation.

## Log format

A typical log line looks like:

```json
{"level":"info","time":"2026-04-13T10:42:17.841Z","requestId":"a1c3","method":"POST","path":"/api/v1/assessments","status":201,"duration":"47ms","userId":"u_2f3a","message":"HTTP request"}
```

Every line includes:

- `level`: `error`, `warn`, `info`, or `debug`.
- `time`: ISO 8601 timestamp in UTC.
- `message`: short human readable description of the event.

Request scoped lines additionally include:

- `requestId`: unique ID for correlation, also returned in the `X-Request-Id` response header.
- `method`, `path`, `status`, `duration`: HTTP context.
- `userId`: authenticated user, if any.

Domain events include whatever context is relevant to the event: `assessmentId`, `claimId`, `standardId`, `entityId`, and so on. Nested objects are flattened where it helps searchability.

## Configuring verbosity

`LOG_LEVEL` controls which lines are emitted:

- `error`: errors only. Too quiet for most operations.
- `warn`: errors and warnings. Adequate for mature installations.
- `info`: errors, warnings, and every HTTP request. Recommended default.
- `debug`: everything, including internal state transitions. Noisy; useful for diagnosing a specific problem, not for steady state operation.

`LOG_LEVEL=info` is the recommended production setting. It captures enough context to diagnose real incidents without flooding the log pipeline.

## What is logged

Every HTTP request is logged at `info` with method, path, status, duration, request ID, and user ID. This covers the bulk of log volume and is the most useful signal for spotting regressions.

Domain events are logged at `info` when they are interesting for audit or debugging: a claim rated, an attestation produced, a standard published, a user role changed, an encryption key rotated. Each of these also writes a corresponding audit log row in the database, but the stdout log line is useful for real time dashboards and ad hoc search.

Unexpected errors are logged at `error` with a stack trace. Expected errors (validation failures, permission denied, not found) are logged at `warn` without a stack trace; they are part of normal operation and do not indicate a defect.

Integration deliveries (webhooks, chat, email) are logged at `info` when they succeed and at `warn` when they fail. Every retry logs a line so the retry path is observable.

## What is not logged

Secrets, credentials, tokens. The logger redacts known sensitive fields: passwords, API keys, JWTs, encryption keys, and integration secrets. Adding a new secret to a log message is a defect and should be caught in code review.

Full request bodies. Bodies are routinely larger than a log line should be, and they often contain evidence files or sensitive content. The logger records body size rather than body content.

Response bodies. Same reason. The status code, duration, and size are enough to diagnose most problems; when the body matters for an investigation, attach a debugger rather than log it.

Personal data beyond user ID. A user's display name, email, role, and department are not routinely logged. Those fields are available in the database if an investigation needs them.

## Collecting logs

The application writes to standard out. Any log collection strategy that reads container stdout works:

- Docker Compose: `docker compose logs -f app` during development; a log driver (json-file with rotation, fluentd, journald) for production.
- Kubernetes: the default is fine for development; for production, collect with Fluent Bit, Vector, Promtail, or whatever your platform provides.
- Bare metal: run the binary under systemd and let the journal capture stdout.

Do not route logs through a file on disk unless you have no alternative. Direct stdout collection is simpler, works with any orchestrator, and avoids rotation problems.

## Searching

Because every line is JSON, a log aggregator that parses JSON (Loki with Promtail, Elastic with Filebeat, Datadog Logs, Splunk, CloudWatch Logs Insights) gives you searchable fields without additional parsing.

Useful queries:

All errors in the last hour:

```
{level="error"} | range 1h
```

All requests by a specific user:

```
{userId="u_2f3a"}
```

Requests that took longer than a second:

```
{path=~"/api/.*"} | duration > 1000ms
```

All delivery failures for a specific webhook target:

```
{message="webhook delivery failed", targetId="wh_abc"}
```

## Correlating logs with requests

Every HTTP request carries a `X-Request-Id` response header. The same ID appears in every log line for that request. When a user reports a bug, ask them for the request ID from their browser devtools; searching for that ID gives you the exact log trail for their session.

Request IDs are also included in error responses (in the JSON body under `requestId`). Support can quote the ID back to engineering without the user needing to inspect network traffic.

## Retention

Assessors Studio does not retain logs itself; it emits them and leaves retention to the log aggregation platform. Pick a retention window that covers your audit horizon: 90 days for routine operations, 1 year for compliance investigations, 7 years for regulatory archives. Organizations with multiple retention needs typically ship to two destinations: a short retention operational store (hot, indexed, searchable) and a long retention cold store (S3 + parquet, or the log platform's archive tier).

Audit events additionally write to the `audit_log` table in the database, which is retained according to `AUDIT_LOG_RETENTION_DAYS`. The audit log is the authoritative record for attestation signing, permission changes, and key rotations. Do not rely on stdout logs alone for compliance evidence.

## Common pitfalls

Setting `LOG_LEVEL=debug` in production. Debug level logging is noisy enough to bury signal in noise and to overrun log pipeline budgets. Use `debug` for short investigations, then switch back to `info`.

Logging request bodies in a custom middleware. Tempting during development, dangerous in production. Evidence uploads contain potentially sensitive data. Never log the body; log the size and the metadata.

Losing request IDs by logging with `console.log`. The application logger automatically attaches the request ID; a stray `console.log` does not. Route all logs through the logger utility (`src/utils/logger.ts`).

Parsing logs as text. The log format is JSON. Parsing it as plain text means every field is a substring match, which is fragile and misses structure. Configure the aggregator to parse JSON up front.
