#!/usr/bin/env node
/**
 * Replace the `OWNER` placeholder in GitHub-facing metadata with a real account.
 *
 * Usage: node scripts/setup-repo.mjs <github-owner>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const owner = process.argv[2]

if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) {
  console.error('usage: node scripts/setup-repo.mjs <github-owner>')
  process.exit(1)
}

const targets = ['package.json', 'README.md', 'README.zh-CN.md', 'awesome-plugin-entry.yml']
const changed = []
for (const relative of targets) {
  const path = join(root, relative)
  let source
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    continue
  }
  const next = source.split('OWNER').join(owner)
  if (next !== source) {
    writeFileSync(path, next, 'utf8')
    changed.push(relative)
  }
}

if (changed.length === 0) {
  console.log('nothing to rewrite (OWNER placeholder not found)')
} else {
  console.log(`rewrote ${changed.join(', ')} for owner "${owner}"`)
}

// Sanity: no README links may resolve outside the repository tree.
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const badLinks = [...readme.matchAll(/\]\((?!https?:|#|\.\/|docs\/|LICENSE|CONTRIBUTING|CHANGELOG|SECURITY|CODE_OF_CONDUCT)([^)]+)\)/g)]
if (badLinks.length > 0) console.warn(`warning: ${badLinks.length} relative link(s) in README.md may need checking`)
