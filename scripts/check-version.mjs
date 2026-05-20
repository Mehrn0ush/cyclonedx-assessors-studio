#!/usr/bin/env node

// =============================================================================
// check-version.mjs
// =============================================================================
// Verifies that every workspace manifest AND its companion package-lock.json
// reports the same version. Exits non-zero on any drift so CI can gate a
// release on it.
//
// Catches three classes of bug bump-version.mjs is built to prevent:
//   1. A package.json bumped by hand without running bump-version, leaving
//      siblings behind.
//   2. A package.json bumped by bump-version but a lockfile that bump-version
//      did not yet touch (the regression this script was added to catch —
//      the old `version:check` only compared the three main package.json
//      files and silently passed when the lockfiles were stale).
//   3. A lockfile re-resolution that nudged the workspace's own version
//      entry. Rare but possible after a hand-edited install.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const TARGETS = [
  { pkg: 'package.json',           lock: 'package-lock.json' },
  { pkg: 'backend/package.json',   lock: 'backend/package-lock.json' },
  { pkg: 'frontend/package.json',  lock: 'frontend/package-lock.json' },
  { pkg: 'tests/e2e/package.json', lock: 'tests/e2e/package-lock.json' },
]

const results = []
const mismatches = []

for (const { pkg, lock } of TARGETS) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const pkgVersion = JSON.parse(readFileSync(resolve(root, pkg), 'utf-8')).version
  results.push({ path: pkg, version: pkgVersion })

  const lockAbs = resolve(root, lock)
  if (!existsSync(lockAbs)) {
    results.push({ path: lock, version: '(missing)' })
    continue
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const lockJson = JSON.parse(readFileSync(lockAbs, 'utf-8'))
  const lockTop = lockJson.version
  const lockRoot = lockJson.packages?.['']?.version

  results.push({ path: `${lock} (top)`, version: lockTop ?? '(absent)' })
  results.push({ path: `${lock} (packages[""])`, version: lockRoot ?? '(absent)' })

  if (lockTop !== undefined && lockTop !== pkgVersion) {
    mismatches.push(`${lock} top-level version ${lockTop} != ${pkg} ${pkgVersion}`)
  }
  if (lockRoot !== undefined && lockRoot !== pkgVersion) {
    mismatches.push(`${lock} packages[""].version ${lockRoot} != ${pkg} ${pkgVersion}`)
  }
}

// Cross-package consistency: all four package.json files must report the
// same version. The lockfile checks above only verify each lockfile matches
// its own package.json; this catches drift across the workspaces.
const pkgVersions = TARGETS.map(({ pkg }) => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return JSON.parse(readFileSync(resolve(root, pkg), 'utf-8')).version
})
const uniquePkgVersions = [...new Set(pkgVersions)]
if (uniquePkgVersions.length > 1) {
  mismatches.push(
    `package.json versions diverge across workspaces: ${TARGETS
      .map(({ pkg }, i) => `${pkg}=${pkgVersions[i]}`)
      .join(', ')}`,
  )
}

const width = Math.max(...results.map((r) => r.path.length))
for (const { path, version } of results) {
  console.log(`  ${path.padEnd(width)}  ${version}`)
}

if (mismatches.length > 0) {
  console.error('\nVERSION MISMATCH:')
  for (const m of mismatches) console.error(`  - ${m}`)
  console.error(
    '\nRun `npm run version:set <version>` to bring every package.json and ' +
    'its companion lockfile back in sync.',
  )
  process.exit(1)
}

console.log('\nAll workspaces and lockfiles in sync')
