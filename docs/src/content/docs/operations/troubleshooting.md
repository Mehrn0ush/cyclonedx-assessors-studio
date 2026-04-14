---
title: Troubleshooting
description: A diagnosis-first runbook for the problems operators see most often, with the exact checks to run and the fixes that usually resolve them.
---

This page is organized as a diagnosis first runbook. Each entry starts with a symptom, moves through the checks that narrow the cause, and ends with the fix. Look up the symptom; follow the checks in order; do not skip ahead.

## "Setup required" on the root URL

Symptom. The container is running but `GET /` returns a JSON body with `error: "Setup required"` instead of the SPA setup wizard.

Check. Confirm you are running a build that includes the SPA bypass fix for the setup middleware. The fix bypasses non API requests so the SPA shell can load and route the user to `/setup`.

Fix. Pull the latest patch release and restart. If you cannot upgrade immediately, point users directly at `/setup` (the setup API at `/api/v1/setup` is always accessible).

## Service will not start

Symptom. The container exits shortly after starting, before accepting any requests.

Check 1. Inspect the logs for a configuration error. The backend validates its environment with Zod and prints a detailed message when validation fails:

```
Environment validation failed:
  MASTER_ENCRYPTION_KEY: Required when REQUIRE_ENCRYPTION=true
  S3_BUCKET: Required when STORAGE_PROVIDER=s3
```

Fix the missing values and restart.

Check 2. If validation passed but the database connection fails, confirm the database host and port are reachable from the container and that the user has the correct permissions on the target database.

Check 3. If a schema migration fails, the service logs the offending migration name and the reason. Fix the underlying cause (usually a privilege issue or a conflict with manually edited schema) and restart.

## Health check returns 503

Symptom. `/api/health` returns 503 with `database: "error"` or `storage: "error"`.

Check. Read the `message` field in the response body for the specific cause.

Database error. The database is unreachable, the connection pool is saturated, or the credentials are wrong. Run `SELECT 1;` against the database from the same host to confirm reachability. Check the `DATABASE_URL` value and the database user's permissions. If the pool is saturated, find the slow queries with `SELECT * FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;` and investigate.

Storage error. The S3 bucket is unreachable. Confirm the endpoint resolves from the container, the credentials are valid, and the bucket exists with the correct policy. `aws s3 ls s3://<bucket>` (or the provider equivalent) from the container is the fastest check.

## Users cannot sign in

Symptom. A user reports sign in fails with an incorrect credentials message.

Check 1. Confirm the user exists and is active. The Users page under Administration shows active state for every user.

Check 2. Check the logs for the sign in attempt. A warning level log line records every failed sign in with the username, the reason, and the source IP.

Fix. Reset the user's password from the admin UI; administrators can send a one time reset link.

## Evidence uploads fail silently

Symptom. The user clicks upload and nothing happens; the evidence does not appear in the claim.

Check 1. The upload exceeded `UPLOAD_MAX_FILE_SIZE`. The backend returns 413; the frontend surfaces an inline error. Confirm the frontend error handling is showing the message (the default behavior does). Raise `UPLOAD_MAX_FILE_SIZE` if the upload is legitimate.

Check 2. A reverse proxy in front of the backend is rejecting the upload before it reaches the application. Common defaults are 1 MB (nginx) or 50 MB; raise the proxy's body size limit. nginx: `client_max_body_size 100m;`. Caddy: `request_body max_size 100MB`.

Check 3. The storage backend is unreachable. Check `/api/health` for `storage: error`. If database storage, check database reachability; if S3, check bucket reachability.

## Webhook deliveries never arrive

Symptom. A webhook target shows a recent delivery attempt but the receiver never sees the request.

Check 1. The delivery log records the response from the target. A 2xx response means the target received and accepted the request; the problem is on the target side. A 4xx or 5xx means the target rejected the request; correct the target's configuration.

Check 2. Network egress. The container may be in a network segment that cannot reach the target. Test with `curl -v <target URL>` from inside the container.

Check 3. The webhook signature. Assessors Studio signs every webhook payload; if the target verifies the signature, a mismatched secret makes the target return 401. Confirm the shared secret matches.

