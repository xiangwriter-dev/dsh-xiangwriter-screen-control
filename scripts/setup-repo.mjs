#!/usr/bin/env node
/**
 * Replace the `OWNER` placeholder in GitHub-facing files with a real account.
 *
 * Usage: node scripts/setup-repo.mjs <github-owner>
 *
 * `scripts/` is excluded on purpose: this file contains the literal placeholder
 * and must not rewrite itself.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const owner = process.argv[2]

if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) {
  console.error('usage: node scripts/setup-repo.mjs <github-owner>')
  process.exit(1)
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts'])
const TEXT_FILE = /\.(md|markdown|ya?ml|json)$/

function textFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) textFiles(path, out)
      continue
    }
    if (TEXT_FILE.test(entry.name)) out.push(path)
  }
  return out
}

const changed = []
for (const path of textFiles(root)) {
  const source = readFileSync(path, 'utf8')
  const next = source.split('OWNER').join(owner)
  if (next !== source) {
    writeFileSync(path, next, 'utf8')
    changed.push(relative(root, path).replaceAll('\\', '/'))
  }
}

if (changed.length === 0) {
  console.log('nothing to rewrite (OWNER placeholder not found)')
} else {
  console.log(`rewrote ${changed.length} file(s) for owner "${owner}":`)
  for (const file of changed) console.log(`  - ${file}`)
}

const remaining = textFiles(root).filter((path) => readFileSync(path, 'utf8').includes('OWNER'))
if (remaining.length > 0) {
  console.error(`warning: OWNER is still present in ${remaining.length} file(s)`)
  process.exitCode = 1
}
