# E2E Coverage Plan

Multi-phase plan to reach near-100% E2E coverage of the CycloneDX Assessors Studio. Each phase is independently shippable, gated by the CI job, and adds a measurable slice of coverage.

## Target

Near-100% coverage = every authenticated user flow exercised end-to-end at least once with positive and negative paths, every role-gated route checked against the RBAC matrix, every previously-reported bug protected by a regression test, and every dialog / form has at least one happy path and one validation failure path.

We are not targeting:
- Visual regression (pixel diffs). Out of scope unless explicitly added later.
- Cross-browser parity for every test. Critical paths run on chromium/firefox/webkit; the bulk runs on chromium only.
- Load / performance tests.
- Penetration / fuzz tests beyond the auth and input-validation positive/negative pairs.

## Phase 1 — Infrastructure + critical paths + regressions [DELIVERED IN THIS COMMIT]

Goal: make E2E runnable in CI, protect the three issues just fixed, and cover the highest-risk flows that every user touches.

Infrastructure (one-time):
- `tests/e2e/` package with Playwright 1.49+, TypeScript, page-object model
- `playwright.config.ts`: webServer that boots backend (PGlite, fresh dir per run) + frontend dev server (vite preview)
- Global setup that walks the setup wizard once, seeds demo data, and saves storage state per role (`admin`, `assessor`, `assessee`, `standards_manager`, `standards_approver`)
- Fixtures: typed `auth` fixture, `api` fixture (axios-like helper bound to the test base URL with the role's cookies), random-data helpers
- POM scaffolding for every surface (one class per top-level route, even if some methods are stubs)
- HTML reporter, trace-on-failure, screenshots-on-failure, JUnit XML
- GitHub Action job `e2e` running after `backend-test` and `frontend-test`. Uploads HTML report and traces as artifacts.
- npm wiring at root: `npm run test:e2e`

Phase 1 test surfaces (target ~60 tests):

| Surface | Tests | Notes |
| --- | --- | --- |
| Auth | login success/fail, logout, "remember me" cookie, lockout after failed attempts, unauthenticated redirect to /login | smoke |
| Setup | wizard happy path, idempotent post-setup behavior | covered by global setup; one explicit test added |
| Users (admin) | create with each of 5 roles (issue #20 regression), edit role, activate/deactivate, duplicate username/email 409 | regression |
| Pagination | `/api/v1/entities?limit=101` returns 400 with details (issue #21 regression) | regression |
| Assessments | create with entity+standard, create with project+standard, create standalone with standard, start with no body (issue #19 regression), score requirements, complete, archive, reopen | regression |
| RBAC matrix | each non-admin role gets 403 on /admin/* routes and 403 on permission-gated API endpoints | smoke |
| Dashboard | loads for each role, widgets render, no JS errors | smoke |

## Phase 2 — Full CRUD + workflows [planned, scaffolded]

Goal: every CRUD surface and every multi-step workflow has at least one happy path and one validation failure path.

Phase 2 inventory (target ~120 tests):

| Surface | Tests |
| --- | --- |
| Standards | list, draft → review → published transition, requirement CRUD, import from CycloneDX feed URL, role-gating (standards_manager creates, standards_approver approves, admin sees both) |
| Entities | create each of 8 entity types, edit, archive, tags add/remove, hierarchy parent/child, relationship producer/consumer toggle, graph view loads |
| Projects | create with multiple standards, edit, archive, list assessments under project, state transitions |
| Evidence | create, edit, attach file (multipart upload), download, add note, submit for review, accept/reject, retention immutability on terminal state |
| Attestations | create, add requirement claim, sign with platform key, drift detection on re-canonicalization, view attestation history |
| Affirmations | create, add slot, sign slot, rescind, jurisdiction/legalIntent fields persist |
| Claims | CRUD, link to evidence, link to assessment requirement |
| Tags | admin CRUD, color picker, used-by counts |
| Notifications | list, mark read, mark all read, notification rule CRUD |
| Chat integrations | admin CRUD, send test message stub, channel filtering |
| Webhooks | admin CRUD, delivery log paginates, retry button |
| Audit log | filters by user, action, entity, date range, pagination |
| Admin tags | CRUD, color enforcement |
| Settings | profile edit, password change, language switch, theme toggle |
| Invites | issue invite, copy token, redeem flow, expired invite 410, revoked invite |
| Platform keys | admin lists keys, rotate flow with confirm dialog |
| Encryption | admin views key status, runs re-encryption |

## Phase 3 — Edge cases + i18n + a11y smoke [planned]

Phase 3 inventory (target ~80 tests):

| Surface | Tests |
| --- | --- |
| i18n | language switch persists across reload; en-US / es-ES / ja-JP / zh-CN / de-DE / fr-FR / ru-RU each load the dashboard without missing-key fallbacks |
| Accessibility smoke | each top-level route passes `@axe-core/playwright` with no critical issues |
| Empty states | every list view renders its empty state when no data |
| Search and filters | every list view's search box filters correctly, multi-filter combinations work |
| Bulk operations | bulk archive entities, bulk tag, bulk delete (where supported) |
| Network failure | offline mode shows error UI on each list view (route.abort) |
| Slow network | loading skeletons render on each list view (route.continue with delay) |
| API error mapping | 400 / 401 / 403 / 404 / 409 / 500 each produce the correct user-visible error |
| Concurrent edits | optimistic-locking conflicts handled in update flows |
| Large data | list views with 100+ items paginate cleanly |
| Date formats | due date picker, evidence retention dates honor user locale |
| File upload | multipart upload size limits, content-type rejection, malicious filename sanitization |
| Pagination | every paginated list rejects `limit > 100` with 400 (cross-route protection of issue #21) |
| Browser back/forward | preserves filters and pagination state |
| Session expiry | expired JWT redirects to login and preserves return path |
| CSRF / SameSite | login form respects SameSite cookie |
| Multi-tab | login in one tab updates auth state in another |

## Execution policy

- Each phase ships as its own PR, with the CI job already wired and passing.
- Phase 1 starts gating CI from day one. Phases 2 and 3 are added to the same `e2e` job and gradually replace `if: false` shields.
- New features added to the app must come with E2E coverage in the same PR. The coverage manifest (`COVERAGE.md`) is the source of truth for what is currently expected to be tested.
- Any test added must include at least one negative path (validation failure, permission denied, 404 not found, etc.), per the convention that produced the issue #19 / #20 / #21 regressions.
- Tests target a clean PGlite database seeded with demo data. No external network. No assumptions about ordering between specs (each spec is hermetic except for the seeded demo data, which is read-only inside the spec).

## Done definition for each phase

A phase is done when:
1. All listed tests are written and green on chromium/Linux in CI.
2. The CI job runs in under 10 minutes on the GitHub-hosted runner.
3. `COVERAGE.md` is updated to reflect what is now tested.
4. A failure produces enough trace + screenshot information that triage takes < 5 minutes.
