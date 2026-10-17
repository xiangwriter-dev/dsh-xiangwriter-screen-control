import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { apply } from '../../index.js'
import { createExec, createMockContext } from '../helpers/mock-ctx.mjs'

const pending = process.env.DSH_SCREEN_E2E !== '1'
const skip = pending ? 'set DSH_SCREEN_E2E=1 to run the live Windows engine tests' : undefined

describe('screen-control tools against the live engine', { skip }, () => {
  let harness
  let originalCursor

  before(async () => {
    harness = createMockContext()
    apply(harness.ctx, { inputPolicy: 'allow', capture: { maxWidth: 320 }, bridge: { timeoutMs: 30000 } })
  })

  after(async () => {
    if (originalCursor && harness) {
      // Best-effort restore; the bridge may already be disposed.
      try {
        const tool = harness.tools.get('screen_pointer')
        await tool.execute({ action: 'move', x: originalCursor.x, y: originalCursor.y }, createExec('screen_pointer'))
      } catch {
        /* ignore */
      }
    }
    harness?.dispose()
  })

  it('registers the six screen tools', () => {
    assert.deepEqual([...harness.tools.keys()].sort(), [
      'screen_capture',
      'screen_keyboard',
      'screen_pointer',
      'screen_ui',
      'screen_wait',
      'screen_windows',
    ])
  })

  it('captures a real PNG and reports geometry', async () => {
    const tool = harness.tools.get('screen_capture')
    const value = await tool.execute({ max_width: 320 }, createExec('screen_capture'))
    assert.equal(value.ok, true)
    assert.equal(value.mediaType, 'image/png')
    assert.ok(value.width <= 320 && value.width > 0)
    assert.ok(value.height > 0)
    assert.ok(value.source.width >= value.width)
    assert.ok(value.scale > 0 && value.scale <= 1)
    assert.ok(existsSync(value.path), `capture file missing: ${value.path}`)
    const bytes = readFileSync(value.path)
    assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])
    assert.ok(value.cursor && Number.isInteger(value.cursor.x))
    originalCursor = value.cursor
  })

  it('moves the real cursor and reports it back', async () => {
    const pointer = harness.tools.get('screen_pointer')
    const moved = await pointer.execute({ action: 'move', x: 120, y: 90 }, createExec('screen_pointer'))
    assert.equal(moved.ok, true)
    assert.deepEqual(moved.cursor, { x: 120, y: 90 })

    const restored = await pointer.execute(
      { action: 'move', x: originalCursor.x, y: originalCursor.y },
      createExec('screen_pointer'),
    )
    assert.deepEqual(restored.cursor, { x: originalCursor.x, y: originalCursor.y })
  })

  it('maps image coordinates back to the screen', async () => {
    const capture = harness.tools.get('screen_capture')
    const pointer = harness.tools.get('screen_pointer')
    const shot = await capture.execute({ max_width: 400 }, createExec('screen_capture'))
    const imagePoint = { x: Math.floor(shot.width / 2), y: Math.floor(shot.height / 2) }
    const result = await pointer.execute(
      { action: 'move', x: imagePoint.x, y: imagePoint.y, coordinate_space: 'image' },
      createExec('screen_pointer'),
    )
    const expectedX = Math.round(shot.source.x + imagePoint.x / shot.scale)
    const expectedY = Math.round(shot.source.y + imagePoint.y / shot.scale)
    assert.equal(result.cursor.x, expectedX)
    assert.equal(result.cursor.y, expectedY)
    await pointer.execute({ action: 'move', x: originalCursor.x, y: originalCursor.y }, createExec('screen_pointer'))
  })

  it('lists windows with process names', async () => {
    const windows = harness.tools.get('screen_windows')
    const value = await windows.execute({ action: 'list', limit: 10 }, createExec('screen_windows'))
    assert.equal(value.ok, true)
    assert.ok(value.count >= 1)
    assert.ok(Array.isArray(value.windows))
    assert.ok(value.windows.every((entry) => Number.isInteger(entry.hwnd) && typeof entry.title === 'string'))
  })

  it('reads a UI Automation tree for the foreground window', async () => {
    const ui = harness.tools.get('screen_ui')
    const value = await ui.execute({ depth: 2, max_nodes: 40 }, createExec('screen_ui'))
    assert.equal(value.ok, true)
    assert.ok(value.nodeCount >= 1)
    assert.equal(typeof value.tree, 'object')
  })

  it('waits without failing', async () => {
    const wait = harness.tools.get('screen_wait')
    const value = await wait.execute({ for: 'ms', ms: 120 }, createExec('screen_wait'))
    assert.equal(value.ok, true)
    assert.equal(value.matched, true)
    assert.ok(value.waitedMs >= 100)
  })

  it('rejects an unknown key chord before touching the engine', async () => {
    const keyboard = harness.tools.get('screen_keyboard')
    await assert.rejects(
      () => keyboard.execute({ action: 'key', keys: 'notakey' }, createExec('screen_keyboard')),
      /unsupported key name/,
    )
  })
})
