import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clampTo, describeGeometry, imageToScreen } from '../../src/geometry.js'

describe('geometry', () => {
  it('maps an image pixel back to the screen', () => {
    const geometry = { origin: { x: 100, y: 50 }, scale: 0.5 }
    assert.deepEqual(imageToScreen({ x: 200, y: 100 }, geometry), { x: 500, y: 250 })
  })

  it('treats a missing or invalid scale as 1:1', () => {
    assert.deepEqual(imageToScreen({ x: 10, y: 20 }, { origin: { x: 0, y: 0 }, scale: 0 }), { x: 10, y: 20 })
    assert.deepEqual(imageToScreen({ x: 10, y: 20 }, undefined), { x: 10, y: 20 })
  })

  it('handles a negative virtual-screen origin', () => {
    const geometry = { origin: { x: -1920, y: 0 }, scale: 1 }
    assert.deepEqual(imageToScreen({ x: 10, y: 10 }, geometry), { x: -1910, y: 10 })
  })

  it('clamps points into a rectangle', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 }
    assert.deepEqual(clampTo(rect, { x: -10, y: 80 }), { x: 0, y: 49 })
    assert.deepEqual(clampTo(rect, { x: 20, y: 20 }), { x: 20, y: 20 })
    assert.deepEqual(clampTo(null, { x: 20, y: 20 }), { x: 20, y: 20 })
  })

  it('describes geometry for text output', () => {
    assert.match(describeGeometry({ width: 800, height: 600, scale: 0.5, origin: { x: 0, y: 0 } }), /800x600/)
    assert.match(describeGeometry(undefined), /no capture/)
  })
})
