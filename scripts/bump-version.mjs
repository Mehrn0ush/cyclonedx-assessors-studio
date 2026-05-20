#!/usr/bin/env node

// =============================================================================
// bump-version.mjs
// =============================================================================
// Sets the "version" field in every workspace manifest AND its companion
// package-lock.json to the supplied version, keeping the four packages
// (root, backend, frontend, tests/e2e) in lockstep with their lockfiles.
//
// Why touch the lockfiles
// -----------------------
// npm's lockfile (lockfileVersion 3) records the workspace's own version
// in two places: the top-level `version` field, and `packages[""].version`
// (the entry that mirrors the root package.json). When the two disagree,
// `npm ci` either fails or silently resyncs and leaves the lockfile dirty
// in git — which defeats the point of pinning the lockfile for a release.
//
// We do a surgical JSON edit rather than `npm version --no-git-tag-version`
// because the surgical edit is deterministic, needs no network, and never
// re-resolves the dependency tree. The trade-off: we are coupled to
// lockfileVersion 3, which is what npm 7+ emits. If the lockfile shape
// changes the validator below will refuse to write and we fix it then.
//
// Usage:
//   node scripts/bump-version.mjs <version>
//
// Example:
//   node scripts/bump-version.mjs 1.2.0
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Each entry pairs a package.json with its sibling package-lock.json so the
// two move together. `docs/` is intentionally absent: it carries its own
// version (currently 0.0.1) that does not track the application release.
const TARGETS = [
  { pkg: 'package.json',           lock: 'package-lock.json' },
  { pkg: 'backend/package.json',   lock: 'backend/package-lock.json' },
  { pkg: 'frontend/package.json',  lock: 'frontend/package-lock.json' },
  { pkg: 'tests/e2e/package.json', lock: 'tests/e2e/package-lock.json' },
]

const version = process.argv[2]

if (!version) {
  // eslint-disable-next-line no-console
  console.error('Usage: node scripts/bump-version.mjs <version>')
  process.exit(1)
}

// eslint-disable-next-line security/detect-unsafe-regex
if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
  console.error(`Invalid semver: ${version}`)
  process.exit(1)
}

function writePackageJson(absPath, relPath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const pkg = JSON.parse(readFileSync(absPath, 'utf-8'))
  const previous = pkg.version
  pkg.version = version
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(absPath, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`  ${relPath}: ${previous} -> ${version}`)
}

function writePackageLock(absPath, relPath) {
  if (!existsSync(absPath)) {
    console.log(`  ${relPath}: (missing, skipped)`)
    return
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const lock = JSON.parse(readFileSync(absPath, 'utf-8'))

  // Guard against an unexpected lockfile shape. lockfileVersion 1 stored the
  // workspace version only at the top level; v2 / v3 also store it under
  // packages[""]. We require at least one of the two to be present so an
  // accidental run against, say, a yarn.lock-converted file errors out
  // instead of silently doing nothing.
  const previousTop = lock.version
  const rootEntry = lock.packages?.['']
  const previousRoot = rootEntry?.version
  if (previousTop === undefined && previousRoot === undefined) {
    throw new Error(
      `${relPath}: cannot find a version field to update. ` +
      `Expected lockfileVersion 1/2/3 layout. Got keys: ${Object.keys(lock).join(', ')}.`
    )
  }

  if (previousTop !== undefined) lock.version = version
  if (rootEntry && previousRoot !== undefined) rootEntry.version = version

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(absPath, `${JSON.stringify(lock, null, 2)}\n`)
  const display = previousTop ?? previousRoot
  console.log(`  ${relPath}: ${display} -> ${version}`)
}

for (const { pkg, lock } of TARGETS) {
  console.log(`\n${pkg.replace('/package.json', '') || '(root)'}:`)
  writePackageJson(resolve(root, pkg), pkg)
  writePackageLock(resolve(root, lock), lock)
}

console.log(`\nAll workspace manifests and lockfiles set to version ${version}`)
