# E2E Coverage Manifest

This document is the source of truth for what the Playwright suite is
expected to cover, and what it intentionally does not. Update this file
in the same PR as any test or app change that changes the surface area.

Status legend:

- DONE — covered by a passing spec in `tests/e2e/specs/`.
- PARTIAL — at least one path covered; documented gaps below the row.
- PLANNED — scheduled in `PLAN.md` for Phase 2 or 3.
- N/A — explicitly out of scope (see PLAN.md → "Target / not targeting").

## Phase 1 (shipped)

| Surface | Status | Spec |
| --- | --- | --- |
| Login: valid admin, valid demo users, wrong username, wrong password, unauthenticated redirect, logout | DONE | `specs/auth/login.spec.ts` |
| API contract: entities pagination boundary (issue #21) | DONE | `specs/auth/api-contract.spec.ts` |
| API contract: assessments start with no body (issue #19) | DONE | `specs/auth/api-contract.spec.ts` |
| API contract: assessments create with standardIds alias (issue #19) | DONE | `specs/auth/api-contract.spec.ts` |
| Admin user CRUD with all 5 roles (issue #20) | DONE | `specs/users/create-user.spec.ts` |
| Role rename (assessee → standards_manager) | DONE | `specs/users/create-user.spec.ts` |
| Duplicate username 409 | DONE | `specs/users/create-user.spec.ts` |
| RBAC: assessor/assessee cannot reach /admin/* | DONE | `specs/users/rbac.spec.ts` |
| RBAC: non-admin POST /users → 403 | DONE | `specs/users/rbac.spec.ts` |
| Assessment lifecycle: create standalone, create project-linked (issue #19), start with no body (issue #19), score requirements, complete | DONE | `specs/assessments/lifecycle.spec.ts` |
| Dashboard loads for all 5 roles with no console errors | DONE | `specs/dashboard/dashboard.spec.ts` |
| Pagination guard across 6 routes (issue #21 family) | DONE | `specs/admin/pagination.spec.ts` |
| Entities list smoke | DONE | `specs/entities/list.spec.ts` |
| Projects list + create + missing-standard 400 | DONE | `specs/projects/list.spec.ts` |
| Standards list + standards_manager access | DONE | `specs/standards/list.spec.ts` |
| Evidence list + create via API | DONE | `specs/evidence/list.spec.ts` |
| Attestations list smoke | DONE | `specs/attestations/list.spec.ts` |
| Audit log: admin opens view, non-admin 403 | DONE | `specs/admin/audit.spec.ts` |
| Notifications list (admin + assessor) | DONE | `specs/admin/notifications.spec.ts` |
| Webhooks: admin opens view, non-admin 403 | DONE | `specs/admin/webhooks.spec.ts` |

## Phase 2 (planned, not yet implemented)

| Surface | Status | Notes |
| --- | --- | --- |
| Standards: draft → review → published workflow | PLANNED | standards_manager submits, standards_approver approves, admin sees both |
| Standards: import from CycloneDX feed URL | PLANNED | hits /api/v1/setup/import-standard with a trusted URL |
| Standards: requirement CRUD | PLANNED | covers the inner table inside StandardDetailView |
| Entities: create each of 8 entity types | PLANNED | organization, business_unit, team, product, product_version, component, service, project |
| Entities: parent/child hierarchy edit | PLANNED | uses the relationships graph |
| Entities: producer/consumer perspective toggle | PLANNED |
| Entities: tag add/remove | PLANNED |
| Entities: archive + restore | PLANNED |
| Projects: edit, archive, list assessments under project | PLANNED |
| Evidence: file upload (multipart), download, classification, expiresOn | PLANNED |
| Evidence: add note, submit for review, accept, reject | PLANNED |
| Evidence: retention immutability on terminal state (409 on edit) | PLANNED |
| Attestations: create attestation, add requirement claim | PLANNED |
| Attestations: sign with platform key | PLANNED |
| Attestations: drift detection on re-canonicalization | PLANNED |
| Affirmations: create, add slot, sign slot, rescind | PLANNED |
| Claims: CRUD + link to evidence and assessment requirement | PLANNED |
| Tags admin: CRUD + color picker | PLANNED |
| Notification rules: CRUD | PLANNED |
| Chat integrations: CRUD + send-test stub | PLANNED |
| Webhooks: CRUD + delivery log pagination + retry | PLANNED |
| Audit log: filters (user, action, entity, date range) | PLANNED |
| Settings: profile edit, password change, language switch, theme | PLANNED |
| Invites: issue, copy token, redeem, expired, revoked | PLANNED |
| Platform keys: list + rotate with confirm | PLANNED |
| Encryption: key status + re-encryption run | PLANNED |
| Assessment: archive + reopen | PLANNED |
| Assessment: declarations subview | PLANNED |
| Assessment: assessor/assessee assignment flow | PLANNED |
| User profile: change-password from settings | PLANNED |
| User profile: profile fields persist | PLANNED |

## Phase 3 (planned, edge + i18n + a11y)

| Surface | Status | Notes |
| --- | --- | --- |
| i18n: 8 locales load the dashboard without missing keys | PLANNED |
| Accessibility smoke (axe) for every top-level route | PLANNED |
| Empty states for every list view | PLANNED |
| Search/filter combinations on every list view | PLANNED |
| Bulk operations (archive, tag, delete) | PLANNED |
| Network failure UI (offline, 5xx) | PLANNED |
| Loading skeletons (delayed responses) | PLANNED |
| API error mapping: 400/401/403/404/409/500 → user-visible error | PLANNED |
| Optimistic-locking conflicts | PLANNED |
| 100+ item pagination smoke | PLANNED |
| Date format honoring user locale | PLANNED |
| File upload size limits, content-type rejection, filename sanitization | PLANNED |
| Browser back/forward preserves filters | PLANNED |
| Expired JWT session redirect with return path | PLANNED |
| SameSite cookie behavior | PLANNED |
| Multi-tab auth state sync | PLANNED |

## Known product bugs (surfaced by E2E, deferred)

### Frontend error envelope mismatch (admin user create + ~26 other sites)

The backend's standard error envelope is `{ error: string, details?: any[] }`.
Most frontend views read `err.response?.data?.message` when handling
caught Axios errors. The key is wrong — `message` is never sent — so
every 4xx surfaces as the generic toast text ("Failed to save user",
"Failed to deactivate user", etc.) instead of the actual server-side
reason (e.g. "Username already exists" on 409).

Files affected (27 read sites, 12 views):

- `views/AdminUsersView.vue:204, 265, 297, 346, 392, 420`
- `views/AdminRolesView.vue:182, 195, 235, 259, 301`
- `views/AssessmentsView.vue:324, 398`
- `views/AssessmentDetailView.vue:1668, 1839`
- `views/AttestationsView.vue:166, 208`
- `views/EvidenceView.vue:167, 217`
- `views/EvidenceDetailView.vue:524, 557, 573, 597, 623`
- `views/AdminChatIntegrationsView.vue:449` (already prefers `error`; OK)
- `views/AdminIntegrationsView.vue:365`

Fix: read `data.error` first, fall back to `data.message` for any
future endpoint that returns the legacy shape. One-line change per site.

Affected E2E tests: `specs/users/create-user.spec.ts` "duplicate
username on create" is `test.fixme()`-marked until this lands. Remove
the `.fixme` once the fix ships.

## Out of scope (N/A)

- Pixel-diff visual regression. Add a separate dedicated workflow if
  this becomes important.
- Performance / load tests. Use k6 or similar.
- Penetration testing beyond input-validation positive/negative pairs.
- Cross-browser parity for the full suite — only `@smoke` runs on
  Firefox and WebKit (Phase 1) for cost reasons.

## Coverage math

Phase 1 total tests: ~50 (varies by role-fanout in `users/create-user.spec.ts`).

Phase 2 will add roughly 120 tests, Phase 3 roughly 80. Target at
"near 100%" is ~250 tests across the suite. The denominator for
"100%" is the union of user-visible flows, not lines of code.
