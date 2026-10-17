/**
 * Input approval gate.
 *
 * Pointer and keyboard actions are real, user-visible desktop input, so they
 * are gated by policy: `deny` refuses, `allow` proceeds, and `ask` (default)
 * routes one approval request per session through the harness approval channel
 * and remembers the grant for the rest of that session.
 */

const MAX_GRANTS = 64
const grants = new Set()

/**
 * Throw unless the calling session may inject input.
 * @param {object} ctx plugin context
 * @param {object} cfg normalized config
 * @param {object} exec tool execution context
 * @param {string} action human description of the attempted action
 */
export async function ensureInputAllowed(ctx, cfg, exec, action) {
  if (cfg.inputPolicy === 'deny') {
    throw new Error('screen control input is disabled by policy (inputPolicy: "deny"); change the plugin config to allow input')
  }
  if (cfg.inputPolicy === 'allow') return

  const key = grantKey(exec)
  if (grants.has(key)) return

  const approval = typeof ctx.get === 'function' ? ctx.get('approval') : undefined
  const agent = exec?.agent
  if (!approval || typeof approval.request !== 'function' || !agent) {
    throw new Error(
      'screen control needs the user to approve desktop input, but no approval channel or owning agent is available; set inputPolicy: "deny" to keep the tools read-only',
    )
  }

  let outcome
  try {
    outcome = await approval.request({
      agent,
      toolName: exec.name ?? 'screen_control',
      callId: exec.callId,
      reason: `allow the agent to ${action} on this desktop?`,
      signal: exec.signal,
    })
  } catch (error) {
    throw new Error(`screen control input needs approval, but the approval request failed: ${error.message}`)
  }
  if (outcome !== 'allowed-once') {
    throw new Error(`screen control input was not approved (${outcome})`)
  }

  grants.add(key)
  while (grants.size > MAX_GRANTS) grants.delete(grants.keys().next().value)
}

/** Reset cached grants (tests and plugin reloads). */
export function clearApprovals() {
  grants.clear()
}

function grantKey(exec) {
  const agent = exec?.agent
  return String(agent?.sessionId ?? agent?.session?.id ?? 'anonymous')
}
