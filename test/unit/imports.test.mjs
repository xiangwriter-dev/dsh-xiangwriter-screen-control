import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

function sourceFiles() {
  const files = [join(ROOT, 'index.js')]
  const stack = [join(ROOT, 'src')]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) stack.push(path)
      else if (entry.name.endsWith('.js')) files.push(path)
    }
  }
  return files
}

function specifiers(source) {
  const found = []
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) found.push(match[1])
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) found.push(match[1])
  return found
}

describe('bundle self-containment', () => {
  it('never imports a bare package specifier', () => {
    // Installed bundles are loaded from the profile directory; the harness
    // packages are not resolvable there, so every import must be relative or
    // a node: builtin.
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8')
      for (const specifier of specifiers(source)) {
        const relative = specifier.startsWith('.')
        const builtin = specifier.startsWith('node:')
        assert.ok(relative || builtin, `${file}: unexpected bare import "${specifier}"`)
      }
    }
  })

  it('declares no runtime dependencies in package.json', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies, undefined)
    assert.equal(manifest.peerDependencies, undefined)
    assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  })
})
