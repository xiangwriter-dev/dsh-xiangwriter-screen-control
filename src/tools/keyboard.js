/** `screen_keyboard`: type Unicode text, send a key chord, or paste. */
import { defineTool, text } from '../tool.js'
import { ensureInputAllowed } from '../approval.js'
import { normalizeChord } from '../keys.js'

export function createKeyboardTool({ ctx, cfg, bridge }) {
  return defineTool({
    name: 'screen_keyboard',
    description: [
      'Send real keyboard input to the focused window.',
      'action "type" types arbitrary Unicode text (Chinese and emoji included) via SendInput unicode events; action "key" sends a chord such as "ctrl+shift+t" or "enter"; action "paste" sets the clipboard, sends Ctrl+V and restores the previous clipboard text.',
      'Focus the target window first (screen_windows action focus), and capture the screen afterwards to verify what was typed.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['type', 'key', 'paste'], description: 'Keyboard operation.' },
        text: { type: 'string', description: 'Text to type or paste (actions "type" and "paste").' },
        keys: { type: 'string', description: 'Key chord for action "key", e.g. "ctrl+s", "alt+f4", "enter", "f5".' },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'action'],
      properties: {
        ok: { type: 'boolean' },
        action: { type: 'string' },
        chars: { type: 'integer' },
        keys: { type: 'string' },
        note: { type: 'string' },
      },
    },
    render(_args, value) {
      if (value.action === 'key') return [text(`Sent key chord ${value.keys}.`)]
      return [text(`${value.action === 'paste' ? 'Pasted' : 'Typed'} ${value.chars ?? 0} characters into the focused window.`)]
    },
    async execute(args, exec) {
      if (args.action === 'key') {
        if (!args.keys) throw new Error('action "key" needs a non-empty keys chord')
        const keys = normalizeChord(args.keys)
        await ensureInputAllowed(ctx, cfg, exec, `send the key chord "${keys}"`)
        const result = await bridge.call('keyboard', { action: 'key', keys }, { signal: exec.signal })
        return { ok: true, action: 'key', keys: result.keys }
      }
      if (!args.text || args.text.length === 0) throw new Error(`action "${args.action}" needs non-empty text`)
      await ensureInputAllowed(ctx, cfg, exec, args.action === 'paste' ? 'paste text into the focused window' : 'type on the keyboard')
      const result = await bridge.call('keyboard', { action: args.action, text: args.text }, { signal: exec.signal })
      return { ok: true, action: args.action, chars: result.chars }
    },
  })
}
