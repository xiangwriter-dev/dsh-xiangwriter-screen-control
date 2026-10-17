/**
 * JSON-lines wire protocol shared by the Node client and the PowerShell engine.
 *
 * Requests are emitted as pure ASCII JSON so Windows PowerShell 5.1 cannot
 * mangle non-ASCII text on stdin; responses are decoded as UTF-8.
 */

const NON_ASCII = /[^\x00-\x7f]/g

/** Escape every non-ASCII UTF-16 code unit as a JSON `\uXXXX` sequence. */
export function escapeNonAscii(text) {
  return String(text).replace(NON_ASCII, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/** Encode one request as a single protocol line (without the newline). */
export function encodeRequest(id, op, args) {
  return escapeNonAscii(JSON.stringify({ id: String(id), op, args: args ?? {} }))
}

/**
 * Parse one response line.
 * @returns {{id: string|null, ok: boolean, result?: unknown, error?: {code: string, message: string}}}
 */
export function parseResponse(line) {
  const trimmed = String(line).trim()
  if (trimmed.length === 0) throw new Error('empty protocol line')
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object') throw new Error('protocol line is not a JSON object')
  const ok = parsed.ok === true
  return {
    id: parsed.id === null || parsed.id === undefined ? null : String(parsed.id),
    ok,
    ...(ok ? { result: parsed.result } : {
      error: {
        code: typeof parsed.error?.code === 'string' ? parsed.error.code : 'E_FAIL',
        message: typeof parsed.error?.message === 'string' ? parsed.error.message : 'engine reported an error',
      },
    }),
  }
}

/** Split a growing stdout buffer into complete lines, returning the remainder. */
export function takeLines(buffer) {
  const lines = []
  let rest = buffer
  let index = rest.indexOf('\n')
  while (index !== -1) {
    const line = rest.slice(0, index).replace(/\r$/, '')
    if (line.trim().length > 0) lines.push(line)
    rest = rest.slice(index + 1)
    index = rest.indexOf('\n')
  }
  return { lines, rest }
}
