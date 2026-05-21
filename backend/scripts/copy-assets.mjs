#!/usr/bin/env node
/**
 * Mirror non-TypeScript assets from src/ to dist/ after tsc runs.
 *
 * tsc does not emit files with extensions other than .ts / .tsx by default,
 * so runtime assets (JSON seed files, SQL fixtures, templates, etc.) need to
 * be copied manually. This script walks src/ and copies every file whose
 * extension appears in the EXTENSIONS list into the matching dist/ path.
 */

import {
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const srcDir = join(projectRoot, 'src');
const distDir = join(projectRoot, 'dist');

const EXTENSIONS = new Set(['.json', '.sql', '.html', '.txt', '.md']);

function walk(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTENSIONS.has(extname(entry))) {
      continue;
    }
    const rel = relative(srcDir, full);
    const dest = join(distDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    // copyFileSync preserves the source's mode bits. Some fixture
    // files are checked in with mode 0400 (read-only owner), so a
    // pre-existing dist copy from a prior build cannot be overwritten
    // and the next build crashes with EACCES. Remove the prior copy
    // first, then write fresh with 0644 so subsequent rebuilds aren't
    // trapped by the read-only mode.
    if (existsSync(dest)) {
      try { chmodSync(dest, 0o644); } catch { /* best effort */ }
      try { rmSync(dest, { force: true }); } catch { /* fall through to copy */ }
    }
    copyFileSync(full, dest);
    try { chmodSync(dest, 0o644); } catch { /* best effort */ }
    process.stdout.write(`copied ${rel}\n`);
  }
}

walk(srcDir);
