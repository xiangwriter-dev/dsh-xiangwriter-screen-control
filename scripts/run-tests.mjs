#!/usr/bin/env node
/**
 * Run the test suites without relying on directory arguments or shell globs
 * (their support differs between Node versions and Windows shells).
 *
 * Usage:
 *   node scripts/run-tests.mjs                # unit tests, default isolation
 *   node scripts/run-tests.mjs --sandboxed    # unit tests in one process (confined hosts)
 *   node scripts/run-tests.mjs e2e --sandboxed
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const suite = args.includes('e2e') ? 'e2e' : 'unit'
const sandboxed = args.includes('--sandboxed')

const directory = join(root, 'test', suite)
const files = readdirSync(directory)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join(directory, name))

if (files.length === 0) {
  console.error(`no test files found in ${directory}`)
  process.exit(1)
}

const nodeArgs = ['--test', ...(sandboxed ? ['--test-isolation=none'] : []), ...files]
const result = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit', cwd: root })
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
