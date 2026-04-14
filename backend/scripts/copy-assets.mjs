#!/usr/bin/env node
/**
 * Mirror non-TypeScript assets from src/ to dist/ after tsc runs.
 *
 * tsc does not emit files with extensions other than .ts / .tsx by default,
 * so runtime assets (JSON seed files, SQL fixtures, templates, etc.) need to
 * be copied manually. This script walks src/ and copies every file whose
 * extension appears in the EXTENSIONS list into the matching dist/ path.
 */

import { readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
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
    copyFileSync(full, dest);
    process.stdout.write(`copied ${rel}\n`);
  }
}

walk(srcDir);
