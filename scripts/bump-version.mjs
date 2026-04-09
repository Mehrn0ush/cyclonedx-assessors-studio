#!/usr/bin/env node

// =============================================================================
// bump-version.mjs
// =============================================================================
// Sets the "version" field in all package.json files to the supplied version,
// keeping the three manifests (root, backend, frontend) in lockstep.
//
// Usage:
//   node scripts/bump-version.mjs <version>
//
// Example:
//   node scripts/bump-version.mjs 1.2.0
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const PACKAGE_FILES = [
  'package.json',
  'backend/package.json',
  'frontend/package.json',
]

const version = process.argv[2]

if (!version) {
  console.error('Usage: node scripts/bump-version.mjs <version>')
  process.exit(1)
}

if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
  console.error(`Invalid semver: ${version}`)
  process.exit(1)
}

for (const relPath of PACKAGE_FILES) {
  const filePath = resolve(root, relPath)
  const pkg = JSON.parse(readFileSync(filePath, 'utf-8'))
  const previous = pkg.version
  pkg.version = version
  writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`${relPath}: ${previous} -> ${version}`)
}

console.log(`\nAll package.json files set to ${version}`)
