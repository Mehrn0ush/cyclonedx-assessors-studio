# E2E Tests (Playwright)

End-to-end tests for the CycloneDX Assessors Studio. Tests run against
a live backend (PGlite, embedded) and a live frontend (vite preview).
They are gated in CI by `backend-test` and `frontend-test`, and they
gate `docker` snapshot publishing.

## Layout

```
tests/e2e/
  playwright.config.ts        Playwright config + webServer orchestration
  PLAN.md                     Phased coverage plan and inventory
  COVERAGE.md                 Live coverage manifest (what is/isn't tested)
  auth/
    credentials.ts            Admin + demo user credentials (mirrors demo-data.json)
    global-setup.ts           Wizard, demo seed, per-role storage capture
    storage-states/           Generated per-run (gitignored)
  fixtures/index.ts           `test`, `expect`, `asRole`, `apiAs` fixtures
  helpers/                    Random data, message waits
  pages/                      Page Object Models (one per surface)
  specs/                      Tests organized by surface
    auth/                     Login, logout, API contract regressions
    users/                    Create user, RBAC matrix
    assessments/              Lifecycle including issue #19 regression
    entities/, projects/, standards/, evidence/, attestations/, dashboard/, admin/
```

## Running locally

```sh
# One-time install (root package.json wraps this):
npm run test:e2e:install

# Run everything against a freshly booted backend+frontend:
npm run test:e2e

# Headed / UI mode:
npm run test:e2e:headed
npm run test:e2e:ui

# Manually wipe the E2E PGlite data dir + storage state files:
npm run e2e:clean

# Run while preserving the existing data dir (debug a stateful repro):
npm run test:e2e:preserve

# Tag filters:
cd tests/e2e
npx playwright test --grep @smoke
npx playwright test --grep @regression

# Re-use a stack you already have running on the standard ports:
E2E_NO_WEBSERVER=1 npx playwright test
```

### State management

By default, `npm run test:e2e` resets the E2E PGlite data dir and the
per-role storage state files before booting the test backend. This
keeps local runs reproducible — without the reset, accumulated test
artifacts eventually push newly-created rows off the first page of
paginated admin endpoints and the suite starts flaking on locator
timeouts.

Two escape hatches:

- `E2E_PRESERVE_STATE=1` (or `npm run test:e2e:preserve`) — keep
  whatever's already in the data dir. Useful when debugging a
  scenario that depends on prior state.
- `CI=1` — automatically set by GitHub Actions; also disables the
  reset (no point on a fresh runner).

The reset only touches the E2E-specific dir (`backend/data/pglite-e2e`
and `tests/e2e/data`). Your dev backend at `backend/data/pglite` is
never touched.

## Authentication model

Tests do not log in through the UI except where the test target is the
login flow itself.

- `global-setup.ts` runs once before any spec. It posts to
  `/api/v1/setup` to create an E2E admin (idempotent), then posts to
  `/api/v1/setup/seed-demo` to seed the demo dataset, then logs in as
  each role (`admin`, `assessor`, `assessee`, `standards_manager`,
  `standards_approver`) once via a headless browser and writes the
  cookie + localStorage snapshot to `auth/storage-states/<role>.json`.
- Specs declare which role they need via the `asRole` fixture:

  ```ts
  test('admin sees the audit log', async ({ page, asRole }) => {
    await asRole('admin');
    await page.goto('/admin/audit');
  });
  ```

- For API-only setup/teardown without driving the UI, use the `apiAs`
  fixture which returns a Playwright `APIRequestContext` bound to that
  role's cookies. Disposed automatically at end of test.

## What is and isn't covered

See `COVERAGE.md` for the live manifest. See `PLAN.md` for the multi-
phase plan that takes the suite from "critical paths + regressions"
(Phase 1, shipped) to "near 100%" (Phase 3).

## Tags

- `@smoke` — runs on chromium, firefox, and webkit. Keep this set
  fast (< 2 minutes total) and stable.
- `@regression` — pins specific past bugs (issues #19, #20, #21). A
  failure here is a strong signal that a fix has been reverted.

## Adding a new test

1. Pick or create a POM in `pages/`. Use semantic locators
   (`getByRole`, `getByLabel`) rather than CSS selectors.
2. Put the spec under `specs/<surface>/<subject>.spec.ts`.
3. Default to API setup, UI verification. Drive the UI only for the
   step the test is actually about.
4. Include at least one negative path per surface. The bug class that
   produced issues #19, #20, and #21 was caused by tests that only
   exercised happy paths.
5. Update `COVERAGE.md`.

## Debugging failures in CI

The CI job uploads two artifacts on failure:

- `playwright-report` — HTML report with timing and test history.
- `playwright-traces` — `.zip` traces per failing test. Open with
  `npx playwright show-trace <path>` for a video + DOM snapshot
  walkthrough.

## Known limits / out of scope (this commit)

- Visual regression diffs.
- Accessibility audits (planned in Phase 3).
- Cross-browser parity for the full suite (only `@smoke` runs on
  firefox/webkit).
- Concurrent multi-user scenarios (planned in Phase 3).
