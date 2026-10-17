/**
 * Key-chord validation shared by the tools and the test suite.
 * The engine owns the actual VK table; this only rejects malformed input
 * early with a clear model-facing message.
 */

const NAME = /^[a-z0-9`\-=\[\]\\;',.\/]$/
const KEYWORD = /^(ctrl|control|alt|shift|win|lwin|rwin|enter|return|tab|esc|escape|space|backspace|delete|del|insert|ins|home|end|pageup|pagedown|up|down|left|right|capslock|numlock|scrolllock|printscreen|pause|apps|clear|f\d{1,2})$/

/**
 * Normalize and validate a chord such as `ctrl+shift+t`.
 * @param {string} chord
 * @returns {string} the normalized chord
 */
export function normalizeChord(chord) {
  if (typeof chord !== 'string' || chord.trim().length === 0) throw new Error('keys must be a non-empty chord such as "ctrl+s"')
  const parts = chord
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
  if (parts.length === 0) throw new Error('keys must be a non-empty chord such as "ctrl+s"')
  if (parts.length > 4) throw new Error('keys must contain at most four keys')
  for (const part of parts) {
    if (part.length === 1) {
      if (!NAME.test(part)) throw new Error(`unsupported key name "${part}"`)
      continue
    }
    if (!KEYWORD.test(part)) throw new Error(`unsupported key name "${part}"`)
  }
  return parts.join('+')
}
