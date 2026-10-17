/**
 * Long-lived PowerShell bridge.
 *
 * One worker process is started lazily and kept alive; input requests are
 * serialized so mouse/keyboard actions can never interleave. If the host
 * forbids piped child stdio (a restricted environment can report EPERM), the
 * bridge degrades to one-shot runs that exchange JSON files.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeRequest, parseResponse, takeLines } from './protocol.js'

const SCRIPT_PATH = fileURLToPath(new URL('../scripts/screen-control.ps1', import.meta.url))
const DEFAULT_POWERSHELL = join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)
const STDERR_LIMIT = 4000

export class ScreenBridge {
  /**
   * @param {ReturnType<import('./config.js').normalizeConfig>} config
   * @param {{logger?: {info?: Function, warn?: Function, debug?: Function}, get?: Function}} ctx
   */
  constructor(config, ctx) {
    this.config = config
    this.ctx = ctx
    this.powershell = config.bridge.command || DEFAULT_POWERSHELL
    this.child = null
    this.starting = null
    this.mode = 'auto'
    this.sequence = 0
    this.pending = new Map()
    this.buffer = ''
    this.stderr = ''
    this.disposed = false
    this.queue = Promise.resolve()
    this.restarts = 0
  }

  /**
   * Issue one engine operation.
   * @param {string} op
   * @param {object} args
   * @param {{signal?: AbortSignal, timeoutMs?: number}} [options]
   */
  call(op, args = {}, options = {}) {
    if (this.disposed) return Promise.reject(new Error('screen-control: the plugin has been disposed'))
    const run = () => this.dispatch(op, args, options)
    const next = this.queue.then(run, run)
    this.queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  async dispatch(op, args, options) {
    await this.ensureStarted()
    if (this.mode === 'once') return this.callOnce(op, args, options)
    return this.callPipe(op, args, options)
  }

  async ensureStarted() {
    if (this.mode === 'once') return
    if (this.child && this.child.exitCode === null) return
    if (this.starting) return this.starting
    this.starting = this.startWorker()
      .catch((error) => {
        if (error && error.restricted) {
          this.mode = 'once'
          this.log('warn', `piped stdio is unavailable (${error.message}); using one-shot engine runs`)
          return
        }
        throw error
      })
      .finally(() => {
        this.starting = null
      })
    return this.starting
  }

  startWorker() {
    if (this.restarts > this.config.bridge.restartLimit) {
      return Promise.reject(
        new Error(
          `screen-control: the PowerShell engine exited ${this.restarts} times in a row; refusing to restart it again (bridge.restartLimit)`,
        ),
      )
    }
    return new Promise((resolve, reject) => {
      let settled = false
      let child
      try {
        child = spawn(this.powershell, this.workerArgs(), {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        })
      } catch (error) {
        // A restricted host rejects the pipe spawn synchronously.
        const restricted = error && (error.code === 'EPERM' || error.code === 'EACCES')
        const wrapped = new Error(`cannot start PowerShell (${error?.code || error?.message || 'unknown error'})`)
        wrapped.restricted = Boolean(restricted)
        reject(wrapped)
        return
      }
      child.once('spawn', () => {
        if (settled) return
        settled = true
        this.restarts = 0
        this.attach(child)
        resolve()
      })
      child.on('error', (error) => {
        if (settled) {
          this.log('warn', `bridge process error: ${error.message}`)
          return
        }
        settled = true
        const restricted = error && (error.code === 'EPERM' || error.code === 'EACCES')
        const wrapped = new Error(`cannot start PowerShell (${error.code || error.message})`)
        wrapped.restricted = Boolean(restricted)
        try {
          child.kill()
        } catch {
          /* already gone */
        }
        reject(wrapped)
      })
    })
  }

  attach(child) {
    this.child = child
    this.buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      const { lines, rest } = takeLines(this.buffer + chunk)
      this.buffer = rest
      for (const line of lines) this.onLine(line)
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_LIMIT)
    })
    child.stdin.on('error', (error) => {
      this.failPending(new Error(`screen-control: engine stdin failed (${error.message})`))
    })
    child.on('exit', (code, signal) => {
      if (this.child === child) this.child = null
      if (!this.disposed) this.restarts += 1
      const suffix = this.stderr.trim() ? `: ${this.stderr.trim().split(/\r?\n/).slice(-3).join(' | ')}` : ''
      this.failPending(new Error(`screen-control: the PowerShell engine exited (${code ?? signal ?? 'unknown'})${suffix}`))
    })
  }

  onLine(line) {
    let response
    try {
      response = parseResponse(line)
    } catch {
      this.log('debug', `ignoring unparseable engine line: ${line.slice(0, 200)}`)
      return
    }
    const entry = this.pending.get(response.id)
    if (!entry) return
    entry.settle()
    if (response.ok) entry.resolve(response.result)
    else {
      const error = new Error(response.error.message)
      error.code = response.error.code
      entry.reject(error)
    }
  }

  callPipe(op, args, options) {
    const id = String((this.sequence += 1))
    const line = encodeRequest(id, op, args)
    const timeoutMs = options.timeoutMs ?? this.config.bridge.timeoutMs
    return new Promise((resolve, reject) => {
      let timer = null
      const settle = () => {
        this.pending.delete(id)
        if (timer) clearTimeout(timer)
        if (options.signal) options.signal.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        settle()
        this.killWorker()
        const error = new Error('screen-control: the tool call was aborted')
        error.name = 'AbortError'
        reject(error)
      }
      timer = setTimeout(() => {
        settle()
        this.killWorker()
        reject(new Error(`screen-control: ${op} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      if (options.signal) {
        if (options.signal.aborted) {
          onAbort()
          return
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
      this.pending.set(id, { resolve, reject, settle })
      const child = this.child
      if (!child || child.stdin.destroyed) {
        settle()
        reject(new Error('screen-control: the PowerShell engine is not running'))
        return
      }
      child.stdin.write(`${line}\n`, 'utf8', (error) => {
        if (!error) return
        settle()
        reject(new Error(`screen-control: cannot write to the engine (${error.message})`))
      })
    })
  }

  async callOnce(op, args, options) {
    const timeoutMs = options.timeoutMs ?? this.config.bridge.timeoutMs
    const directory = await mkdtemp(join(tmpdir(), 'dsh-screen-control-'))
    const requestPath = join(directory, 'request.json')
    const responsePath = join(directory, 'response.json')
    try {
      await writeFile(requestPath, encodeRequest('once', op, args), 'utf8')
      // No piped stdio: a restricted host may forbid named pipes for child
      // processes, so the one-shot mode exchanges files only.
      const result = spawnSync(
        this.powershell,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          SCRIPT_PATH,
          '-Once',
          '-RequestFile',
          requestPath,
          '-ResponseFile',
          responsePath,
        ],
        { stdio: 'ignore', timeout: timeoutMs, windowsHide: true },
      )
      if (result.error) throw new Error(`screen-control: one-shot engine failed (${result.error.message})`)
      let raw = ''
      try {
        raw = await readFile(responsePath, 'utf8')
      } catch {
        throw new Error(`screen-control: one-shot engine produced no response (exit ${result.status ?? 'unknown'})`)
      }
      const lines = raw.split(/\r?\n/).filter((entry) => entry.trim().length > 0)
      if (lines.length === 0) throw new Error('screen-control: one-shot engine produced an empty response')
      const response = parseResponse(lines[lines.length - 1])
      if (response.ok) return response.result
      const error = new Error(response.error.message)
      error.code = response.error.code
      throw error
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
    }
  }

  workerArgs() {
    return [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SCRIPT_PATH,
      '-IdleTimeoutSec',
      String(this.config.bridge.idleTimeoutSec),
    ]
  }

  failPending(error) {
    for (const entry of this.pending.values()) {
      entry.settle()
      entry.reject(error)
    }
    this.pending.clear()
  }

  killWorker() {
    const child = this.child
    this.child = null
    if (!child) return
    try {
      child.stdin.end()
    } catch {
      /* already closed */
    }
    try {
      child.kill()
    } catch {
      /* already gone */
    }
  }

  dispose() {
    this.disposed = true
    this.killWorker()
    this.failPending(new Error('screen-control: the plugin was disposed'))
  }

  log(level, message) {
    const logger = this.ctx?.logger
    const write = logger?.[level]
    if (typeof write === 'function') {
      try {
        write.call(logger, `screen-control: ${message}`)
      } catch {
        /* logging must never break a call */
      }
    }
  }
}
