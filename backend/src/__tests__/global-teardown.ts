/**
 * Vitest global setup/teardown.
 *
 * The exported `setup` function is a no-op.
 * The exported `teardown` function removes PGlite test database
 * directories that accumulate during test runs:
 *   - backend/data/   (Phase 2 unit tests)
 *   - data/           (Phase 1 HTTP integration tests, at repo root)
 *
 * Runs once after the entire test suite finishes, regardless of
 * whether individual tests passed or failed. Uses shell rm -rf as
 * the primary strategy since Node's fs.rmSync silently skips files
 * that PGlite still holds locks on.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/data  (resolved from src/__tests__/ -> ../../data)
const BACKEND_DATA_DIR = path.resolve(__dirname, '../..', 'data');

// repo-root/data  (resolved from src/__tests__/ -> ../../../data)
const ROOT_DATA_DIR = path.resolve(__dirname, '../../..', 'data');

export function setup() {
  // no-op: teardown is the only purpose of this file
}

function wipeDir(dir: string): boolean {
  if (!fs.existsSync(dir)) {
    return false;
  }

  // Shell rm -rf is more reliable than fs.rmSync when PGlite
  // processes may still hold file locks.
  try {
    execSync(`rm -rf "${dir}"`, { stdio: 'ignore', timeout: 15000 });
  } catch {
    // Fallback to Node API
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }

  return !fs.existsSync(dir);
}

export function teardown() {
  const removed: string[] = [];
  const failed: string[] = [];

  for (const dir of [BACKEND_DATA_DIR, ROOT_DATA_DIR]) {
    if (!fs.existsSync(dir)) continue;
    if (wipeDir(dir)) {
      removed.push(dir);
    } else {
      failed.push(dir);
    }
  }

  if (removed.length > 0) {
    console.log(`[global-teardown] Removed ${removed.join(', ')}`);
  }
  if (failed.length > 0) {
    console.warn(`[global-teardown] Could not fully remove ${failed.join(', ')}`);
  }
}