## Slack or Teams notifications do not appear

Symptom. The notification rule shows deliveries but the channel receives nothing.

Check 1. The channel webhook URL has been revoked or rotated. The delivery log records the response code; a 404 or 410 is the tell. Regenerate the webhook URL in the chat provider's admin UI and update the chat destination in Assessors Studio.

Check 2. The channel itself has been archived. Slack and Teams silently accept webhooks to archived channels without delivering them. Unarchive or pick a different channel.

## Attestations fail to sign

Symptom. Producing an attestation fails with a signing error.

Check 1. The signing key is missing. Producing a signed attestation requires a JSF compatible key configured for the signatory. Open the signatory's profile and confirm a signing key is attached.

Check 2. The master encryption key is missing or wrong. The signatory's signing key is stored encrypted; if the master key cannot unwrap the KEK, the signing key cannot be unwrapped either. Confirm `MASTER_ENCRYPTION_KEY` is set to the correct value.

Check 3. The CDXA document is malformed. Rare, but possible if an administrator has hand edited a standard. The logs include the specific validation error; fix the offending field in the standard.

## Metrics endpoint returns 401

Symptom. Prometheus scrapes fail with 401.

Check. The scraper must present the bearer token configured in `METRICS_TOKEN`. Confirm the Prometheus configuration includes:

```yaml
authorization:
  credentials: <METRICS_TOKEN value>
```

If `METRICS_TOKEN` is unset in the application environment, the endpoint is unauthenticated and no token is required.

## Database is growing faster than expected

Symptom. The PostgreSQL volume is approaching capacity.

Check 1. Evidence in database storage. If you are running with `STORAGE_PROVIDER=database` and evidence volume has grown, the database size is dominated by evidence. Migrate to object storage (see [Evidence Storage](/administration/storage/)).

Check 2. Webhook delivery log retention. `WEBHOOK_DELIVERY_RETENTION_DAYS` controls how long delivery logs are kept. Reduce the value if your volume is high and the retention is not required for audit.

Check 3. Audit log retention. `AUDIT_LOG_RETENTION_DAYS` controls audit log size. Reduce cautiously; the audit log is part of your compliance evidence.

Check 4. Vacuum. Run `VACUUM ANALYZE;` if the database has not been vacuumed recently. PostgreSQL's autovacuum handles most of this, but long running transactions can prevent reclamation.

## "Permission denied" on an action the user should have

Symptom. A user reports a permission error on an action their role should allow.

Check 1. Permission keys, not role names. Assessors Studio checks permission keys directly. If a custom role is missing a specific permission, the action fails even if the role seems comprehensive. Open the role in the admin UI and confirm the specific permission is granted.

Check 2. Group scoping. The user may have the permission but not the scope. If the record belongs to a group and the user is not in that group, the action is denied. Add the user to the group or remove the scope on the record.

Check 3. Session staleness. A permission change does not affect existing sessions until they refresh. Ask the user to sign out and back in.

## Performance has degraded

Symptom. Latency has increased across the board; nothing has visibly changed.

Check 1. Database statistics. Outdated statistics cause the query planner to pick poor plans. Run `ANALYZE;` on a PostgreSQL installation and compare.

Check 2. Evidence growth. If you are on database storage and evidence is large, the database may be thrashing its cache. Move to object storage.

Check 3. Event loop lag. Check `cdxa_nodejs_eventloop_lag_seconds` on the metrics endpoint. Sustained lag points to a synchronous operation in a hot path; review recent code changes.

Check 4. Noisy neighbor. On a shared host, another tenant may be consuming the resources. Check host level CPU, memory, and IO; move the container if necessary.

## "It was working yesterday"

The two most common changes that surface as mysterious problems a day later are:

Certificate rotation. An identity provider, a reverse proxy, or a database TLS certificate has been rotated overnight and the new certificate is not trusted. Check the certificate expiry on each connection.

Credential rotation. A service credential (SMTP password, S3 access key, webhook secret) has been rotated and the new value has not reached the container. Check that the credential in the container matches the live credential at the provider.
