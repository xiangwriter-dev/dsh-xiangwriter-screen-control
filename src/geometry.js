/**
 * Coordinate mapping between a returned screenshot and the physical screen.
 *
 * `screen_capture` reports `source` (the screen rectangle it covered) and
 * `scale` (image pixels per screen pixel). A model pointing at a pixel in the
 * image must be converted back before clicking.
 */

/**
 * @param {{x: number, y: number}} point image-space pixel
 * @param {{origin: {x: number, y: number}, scale: number}} geometry last capture
 * @returns {{x: number, y: number}} screen-space pixel
 */
export function imageToScreen(point, geometry) {
  const scale = geometry?.scale > 0 ? geometry.scale : 1
  const origin = geometry?.origin ?? { x: 0, y: 0 }
  return {
    x: Math.round(origin.x + point.x / scale),
    y: Math.round(origin.y + point.y / scale),
  }
}

/** Clamp a point into a rectangle; returns the point unchanged for an empty rect. */
export function clampTo(source, point) {
  if (!source || !(source.width > 0) || !(source.height > 0)) return { ...point }
  return {
    x: Math.min(Math.max(point.x, source.x), source.x + source.width - 1),
    y: Math.min(Math.max(point.y, source.y), source.y + source.height - 1),
  }
}

/** Describe a geometry for prompt/result text. */
export function describeGeometry(geometry) {
  if (!geometry) return 'no capture in this session yet'
  return `image ${geometry.width}x${geometry.height}, scale ${geometry.scale}, origin ${geometry.origin.x},${geometry.origin.y}`
}
