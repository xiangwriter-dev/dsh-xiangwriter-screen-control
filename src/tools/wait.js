/** `screen_wait`: sleep, or wait for a window to appear. */
import { defineTool, text } from '../tool.js'
import { windowSummarySchema } from './shared.js'

export function createWaitTool({ bridge }) {
  return defineTool({
    name: 'screen_wait',
    description: [
      'Wait without hammering the screen: `for: "ms"` sleeps the given number of milliseconds; `for: "window"` polls until a visible window title matches the given regular expression, then reports the window.',
      'Use it after launching an application or triggering an action that opens a window, instead of capturing in a busy loop.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['for'],
      properties: {
        for: { type: 'string', enum: ['ms', 'window'], description: 'What to wait for.' },
        ms: { type: 'integer', description: 'Milliseconds to sleep for `for: "ms"` (default 500).' },
        title: { type: 'string', description: 'Regular expression matched against window titles for `for: "window"`.' },
        timeout_ms: { type: 'integer', description: 'Overall timeout in milliseconds (default 5000).' },
        poll_ms: { type: 'integer', description: 'Poll interval in milliseconds for `for: "window"` (default 250).' },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'for', 'matched', 'waitedMs'],
      properties: {
        ok: { type: 'boolean' },
        for: { type: 'string' },
        matched: { type: 'boolean' },
        waitedMs: { type: 'number' },
        window: windowSummarySchema,
      },
    },
    render(_args, value) {
      if (value.for === 'ms') return [text(`Waited ${Math.round(value.waitedMs)} ms.`)]
      return [
        text(
          value.matched
            ? `Window "${value.window?.title ?? ''}" appeared after ${Math.round(value.waitedMs)} ms (hwnd ${value.window?.hwnd ?? '?'}).`
            : `No matching window appeared within ${Math.round(value.waitedMs)} ms.`,
        ),
      ]
    },
    async execute(args, exec) {
      if (args.for === 'window' && !args.title) throw new Error('wait for "window" needs a title pattern')
      const result = await bridge.call(
        'wait',
        {
          for: args.for,
          ...(args.ms ? { ms: args.ms } : {}),
          ...(args.title ? { title: args.title } : {}),
          ...(args.timeout_ms ? { timeout_ms: args.timeout_ms } : {}),
          ...(args.poll_ms ? { poll_ms: args.poll_ms } : {}),
        },
        { signal: exec.signal },
      )
      return {
        ok: true,
        for: result.for,
        matched: result.matched === true,
        waitedMs: result.waitedMs,
        ...(result.window ? { window: result.window } : {}),
      }
    },
  })
}
