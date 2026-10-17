/** `screen_windows`: list visible top-level windows and focus one of them. */
import { defineTool, text } from '../tool.js'
import { windowSummarySchema } from './shared.js'

export function createWindowsTool({ bridge }) {
  return defineTool({
    name: 'screen_windows',
    description: [
      'List the visible top-level windows of this desktop (title, process, pid, rectangle, minimized/foreground) or focus one of them by title substring or handle.',
      'Use it to find the application you need and to bring it to the foreground before typing. Focusing restores a minimized window.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['list', 'focus'], description: 'Operation to perform.' },
        title: { type: 'string', description: 'For list: only windows whose title contains this text. For focus: the title substring of the window to focus.' },
        hwnd: { type: 'integer', description: 'Window handle to focus instead of matching a title.' },
        limit: { type: 'integer', description: 'Maximum number of windows returned by list (default 60).' },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'action'],
      properties: {
        ok: { type: 'boolean' },
        action: { type: 'string' },
        count: { type: 'integer' },
        windows: { type: 'array', items: windowSummarySchema },
        focused: { type: 'boolean' },
        foreground: {
          type: 'object',
          additionalProperties: false,
          required: ['hwnd', 'title', 'pid'],
          properties: {
            hwnd: { type: 'integer' },
            title: { type: 'string' },
            pid: { type: 'integer' },
            process: { type: 'string' },
          },
        },
      },
    },
    render(_args, value) {
      if (value.action === 'list') {
        const rows = (value.windows ?? []).map((entry) => {
          const rect = `${entry.x ?? 0},${entry.y ?? 0} ${entry.width ?? 0}x${entry.height ?? 0}`
          const flags = [entry.foreground ? 'foreground' : null, entry.minimized ? 'minimized' : null].filter(Boolean).join(', ')
          return `- hwnd ${entry.hwnd} pid ${entry.pid} ${entry.process ?? '?'}: "${entry.title}" [${rect}]${flags ? ` (${flags})` : ''}`
        })
        return [text([`${value.count ?? rows.length} window(s):`, ...rows].join('\n'))]
      }
      const fg = value.foreground
      return [
        text(
          value.focused
            ? `Focused window "${fg?.title ?? ''}" (hwnd ${fg?.hwnd ?? '?'}, pid ${fg?.pid ?? '?'}).`
            : `Could not confirm focus; the foreground window is "${fg?.title ?? 'unknown'}".`,
        ),
      ]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const result = await bridge.call(
        'windows',
        {
          action: args.action,
          ...(args.title ? { title: args.title } : {}),
          ...(args.hwnd ? { hwnd: args.hwnd } : {}),
          ...(args.limit ? { limit: args.limit } : {}),
        },
        { signal: exec.signal },
      )
      if (args.action === 'list') {
        return { ok: true, action: 'list', count: result.count, windows: result.windows }
      }
      return {
        ok: true,
        action: 'focus',
        focused: result.focused === true,
        ...(result.foreground ? { foreground: result.foreground } : {}),
      }
    },
  })
}
