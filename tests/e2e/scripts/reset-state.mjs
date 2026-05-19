#!/usr/bin/env node
/**
 * Reset the E2E PGlite data directory and per-role storage state
 * files. Runs as an `npm pretest` hook so it fires exactly once,
 * before Playwright loads its config or boots the webServer.
 *
 * Module-level wipes in playwright.config.ts are unsafe because
 * Playwright workers re-import the config in each child process,
 * which causes a race-wipe of the backend's data dir mid-run.
 *
 * Skipped when:
 *  - CI=1 (CI always runs on a fresh runner)
 *  - E2E_PRESERVE_STATE=1 (developer opt-out for stateful repros)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isCI = !!process.env.CI;
const preserve = !!process.env.E2E_PRESERVE_STATE;
if (isCI || preserve) {
  console.log(
    `[e2e] state reset skipped (${isCI ? 'CI=1' : 'E2E_PRESERVE_STATE=1'})`,
  );
  process.exit(0);
}

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const e2eDir = path.resolve(__dirname, '..');

// The webServer in playwright.config.ts runs the backend with
// PGLITE_DATA_DIR='./data/pglite-e2e' relative to the backend cwd
// (set by `npm --prefix ../../backend run dev`). That resolves to
// <repo>/backend/data/pglite-e2e.
const pgliteDir =
  process.env.E2E_PGLITE_DIR && path.isAbsolute(process.env.E2E_PGLITE_DIR)
    ? process.env.E2E_PGLITE_DIR
    : path.join(
        repoRoot,
        'backend',
        process.env.E2E_PGLITE_DIR || 'data/pglite-e2e',
      );

const storageDir = path.join(e2eDir, 'auth', 'storage-states');

let wipedSomething = false;

try {
  if (fs.existsSync(pgliteDir)) {
    fs.rmSync(pgliteDir, { recursive: true, force: true });
    console.log(`[e2e] removed ${path.relative(repoRoot, pgliteDir)}`);
    wipedSomething = true;
  }
} catch (e) {
  // Don't mask: if we can't wipe, the user needs to know rather than
  // hitting a confusing test failure from stale data.
  console.error(`[e2e] failed to remove ${pgliteDir}:`, e);
  process.exit(1);
}

try {
  if (fs.existsSync(storageDir)) {
    for (const f of fs.readdirSync(storageDir, { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith('.json')) {
        fs.rmSync(path.join(storageDir, f.name), { force: true });
        wipedSomething = true;
      }
    }
    console.log(`[e2e] removed storage states in ${path.relative(repoRoot, storageDir)}`);
  }
} catch (e) {
  console.error(`[e2e] failed to remove storage states:`, e);
  process.exit(1);
}

if (!wipedSomething) {
  console.log('[e2e] no state to reset (clean run)');
}
