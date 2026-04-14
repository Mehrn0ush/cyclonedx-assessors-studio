---
title: API and OpenAPI
description: How the Assessors Studio JSON API is organized, where to find the OpenAPI description, and the conventions that apply across every endpoint.
---

Every capability the UI exposes is also available as a JSON API. The UI itself is a client of the same API: there is no private backchannel, and no feature lives in the UI that is not also addressable programmatically. This page covers the shape of the API, how it is described, and the cross cutting conventions that apply to every endpoint. For the exhaustive endpoint reference, see the live OpenAPI description linked below; this page does not duplicate it.

## OpenAPI description

Assessors Studio serves an OpenAPI 3.1 description of its JSON API. The description is generated from the backend at build time so it never drifts from the running code.

Two surfaces expose the description:

| Location | Purpose |
| --- | --- |
| `GET /api/v1/openapi.json` | Machine readable OpenAPI document. Use this as the source of truth for code generation and contract tests. |
| `GET /api/v1/docs` | Human readable Swagger UI rendering of the same document. Useful for exploring endpoints and trying requests interactively. |

Both paths are served by every installation. In an evaluation install at `http://localhost:3001`, open `/api/v1/docs` in a browser to explore. The `openapi.json` artifact is also published on every snapshot release so clients can be generated without running the application.

