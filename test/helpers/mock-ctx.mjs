/**
 * Minimal fake Cordis context: enough of the plugin contract to register and
 * invoke tools without a running harness.
 */

export function createMockContext(options = {}) {
  const { inputPolicy = 'allow', approvalOutcome = 'allowed-once', attachments = null, llm = null } = options
  const tools = new Map()
  const effects = []
  const approval = {
    requests: [],
    async request(request) {
      this.requests.push(request)
      return approvalOutcome
    },
  }

  const ctx = {
    tools: {
      register(definition) {
        if (tools.has(definition.name)) throw new Error(`duplicate tool ${definition.name}`)
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    effect(callback) {
      const dispose = callback()
      const disposer = typeof dispose === 'function' ? dispose : () => {}
      effects.push(disposer)
      return disposer
    },
    get(name) {
      if (name === 'approval') return approval
      if (name === 'attachments') return attachments
      if (name === 'llm') return llm
      if (name === 'systemPrompt') return undefined
      return undefined
    },
    logger: {
      info() {},
      warn() {},
      debug() {},
      error() {},
    },
    config: { inputPolicy },
  }

  return {
    ctx,
    tools,
    approval,
    dispose() {
      while (effects.length > 0) {
        const disposer = effects.pop()
        try {
          disposer()
        } catch {
          /* teardown must not throw */
        }
      }
    },
  }
}

/** Build a fake tool execution context. */
export function createExec(name, extra = {}) {
  const controller = new AbortController()
  return {
    callId: `call-${Math.random().toString(16).slice(2)}`,
    name,
    arguments: {},
    signal: controller.signal,
    ...extra,
    controller,
  }
}
