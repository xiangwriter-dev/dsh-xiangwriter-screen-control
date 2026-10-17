/**
 * Plugin configuration.
 *
 * The bundle declares no schemastery `Config` export (see src/tool.js for why);
 * defaults and validation live here instead. Invalid values fail activation
 * loudly so a bad profile patch never turns into silent, surprising input.
 */

const INPUT_POLICIES = ['ask', 'allow', 'deny']
const FORMATS = ['png', 'jpeg']

const DEFAULTS = {
  inputPolicy: 'ask',
  capture: { maxWidth: 1600, format: 'png', quality: 82, keepShots: 20 },
  failsafe: { enabled: true, hotkey: 'ctrl+alt+esc', cooldownMs: 30000 },
  bridge: { command: '', timeoutMs: 15000, restartLimit: 2, idleTimeoutSec: 1800 },
}

/** @returns {object} the fully-populated configuration */
export function normalizeConfig(raw) {
  const input = isRecord(raw) ? raw : {}
  const capture = isRecord(input.capture) ? input.capture : {}
  const failsafe = isRecord(input.failsafe) ? input.failsafe : {}
  const bridge = isRecord(input.bridge) ? input.bridge : {}

  return {
    inputPolicy: pickEnum(input.inputPolicy, INPUT_POLICIES, 'inputPolicy', DEFAULTS.inputPolicy),
    capture: {
      maxWidth: pickInt(capture.maxWidth, 'capture.maxWidth', DEFAULTS.capture.maxWidth, 320, 8192),
      format: pickEnum(capture.format, FORMATS, 'capture.format', DEFAULTS.capture.format),
      quality: pickInt(capture.quality, 'capture.quality', DEFAULTS.capture.quality, 30, 100),
      keepShots: pickInt(capture.keepShots, 'capture.keepShots', DEFAULTS.capture.keepShots, 0, 500),
    },
    failsafe: {
      enabled: pickBool(failsafe.enabled, 'failsafe.enabled', DEFAULTS.failsafe.enabled),
      hotkey: pickString(failsafe.hotkey, 'failsafe.hotkey', DEFAULTS.failsafe.hotkey),
      cooldownMs: pickInt(failsafe.cooldownMs, 'failsafe.cooldownMs', DEFAULTS.failsafe.cooldownMs, 0, 600000),
    },
    bridge: {
      command: pickString(bridge.command, 'bridge.command', DEFAULTS.bridge.command),
      timeoutMs: pickInt(bridge.timeoutMs, 'bridge.timeoutMs', DEFAULTS.bridge.timeoutMs, 1000, 300000),
      restartLimit: pickInt(bridge.restartLimit, 'bridge.restartLimit', DEFAULTS.bridge.restartLimit, 0, 20),
      idleTimeoutSec: pickInt(bridge.idleTimeoutSec, 'bridge.idleTimeoutSec', DEFAULTS.bridge.idleTimeoutSec, 30, 86400),
    },
  }
}

export { DEFAULTS }

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pickEnum(value, allowed, name, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`screen-control config: ${name} must be one of ${allowed.join(', ')}`)
  }
  return value
}

function pickString(value, name, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') throw new Error(`screen-control config: ${name} must be a string`)
  return value
}

function pickBool(value, name, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') throw new Error(`screen-control config: ${name} must be a boolean`)
  return value
}

function pickInt(value, name, fallback, min, max) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`screen-control config: ${name} must be an integer`)
  }
  if (value < min || value > max) {
    throw new Error(`screen-control config: ${name} must be between ${min} and ${max}`)
  }
  return value
}