A standalone HTML copy of the Swagger UI view is published at [https://docs.assessor.studio/api/](https://docs.assessor.studio/api/) for browsing without an installation.

## Version and base path

Every endpoint in the current API is served under `/api/v1`. The `v1` prefix is part of the URL contract: when a future major version ships, it will be served under `/api/v2` at the same origin, and both will coexist during a deprecation window.

During the alpha stream the JSON API may change without a full deprecation window. See [Release Notes](/reference/release-notes/) for the alpha versioning policy. At 1.0 the `v1` surface freezes and standard compatibility rules apply.

## Authentication

Every request that is not part of the initial setup flow must be authenticated. Two credential types are accepted:

| Credential | How to obtain | When to use |
| --- | --- | --- |
| Session cookie | Set automatically on sign in through `/api/v1/auth/login`. | Browser clients running on the same origin as the API. The UI uses this path. |
| API key | Created from the user profile or the Users administration page. Returned once at creation time and stored as a hash thereafter. | Server to server clients, CI pipelines, scripts. |

API keys are presented as a bearer token:

```http
Authorization: Bearer <api-key>
```

Every authenticated request carries the identity and permissions of the owner of the credential. API keys inherit the owner's role set at the moment of the request; revoking a role on the user immediately narrows what the key can do. Keys can be revoked independently from the profile page without affecting the underlying account.

## Authorization

Authorization uses the same permission keys documented on [Users and Permissions](/administration/users-and-permissions/). An authenticated caller may only invoke an endpoint if it holds the permission key the endpoint requires. Each endpoint in the OpenAPI description lists its required permission in the `x-required-permission` extension, so code generators and API gateways can enforce the same rules without reading the source.

When a call lacks the required permission the response is a 403 with a body that names the missing permission:

```json
{
  "error": "permission_denied",
  "message": "Missing permission: attestations.sign",
  "requestId": "a1c3"
}
```

## Request and response shape

Every request and response body is JSON. The server returns `application/json; charset=utf-8` on success and on error. Clients that need to send binary payloads (evidence file uploads) use `multipart/form-data`; the descriptor record for the evidence is still JSON.

Timestamps are ISO 8601 in UTC. Durations are strings with a unit suffix (`"47ms"`, `"2h"`). Identifiers are opaque strings prefixed by the type (`u_` for users, `as_` for assessments, `cl_` for claims, `ev_` for evidence, `at_` for attestations, `st_` for standards). Do not attempt to parse the prefix; treat the whole string as opaque.

Collection endpoints use cursor pagination. The response envelope is:

```json
{
  "items": [ /* ... */ ],
  "nextCursor": "b3BhcXVlLWN1cnNvcg==",
  "hasMore": true
}
```

Pass `?cursor=<value>` on the next request to continue. Cursors are opaque; they are not page numbers.

## Errors

Error responses use a small, consistent envelope:

```json
{
  "error": "validation_failed",
  "message": "Human readable summary of the failure.",
  "requestId": "a1c3",
  "details": [ /* optional, error specific */ ]
}
```

The `error` code is a stable machine readable identifier safe to switch on; the `message` is a human readable summary that may change between releases. The `requestId` is the same ID recorded in the server logs, so support can correlate a caller's error with the log trail without the caller reading the server's logs.

HTTP status codes follow the usual conventions:

| Status | Meaning |
| --- | --- |
| 200, 201, 204 | Success. |
| 400 | Validation error. The request body was malformed or failed schema validation. |
| 401 | Not authenticated. Credential is missing, expired, or revoked. |
| 403 | Authenticated but not authorized. Missing permission; the `message` names the key. |
| 404 | Resource does not exist or the caller cannot see it. The server does not distinguish the two to avoid leaking existence. |
| 409 | Conflict. Optimistic concurrency failure, duplicate create, or state transition not allowed. |
| 413 | Upload too large. Raise `UPLOAD_MAX_FILE_SIZE` if the upload is legitimate. |
| 422 | Unprocessable entity. The body parsed but fails business rule validation. |
| 429 | Rate limited. Retry after the `Retry-After` header. |
| 5xx | Server error. The `requestId` in the body correlates with a log line. |

## Idempotency

Mutating endpoints that create a resource accept an `Idempotency-Key` header. When set, the server stores the request outcome under the key for 24 hours and returns the same result on a retry with the same key. This lets a client retry a `POST` safely without producing duplicate records.

Idempotency keys are scoped to the caller and the endpoint. Reusing a key across endpoints or across users does nothing useful; each key must be unique to the logical operation.

## Rate limiting

Every credential is subject to a per minute request budget. The current defaults are generous enough that human UI use never hits them; scripted clients should read the response headers to pace themselves.

| Header | Meaning |
| --- | --- |
| `X-RateLimit-Limit` | Requests allowed per minute for this credential. |
| `X-RateLimit-Remaining` | Requests remaining in the current window. |
| `X-RateLimit-Reset` | Seconds until the window resets. |
| `Retry-After` | Present on 429 responses. Seconds to wait before retrying. |

## Request tracing

Every response carries an `X-Request-Id` header. The same ID appears on every log line for that request (see [Logging](/operations/logging/)). When a caller reports a problem, the request ID is the fastest path to the log trail.

Clients may set their own request ID by sending `X-Request-Id` on the request. The server uses the caller supplied value when present and generates one otherwise. Propagating an ID from an upstream system through Assessors Studio and into the log aggregator lets an operator trace a single user action across every system it touches.

## Webhooks

The API both consumes and emits events. Outbound webhooks are documented on [Integrations](/administration/integrations/); their payload schemas are also in the OpenAPI description under the `webhooks:` root. Every webhook payload is a JSON envelope with the same shape as an API response and is signed with the destination's shared secret.

## Generating clients

Because the OpenAPI description is generated from the running code, any OpenAPI code generator can produce a typed client from `/api/v1/openapi.json`. The project publishes generator friendly descriptions without any vendor specific extensions beyond `x-required-permission`.

Typical workflows:

| Target | Tool |
| --- | --- |
| TypeScript | `openapi-typescript` or `openapi-fetch` for types plus a thin fetch wrapper. |
| Python | `openapi-python-client` for a typed client; `httpx` if you prefer a hand rolled client. |
| Go | `oapi-codegen` with the server and client flags for a typed client and interface. |
| CLI | `openapi-generator-cli` for any language not covered above. |

Pin the generator invocation to a specific snapshot tag of `openapi.json` so the generated client does not drift when the API changes.

## Live exploration

In an evaluation install, the interactive Swagger UI at `/api/v1/docs` is the fastest way to understand the surface. Every endpoint shows its path, verb, parameters, request body schema, response schemas, required permission, and a Try It Out button that issues a real request against the running server using the session cookie or an API key.

For production exploration without pointing at the real server, the published HTML copy at [https://docs.assessor.studio/api/](https://docs.assessor.studio/api/) is read only and does not issue requests.

## What this page intentionally does not cover

This page describes cross cutting behavior: how authentication works, how errors are shaped, how pagination works, where to find the OpenAPI description. It does not enumerate the endpoints themselves; that is the OpenAPI description's job, and duplicating it here would guarantee drift. When you need to know the shape of a specific request or response, read the OpenAPI description.
