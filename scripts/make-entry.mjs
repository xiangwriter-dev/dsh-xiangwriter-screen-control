#!/usr/bin/env node
/**
 * Generate the awesome-dsh-plugin submission file for this repository.
 *
 * Usage: node scripts/make-entry.mjs <owner> [repo]
 *
 * The list expects one YAML file per plugin at
 * `data/plugins/<owner>__<repo>.yml`; this script writes that file at the
 * repository root, ready to copy into the pull request.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const owner = process.argv[2]
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
// The repository name is read from the manifest's repository URL: the package
// name and the GitHub repository are allowed to differ.
const repoFromManifest = /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?$/.exec(manifest.repository?.url ?? '')
const repo = process.argv[3] ?? (repoFromManifest ? repoFromManifest[2] : manifest.name)

if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) {
  console.error('usage: node scripts/make-entry.mjs <github-owner> [repo]')
  process.exit(1)
}

const url = `https://github.com/${owner}/${repo}`
const entry = [
  `url: ${url}`,
  `name: ${owner}/${repo}`,
  'category: tools',
  'description:',
  "  en: 'Windows screen control for DeepSeek Harness: screenshot, mouse and keyboard input, UI Automation tree and window focus through six screen_* tools on a stock Windows PowerShell 5.1 engine, with approval gating and a Ctrl+Alt+Esc emergency stop.'",
  "  zh: '面向 DeepSeek Harness 的 Windows 屏幕控制：截屏、鼠标键盘输入、UI Automation 控件树与窗口聚焦，六个 screen_* 工具由系统自带 PowerShell 5.1 引擎驱动，带输入审批与 Ctrl+Alt+Esc 紧急停止。'",
  `tarball: https://github.com/${owner}/${repo}/releases/latest/download/dsh-xiangwriter-screen-control.tgz`,
  '',
].join('\n')

writeFileSync(join(root, 'awesome-plugin-entry.yml'), entry, 'utf8')
console.log(`wrote awesome-plugin-entry.yml (submit it as data/plugins/${owner}__${repo}.yml)`)
