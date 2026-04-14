---
title: Metrics and Monitoring
description: Enabling the Prometheus metrics endpoint, the metrics Assessors Studio exposes, and recommended alerts.
---

Assessors Studio exposes application and domain metrics in Prometheus text format at `/metrics`. The endpoint is disabled by default; enabling it is a two line configuration change. Once enabled, the metrics are ready to be scraped by any Prometheus compatible collector and visualized in any Prometheus compatible dashboard.

## Enabling the endpoint

Set the following environment variables:

```bash
METRICS_ENABLED=true
METRICS_TOKEN=<random 32+ char token>
```

The token is optional but recommended; when set, scrapers must present it in the `Authorization: Bearer` header. When unset, the endpoint is accessible to anyone who can reach it.

Restart the service. The endpoint is live at `/metrics` on the same port as the rest of the application (default 3001).

## Metric catalog

Metrics are grouped into two classes: process and HTTP metrics that come from the Node.js runtime and the Express request pipeline, and domain metrics that reflect application state. All metric names are prefixed with `cdxa_` by default (override with `METRICS_PREFIX`).

### Process and HTTP

These metrics come from the standard Node.js and Express instrumentation. A non exhaustive list:

- `cdxa_process_cpu_seconds_total` — process CPU time.
- `cdxa_process_resident_memory_bytes` — resident set size.
- `cdxa_nodejs_eventloop_lag_seconds` — event loop lag.
- `cdxa_http_requests_total{method, route, status}` — total HTTP requests by route and status.
- `cdxa_http_request_duration_seconds{method, route}` — request duration histogram.

These are the metrics most operators care about for classic uptime and latency alerting.

### Domain

Domain metrics are refreshed periodically (controlled by `METRICS_DOMAIN_REFRESH_INTERVAL`, default 60 seconds). They describe the state of the application's records:

- `cdxa_users_total{active}` — count of users by active state.
- `cdxa_standards_total{state}` — count of standards by lifecycle state.
- `cdxa_assessments_total{state}` — count of assessments by state.
- `cdxa_claims_total{state}` — count of claims by state.
- `cdxa_evidence_total` — total evidence files.
- `cdxa_evidence_bytes` — total evidence bytes stored.
- `cdxa_attestations_total{state}` — count of attestations by state.
- `cdxa_notification_deliveries_total{channel, outcome}` — notification deliveries by channel and outcome.
- `cdxa_webhook_deliveries_total{outcome}` — webhook deliveries by outcome.
- `cdxa_encryption_fields_total{state}` — encrypted versus plaintext fields (useful during migration).

Refresh is a single query per metric; the default 60 second interval is adequate for most installations. Reduce it only if your organization runs dashboards that need second by second freshness.

## Scraping

A minimal Prometheus scrape configuration:

```yaml
scrape_configs:
  - job_name: assessors-studio
    scrape_interval: 30s
    metrics_path: /metrics
    scheme: https
    authorization:
      credentials: <METRICS_TOKEN value>
    static_configs:
      - targets: ['studio.example.com:443']
```

For installations behind a reverse proxy that terminates TLS, keep `scheme: https` and point the target at the proxy's public port. For direct scraping of the container (on a private network), use `scheme: http` and the container port.

## Recommended dashboards

The metrics catalog is small enough to fit on two dashboards.

Operations dashboard. Process CPU and memory, event loop lag, HTTP request rate by route, HTTP error rate by route, HTTP p50/p95/p99 latency, notification and webhook delivery outcomes. Intended for the on call operator.

Program dashboard. Users active, standards published, assessments in progress, claims by state, evidence volume, attestations produced. Intended for the program owner tracking adoption and output.

Grafana dashboards that match these two views are packaged with the repository under `deploy/grafana/` and can be imported directly.

## Recommended alerts

These alerts catch the problems operators see most often.

High error rate. Alert when the 5 minute HTTP 5xx rate exceeds 1% of total requests. Threshold may need tuning depending on normal traffic, but a sustained 5xx rate points to either a broken dependency (database, SMTP, identity provider) or a regression.

Event loop lag. Alert when `cdxa_nodejs_eventloop_lag_seconds` exceeds 0.2 for 5 minutes. Sustained event loop lag is a reliable early warning of a CPU bound regression or a synchronous file operation sneaking into a hot path.

Notification delivery failures. Alert when the 30 minute failure rate on any channel exceeds 10%. The channel owner (SMTP operator, Slack admin, webhook integrator) usually needs to know before the recipients do.

Encryption drift. Alert when `cdxa_encryption_fields_total{state="plaintext"}` is greater than zero outside of a known migration window. This catches the case where a new secret bypassed the encryption path.

Database disconnect. Alert when the `/api/health` endpoint has been failing for more than 2 minutes. The health endpoint exercises the database connection, so a sustained failure typically means the database has gone away.

## Logs

Application logs are emitted to stdout in structured JSON by default (controlled by `LOG_LEVEL`). They are not delivered through the metrics endpoint; collect them with whatever log aggregation platform the organization already runs (CloudWatch, Datadog, Loki, Splunk, ELK). See [Logging](/operations/logging/) for the log schema and advice on collecting and searching logs.

## Performance monitoring

Assessors Studio does not ship with an APM agent. If your organization uses Datadog, New Relic, or another APM, add the agent as a separate process in the container or as a sidecar. The application is a standard Node.js Express service, so any Node.js compatible APM agent works.

A simpler alternative is to rely on the HTTP latency histograms exposed via the Prometheus endpoint. For most installations those histograms are enough to spot regressions and to track the p95 latency trend over time.
