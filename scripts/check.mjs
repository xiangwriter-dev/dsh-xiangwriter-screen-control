#!/usr/bin/env node
/**
 * Static sanity check that does not need a child process:
 * import every module (syntax + immediate errors), validate JSON resources,
 * and confirm the bundle manifest points at the patch that inserts the plugin.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const problems = []

function modules() {
  const files = [join(root, 'index.js')]
  const stack = [join(root, 'src')]
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

for (const file of modules()) {
  try {
    await import(pathToFileURL(file).href)
  } catch (error) {
    problems.push(`${file}: ${error.message}`)
  }
}

for (const relative of ['package.json', 'locale/en.json', 'locale/zh.json']) {
  const path = join(root, relative)
  try {
    JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    problems.push(`${relative}: ${error.message}`)
  }
}

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') problems.push('package.json: dsh.bundle.patch must be ./cordis.patch.yml')
if (!existsSync(join(root, 'cordis.patch.yml'))) problems.push('cordis.patch.yml is missing')
if (manifest.dependencies) problems.push('package.json: bundles must not declare runtime dependencies')
if (!manifest.files?.includes('src') || !manifest.files?.includes('scripts')) problems.push('package.json: files must ship src and scripts')
if (!existsSync(join(root, 'icon.svg'))) problems.push('icon.svg is missing')

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
if (!patch.includes('id: screen-control')) problems.push('cordis.patch.yml must insert the screen-control row')
if (!patch.includes(`name: ${manifest.name}`)) problems.push('cordis.patch.yml row name must match the package name')

if (problems.length > 0) {
  console.error(`check failed (${problems.length}):`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}
console.log(`check: ${modules().length} modules, manifest and resources look consistent`)
