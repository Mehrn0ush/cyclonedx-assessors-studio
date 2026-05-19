#!/usr/bin/env node
//
// Pre-dev guard. Verifies that the backend and frontend each have a
// usable node_modules tree before `npm run dev` forks the two long
// running processes. Without this, a missing install leaves the
// backend silently unable to start (`tsx: command not found`) while
// the frontend boots normally, which presents to the operator as a
// broken setup wizard instead of a missing dependency.
//
// The check is intentionally cheap. We look for the entry-point
// binary each subproject's dev script depends on. If either is
// missing we run `npm install:all` automatically and then continue.
// The script only writes to stdout so a CI environment that has
// already run install:all skips the work entirely.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const backendTsx = resolve(repoRoot, 'backend/node_modules/.bin/tsx');
const frontendVite = resolve(repoRoot, 'frontend/node_modules/.bin/vite');

const missing = [];
if (!existsSync(backendTsx)) missing.push('backend');
if (!existsSync(frontendVite)) missing.push('frontend');

if (missing.length === 0) {
  process.exit(0);
}

console.log(
  `[predev] node_modules missing in: ${missing.join(', ')}. Running 'npm run install:all' once.`,
);

const result = spawnSync('npm', ['run', 'install:all'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.error('[predev] install:all failed. Run it manually and retry.');
  process.exit(result.status ?? 1);
}
