import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULTS, normalizeConfig } from '../../src/config.js'

describe('config', () => {
  it('applies defaults for an empty row', () => {
    const cfg = normalizeConfig(undefined)
    assert.equal(cfg.inputPolicy, 'ask')
    assert.deepEqual(cfg.capture, DEFAULTS.capture)
    assert.deepEqual(cfg.failsafe, DEFAULTS.failsafe)
    assert.deepEqual(cfg.bridge, DEFAULTS.bridge)
  })

  it('merges partial overrides', () => {
    const cfg = normalizeConfig({ inputPolicy: 'allow', capture: { maxWidth: 800 } })
    assert.equal(cfg.inputPolicy, 'allow')
    assert.equal(cfg.capture.maxWidth, 800)
    assert.equal(cfg.capture.format, 'png')
  })

  it('rejects unknown policies and bad numbers', () => {
    assert.throws(() => normalizeConfig({ inputPolicy: 'yes' }), /inputPolicy must be one of/)
    assert.throws(() => normalizeConfig({ capture: { maxWidth: 10 } }), /between 320 and 8192/)
    assert.throws(() => normalizeConfig({ capture: { format: 'webp' } }), /capture.format must be one of/)
    assert.throws(() => normalizeConfig({ bridge: { timeoutMs: 1.5 } }), /must be an integer/)
  })
})
