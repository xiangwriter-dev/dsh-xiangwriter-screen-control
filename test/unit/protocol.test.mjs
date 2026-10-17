import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { encodeRequest, escapeNonAscii, parseResponse, takeLines } from '../../src/protocol.js'

describe('protocol', () => {
  it('escapes non-ASCII so PowerShell 5.1 stdin stays ASCII', () => {
    const escaped = escapeNonAscii('标题🎯')
    assert.match(escaped, /^\\u[0-9a-f]{4}/)
    assert.equal(/[^\x00-\x7f]/.test(escaped), false)
    assert.equal(JSON.parse(`"${escaped}"`), '标题🎯')
  })

  it('encodes a request line that round-trips through JSON', () => {
    const line = encodeRequest('7', 'capture', { window: '记事本', include_cursor: true })
    assert.equal(/[^\x00-\x7f]/.test(line), false)
    const parsed = JSON.parse(line)
    assert.deepEqual(parsed, { id: '7', op: 'capture', args: { window: '记事本', include_cursor: true } })
  })

  it('parses success and error responses', () => {
    assert.deepEqual(parseResponse('{"id":"1","ok":true,"result":{"x":1}}'), { id: '1', ok: true, result: { x: 1 } })
    const failed = parseResponse('{"id":"2","ok":false,"error":{"code":"E_ARGS","message":"bad"}}')
    assert.equal(failed.ok, false)
    assert.equal(failed.id, '2')
    assert.equal(failed.error.code, 'E_ARGS')
    assert.equal(failed.error.message, 'bad')
  })

  it('defaults missing error fields', () => {
    const failed = parseResponse('{"id":null,"ok":false}')
    assert.equal(failed.id, null)
    assert.equal(failed.error.code, 'E_FAIL')
  })

  it('rejects an empty line', () => {
    assert.throws(() => parseResponse('  '), /empty protocol line/)
  })

  it('splits complete lines and keeps the remainder', () => {
    const first = takeLines('{"a":1}\n{"b":2}\r\n{"partial"')
    assert.deepEqual(first.lines, ['{"a":1}', '{"b":2}'])
    assert.equal(first.rest, '{"partial"')
    const second = takeLines(`${first.rest}}`)
    assert.deepEqual(second.lines, [])
    assert.equal(second.rest, '{"partial"}')
  })
})
