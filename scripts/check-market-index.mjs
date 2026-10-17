#!/usr/bin/env node
/**
 * Validate `market/index.json` against the DeepSeek Harness plugin market
 * index format 1.
 *
 * Usage: node scripts/check-market-index.mjs [file] [index-url]
 *
 * The harness validates indexes with @deepseek-ai/dsh-plugin-market-index when
 * a Discover source is read. That package is not resolvable from a bundle
 * checkout, so this script mirrors the rules needed by this repository: format
 * version, localized text, plugin metadata references, versions, and the
 * npm/git source shapes. It is intentionally strict about anything the harness
 * would reject.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const file = process.argv[2] ?? join(root, 'market', 'index.json')
const indexUrl =
  process.argv[3] ?? 'https://raw.githubusercontent.com/xiangwriter-dev/dsh-screen-control/main/market/index.json'

const LANGUAGE_ID = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/u
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u
const COMMIT = /^[0-9a-f]{40}$/u
const PATH_SEGMENT = /^[A-Za-z0-9._@+-]+$/u
const DATA_ICON = /^data:(?:image\/svg\+xml|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]*={0,2})$/u
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const MAX_INLINE_ICON_BYTES = 32 * 1024

const problems = []
const fail = (path, reason) => problems.push(`${path} ${reason}`)
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

function localizedText(value, path) {
  if (typeof value === 'string') return
  if (!isObject(value)) return fail(path, 'must be a string or an object of language ids')
  if (typeof value.en !== 'string' || value.en.trim() === '') fail(path, 'must contain en')
  for (const [language, text] of Object.entries(value)) {
    if (!LANGUAGE_ID.test(language)) fail(`${path}.${language}`, 'must be keyed by a lowercase language id')
    if (typeof text !== 'string' || text.trim() === '') fail(`${path}.${language}`, 'must be a non-empty string')
  }
}

function absoluteUrl(value, path, protocols, { queryAndFragment = false } = {}) {
  if (typeof value !== 'string' || value.trim() === '') return fail(path, 'must be a non-empty string')
  let url
  try {
    url = new URL(value)
  } catch {
    return fail(path, 'must be an absolute URL')
  }
  if (!protocols.includes(url.protocol)) return fail(path, `must use ${protocols.join(' or ')}`)
  if (url.username || url.password) fail(path, 'must not contain credentials')
  if (!queryAndFragment && (url.href.includes('?') || url.href.includes('#'))) fail(path, 'must not contain a query or fragment')
}

function packagePath(value, path) {
  if (typeof value !== 'string' || value.trim() === '') return fail(path, 'must be a non-empty string')
  if (value.split('/').some((segment) => segment === '.' || segment === '..' || !PATH_SEGMENT.test(segment))) {
    fail(path, 'must be a relative directory of letters, digits and ._@+- segments without . or ..')
  }
}

function icon(value, path) {
  if (typeof value !== 'string' || value.trim() === '') return fail(path, 'must be a non-empty string')
  if (value.startsWith('data:')) {
    const payload = DATA_ICON.exec(value)?.[1]
    if (payload === undefined || payload === '' || !BASE64.test(payload)) {
      return fail(path, 'must be a base64 SVG, PNG, JPEG, or WebP data URL')
    }
    if ((payload.length / 4) * 3 > MAX_INLINE_ICON_BYTES) fail(path, 'must not exceed 32 KiB of decoded bytes')
    return
  }
  let resolved
  try {
    resolved = new URL(value, indexUrl)
  } catch {
    return fail(path, 'must be a URL reference')
  }
  const base = new URL(indexUrl)
  if (resolved.protocol !== 'https:' && resolved.origin !== base.origin) {
    fail(path, 'must resolve to https or the index origin')
  }
}

function repository(value, path) {
  if (!isObject(value)) return fail(path, 'must be an object')
  absoluteUrl(value.url, `${path}.url`, ['https:', 'http:'])
  if (value.directory !== undefined) packagePath(value.directory, `${path}.directory`)
}

function declarations(value, path, read) {
  if (value === undefined) return {}
  if (!isObject(value)) {
    fail(path, 'must be an object')
    return {}
  }
  for (const [id, member] of Object.entries(value)) {
    if (id === '') fail(path, 'must not declare an empty id')
    read(member, `${path}.${id}`)
  }
  return value
}

function versionSource(value, path) {
  if (!isObject(value)) return fail(path, 'must be an object')
  if (value.type === 'npm') {
    if (value.registry !== undefined) absoluteUrl(value.registry, `${path}.registry`, ['https:', 'http:'])
    return
  }
  if (value.type !== 'git') return fail(`${path}.type`, 'must be "npm" or "git"')
  if (typeof value.commit !== 'string' || !COMMIT.test(value.commit)) {
    fail(`${path}.commit`, 'must be a lowercase 40-hex-digit commit SHA')
  }
  if (typeof value.url !== 'string' || value.url.trim() === '') return fail(`${path}.url`, 'must be a non-empty string')
  let url
  try {
    url = new URL(value.url)
  } catch {
    return fail(`${path}.url`, 'must be an absolute URL')
  }
  if (url.protocol !== 'https:') fail(`${path}.url`, 'must use https:')
  if (url.href !== value.url) fail(`${path}.url`, 'must be a canonical URL')
  if (!/^(?:\/[^/]+){2,}$/u.test(url.pathname)) fail(`${path}.url`, 'must name a repository with at least two path segments')
  if (/\.(?:tgz|tar\.gz)$/iu.test(url.pathname)) fail(`${path}.url`, 'must name a repository, not a tarball')
  if (value.path !== undefined) packagePath(value.path, `${path}.path`)
}

function version(value, path) {
  if (!isObject(value)) return fail(path, 'must be an object')
  if (typeof value.version !== 'string' || !SEMVER.test(value.version)) fail(`${path}.version`, 'must be an exact SemVer version')
  if (!Number.isInteger(value.publishTimestamp) || value.publishTimestamp < 0 || value.publishTimestamp >= 1e11) {
    fail(`${path}.publishTimestamp`, 'must be an integer number of Unix seconds in [0, 10^11)')
  }
  versionSource(value.source, `${path}.source`)
  if (value.engines !== undefined) {
    if (!isObject(value.engines)) fail(`${path}.engines`, 'must be an object')
    else if (value.engines.dsh !== undefined && typeof value.engines.dsh !== 'string') {
      fail(`${path}.engines.dsh`, 'must be a SemVer range string')
    }
  }
}

function pluginMetadata(value, path, categories, labels, sortKeys) {
  if (value === undefined) return
  if (!isObject(value)) return fail(path, 'must be an object')
  if (value.category !== undefined && (typeof value.category !== 'string' || !(value.category in categories))) {
    fail(`${path}.category`, 'references an undeclared category')
  }
  if (value.keywords !== undefined) {
    if (!Array.isArray(value.keywords)) fail(`${path}.keywords`, 'must be an array')
    else if (value.keywords.some((keyword) => typeof keyword !== 'string')) fail(`${path}.keywords`, 'must contain strings only')
  }
  if (value.labels !== undefined) {
    if (!Array.isArray(value.labels)) fail(`${path}.labels`, 'must be an array')
    else {
      for (const label of value.labels) {
        if (typeof label !== 'string' || !(label in labels)) fail(`${path}.labels`, 'references an undeclared label')
      }
      if (new Set(value.labels).size !== value.labels.length) fail(`${path}.labels`, 'must not repeat a label')
    }
  }
  if (value.sortKeys !== undefined) {
    if (!isObject(value.sortKeys)) fail(`${path}.sortKeys`, 'must be an object')
    else {
      for (const [id, sortValue] of Object.entries(value.sortKeys)) {
        if (!(id in sortKeys)) fail(`${path}.sortKeys.${id}`, 'references an undeclared sort key')
        if (typeof sortValue !== 'number' || !Number.isFinite(sortValue)) fail(`${path}.sortKeys.${id}`, 'must be a finite number')
      }
    }
  }
}

let index
try {
  index = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  console.error(`check-market-index: cannot read ${file}: ${error.message}`)
  process.exit(1)
}

if (!isObject(index)) {
  console.error('check-market-index: the index must be a JSON object')
  process.exit(1)
}
if (index.format !== 1) fail('$.format', 'must be 1')
localizedText(index.title, '$.title')
if (index.description !== undefined) localizedText(index.description, '$.description')

const metadata = isObject(index.metadata) ? index.metadata : {}
if (index.metadata !== undefined && !isObject(index.metadata)) fail('$.metadata', 'must be an object')
const categories = declarations(metadata.categories, '$.metadata.categories', (member, path) => {
  if (!isObject(member)) return fail(path, 'must be an object')
  localizedText(member.title, `${path}.title`)
})
const labels = declarations(metadata.labels, '$.metadata.labels', (member, path) => {
  if (!isObject(member)) return fail(path, 'must be an object')
  localizedText(member.title, `${path}.title`)
})
const sortKeys = declarations(metadata.sortKeys, '$.metadata.sortKeys', (member, path) => {
  if (!isObject(member)) return fail(path, 'must be an object')
  localizedText(member.title, `${path}.title`)
  if (member.order !== 'asc' && member.order !== 'desc') fail(`${path}.order`, 'must be "asc" or "desc"')
})

if (!Array.isArray(index.plugins)) fail('$.plugins', 'must be an array')
const names = new Set()
for (const [position, entry] of (index.plugins ?? []).entries()) {
  const path = `$.plugins[${position}]`
  if (!isObject(entry)) {
    fail(path, 'must be an object')
    continue
  }
  if (typeof entry.name !== 'string' || !PACKAGE_NAME.test(entry.name) || entry.name.length > 214) {
    fail(`${path}.name`, 'must be a valid npm package name')
  }
  if (entry.title !== undefined) localizedText(entry.title, `${path}.title`)
  if (entry.description !== undefined) localizedText(entry.description, `${path}.description`)
  if (entry.icon !== undefined) icon(entry.icon, `${path}.icon`)
  if (entry.author !== undefined && (typeof entry.author !== 'string' || entry.author.trim() === '')) {
    fail(`${path}.author`, 'must be a non-empty string')
  }
  if (entry.homepage !== undefined) absoluteUrl(entry.homepage, `${path}.homepage`, ['https:', 'http:'], { queryAndFragment: true })
  if (entry.repository !== undefined) repository(entry.repository, `${path}.repository`)
  pluginMetadata(entry.metadata, `${path}.metadata`, categories, labels, sortKeys)

  if (!Array.isArray(entry.versions) || entry.versions.length === 0) {
    fail(`${path}.versions`, 'must be a non-empty array')
  } else {
    const seen = new Set()
    for (const [versionPosition, versionEntry] of entry.versions.entries()) {
      const at = `${path}.versions[${versionPosition}]`
      version(versionEntry, at)
      if (isObject(versionEntry) && typeof versionEntry.version === 'string') {
        if (seen.has(versionEntry.version)) fail(`${at}.version`, `duplicates ${versionEntry.version}`)
        seen.add(versionEntry.version)
      }
    }
  }

  if (typeof entry.name === 'string') {
    if (names.has(entry.name)) fail(`${path}.name`, `duplicates ${entry.name}`)
    names.add(entry.name)
  }
}

if (problems.length > 0) {
  console.error(`check-market-index: ${problems.length} problem(s) in ${file}`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log(
  `check-market-index: format 1, ${(index.plugins ?? []).length} plugin(s), ${(index.plugins ?? []).reduce(
    (total, entry) => total + (Array.isArray(entry.versions) ? entry.versions.length : 0),
    0,
  )} version(s)`,
)
