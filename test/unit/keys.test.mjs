import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeChord } from '../../src/keys.js'

describe('keys', () => {
  it('normalizes case and whitespace', () => {
    assert.equal(normalizeChord('Ctrl + Shift + T'), 'ctrl+shift+t')
    assert.equal(normalizeChord('ENTER'), 'enter')
    assert.equal(normalizeChord('f5'), 'f5')
    assert.equal(normalizeChord('a'), 'a')
  })

  it('rejects malformed chords', () => {
    assert.throws(() => normalizeChord(''), /non-empty chord/)
    assert.throws(() => normalizeChord('+++'), /non-empty chord/)
    assert.throws(() => normalizeChord('notakey'), /unsupported key name/)
    assert.throws(() => normalizeChord('ctrl+alt+shift+win+t'), /at most four/)
  })
})
