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

## Phase 2 (in progress)

| Surface | Status | Notes |
| --- | --- | --- |
| Standards: draft → in_review → published workflow | DONE | `specs/standards/lifecycle.spec.ts` — full state machine, RBAC matrix across all 5 roles, state-machine guards |
| Standards: requirement CRUD on a draft | DONE | same spec — add / edit / delete |
| Standards: duplicate any state → new draft | DONE | same spec |
| Standards: retire path (published → retired) | DONE | same spec |
| Standards: import from CycloneDX feed URL | PLANNED | hits /api/v1/setup/import-standard with a trusted URL |
| Entities: create each of 8 entity types | DONE | `specs/entities/lifecycle.spec.ts` |
| Entities: 8 relationship types + producer/consumer perspective | DONE | same spec |
| Entities: tag add / replace | DONE | same spec |
| Entities: archive + restore + state filter | DONE | same spec |
| Entities: search and entity_type filter | DONE | same spec |
| Entities: RBAC matrix | DONE | same spec |
| Projects: edit, archive, list assessments under project | PLANNED |
| Evidence: classification, isCounterEvidence round-trip | DONE | `specs/evidence/lifecycle.spec.ts` |
| Evidence: file upload (multipart), download | PLANNED |
| Evidence: add note, submit for review, accept, reject | DONE | same spec |
| Evidence: retention immutability on claimed state (409) | DONE | same spec — edit, add note, delete all blocked |
| Evidence: state machine guards (resubmit, premature approve) | DONE | same spec |
| Evidence: author guard (cannot approve/reject own) | DONE | same spec |
| Evidence: RBAC matrix | DONE | same spec |
| Attestations: create on completed assessment, add requirement claim, update, export 1.6/1.7 | DONE | `specs/attestations/lifecycle.spec.ts` |
| Attestations: 409 on non-complete assessment, 400 on out-of-range score | DONE | same spec |
| Attestations: RBAC matrix (create, edit, export, view) | DONE | same spec |
| Attestations: sign via affirmation flow | PLANNED | belongs in affirmations spec (PR3 moved signing to affirmation layer) |
| Attestations: drift detection on re-canonicalization | PLANNED | needs platform-key signing prerequisite |
| Affirmations: create, edit, delete (unsealed), one-per-assessment guard | DONE | `specs/affirmations/lifecycle.spec.ts` |
| Affirmations: add slot, delete unsigned slot, pin slot to user | DONE | same spec |
| Affirmations: sign (electronic), seal, verify 3-layer report | DONE | same spec |
| Affirmations: sealed = immutable (edit / delete / add-slot all 409) | DONE | same spec |
| Affirmations: rescind sealed; cannot rescind unsealed; verify reports rescinded | DONE | same spec |
| Affirmations: RBAC (assessor/assessee/standards_* cannot manage) | DONE | same spec |
| Affirmations: digital signing (caller-supplied JSF signatureValue) | PLANNED | requires generating EC P-256 key pair + signing canonical hash in the test, out of E2E scope |
| Affirmations: drifted=true after canonical payload mutation | PLANNED | requires direct DB mutation (sealed slot is locked by route); belongs in backend unit suite, not E2E |
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
