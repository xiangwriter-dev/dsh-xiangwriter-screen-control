/**
 * Per-session memory of the last screenshot geometry, so a model can act on
 * image pixels (`coordinate_space: "image"`) without re-stating the mapping.
 */

const MAX_SESSIONS = 32
const captures = new Map()

/** Stable key for the calling agent's session. */
export function sessionKey(exec) {
  const agent = exec?.agent
  const id = agent?.sessionId ?? agent?.session?.id ?? 'anonymous'
  return String(id)
}

/** Remember the geometry of the most recent capture for one session. */
export function rememberCapture(key, geometry) {
  captures.delete(key)
  captures.set(key, geometry)
  while (captures.size > MAX_SESSIONS) {
    const oldest = captures.keys().next().value
    captures.delete(oldest)
  }
}

/** @returns {{origin: {x: number, y: number}, scale: number, width: number, height: number} | undefined} */
export function lastCapture(key) {
  return captures.get(key)
}

/** Test/teardown helper. */
export function clearCaptures() {
  captures.clear()
}
