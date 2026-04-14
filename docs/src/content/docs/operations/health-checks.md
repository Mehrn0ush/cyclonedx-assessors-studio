---
title: Health Checks
description: The health and readiness endpoints, what they verify, and how to wire them into orchestrators and load balancers.
---

Assessors Studio exposes a single health endpoint at `/api/health`. It is inexpensive to call, safe to call frequently, and designed to be the primary liveness and readiness probe for the service.

## The endpoint

`GET /api/health` returns `200 OK` with a JSON body when the service is healthy:

```json
{
  "status": "ok",
  "version": "1.4.2",
  "uptime": 12345,
  "database": "ok",
  "storage": "ok"
}
```

A failing health check returns `503 Service Unavailable` with a JSON body describing what is wrong:

```json
{
  "status": "error",
  "database": "error",
  "message": "Database connection refused"
}
```

The endpoint is unauthenticated. It is safe to expose: it does not reveal any information that is not already implicit in whether the service is reachable.

## What is checked

The health check exercises three things.

The process. Returning any response at all means the Node.js process is alive and the HTTP server is accepting connections. A health check that times out or refuses the connection means the process or the socket is gone.

The database. Every health check runs a trivial `SELECT 1` through the database connection pool. If the database is unreachable, the connection pool is exhausted, or the credentials have changed under the process, the query fails and the health check reports `database: error`.

The storage backend. When `STORAGE_PROVIDER=s3`, the health check issues a `HEAD` on the configured bucket. If the bucket is unreachable or the credentials are wrong, the check reports `storage: error`. Database storage is implicitly covered by the database check.

The health check does not exercise SMTP, chat integrations, identity providers, or external webhooks. Those integrations can be broken without making the service unhealthy from an orchestrator's point of view.

## Readiness versus liveness

Assessors Studio uses a single endpoint for both. The cost of differentiating is not worth it for a service of this shape: the application either can serve requests or it cannot, and it does not have a warmup period where it is up but not ready.

If your orchestrator insists on two endpoints, point both probes at `/api/health`. Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3001
  initialDelaySeconds: 10
  periodSeconds: 30
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /api/health
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
```

Docker Compose:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 20s
```

AWS ALB / ELB target group: point the health check path at `/api/health`. Expected codes `200`.

## Interpreting failure

A failing health check is almost always one of these three causes.

Database down. The database process has stopped, the network between the backend and the database is interrupted, or the credentials have changed. Check the database is running, reachable, and that the credentials in `DATABASE_URL` match.

Database saturated. The connection pool is exhausted because the application is holding connections open on slow queries. The health check runs in the same pool and times out. Check for long running queries; on PostgreSQL, `SELECT * FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;` is a useful starting point.

Storage unreachable. The S3 endpoint is not responding, the DNS for the endpoint is broken, or the bucket was renamed or deleted. Check bucket reachability directly with the AWS CLI or equivalent; bring the endpoint back online before expecting the health check to pass.

## Setup state and the health check

The health check is always accessible, even when setup is incomplete. This is deliberate: an orchestrator should be able to verify that a freshly deployed container is alive before a human has logged in to complete the setup wizard. A container that fails its health check from the moment it starts would appear broken to orchestration systems that rely on the probe.

This means a healthy health check does not imply a ready installation. It means the process is alive and the infrastructure it depends on is reachable. The first time a user points a browser at `/`, the SPA routes them to `/setup`.

## Rate limiting

The health endpoint is exempt from the default rate limiter. Orchestrators typically probe every 5 to 30 seconds; the rate limiter would eventually flag that traffic as abusive even though it is normal infrastructure behavior. The exemption is scoped tightly to `/api/health` and nothing else.

## Common pitfalls

Probing too aggressively. A 1 second interval with a 100 millisecond timeout produces a lot of failed probes whenever the database is under any load. Start with 30 second intervals and loosen timeouts; Assessors Studio does not need subsecond probe fidelity.

Probing without the trailing slash. The endpoint is `/api/health`, not `/api/health/`. Strict proxies may reject the mismatch. Configure the probe with the exact path.

Expecting a specific response body. Health check responses include version and uptime, which change over time. Match on the HTTP status code (200 for healthy) rather than on the body.

Using the root path for health checks. Requests to `/` produce the SPA shell and are cached or rewritten by reverse proxies. Use `/api/health` so the probe exercises the actual service.
