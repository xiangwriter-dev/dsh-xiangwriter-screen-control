/** `screen_pointer`: move, click, drag and scroll the real mouse. */
import { defineTool, text } from '../tool.js'
import { ensureInputAllowed } from '../approval.js'
import { imageToScreen } from '../geometry.js'
import { lastCapture, sessionKey } from '../session.js'
import { pointSchema } from './shared.js'

const ACTIONS = ['move', 'click', 'double_click', 'right_click', 'middle_click', 'drag', 'scroll']

export function createPointerTool({ ctx, cfg, bridge }) {
  return defineTool({
    name: 'screen_pointer',
    description: [
      'Move, click, drag or scroll the real mouse on this Windows desktop.',
      'Coordinates are physical screen pixels by default; pass coordinate_space: "image" to use pixels from the most recent screen_capture image instead, and the plugin converts them.',
      'Clicking first moves the pointer to (x, y). After the action the result reports the actual cursor position — compare it with what you intended and capture the screen to verify the UI changed.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'x', 'y'],
      properties: {
        action: { type: 'string', enum: ACTIONS, description: 'Pointer action to perform.' },
        x: { type: 'integer', description: 'Target horizontal position.' },
        y: { type: 'integer', description: 'Target vertical position.' },
        to_x: { type: 'integer', description: 'Drag end horizontal position (drag only).' },
        to_y: { type: 'integer', description: 'Drag end vertical position (drag only).' },
        duration_ms: { type: 'integer', description: 'Drag duration in milliseconds (default 350).' },
        amount: { type: 'integer', description: 'Scroll delta in wheel units (120 per notch; negative scrolls down).' },
        horizontal: { type: 'boolean', description: 'Scroll horizontally instead of vertically.' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button for click/drag (default left).' },
        coordinate_space: { type: 'string', enum: ['screen', 'image'], description: 'Interpret x/y (and to_x/to_y) as screen pixels or as pixels of the last capture image.' },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'action', 'cursor'],
      properties: {
        ok: { type: 'boolean' },
        action: { type: 'string' },
        cursor: pointSchema,
        target: pointSchema,
        coordinate_space: { type: 'string' },
        note: { type: 'string' },
      },
    },
    render(_args, value) {
      const target = value.target ? ` at ${value.target.x},${value.target.y}` : ''
      return [
        text(
          [
            `Performed ${value.action}${target}.`,
            `Cursor is now at ${value.cursor.x},${value.cursor.y}.`,
            'Capture the screen to verify the UI actually changed.',
          ].join(' '),
        ),
      ]
    },
    async execute(args, exec) {
      const key = sessionKey(exec)
      const space = args.coordinate_space ?? 'screen'
      const toPoint = (x, y) => {
        if (space === 'screen') return { x, y }
        const geometry = lastCapture(key)
        if (!geometry) throw new Error('coordinate_space "image" needs a previous screen_capture in this session')
        return imageToScreen({ x, y }, geometry)
      }

      const point = toPoint(args.x, args.y)
      const label = {
        move: 'move the mouse pointer',
        click: 'click on this desktop',
        double_click: 'double-click on this desktop',
        right_click: 'right-click on this desktop',
        middle_click: 'middle-click on this desktop',
        drag: 'drag on this desktop',
        scroll: 'scroll this desktop',
      }[args.action]
      await ensureInputAllowed(ctx, cfg, exec, label)

      let engineArgs
      if (args.action === 'drag') {
        if (typeof args.to_x !== 'number' || typeof args.to_y !== 'number') {
          throw new Error('drag requires to_x and to_y')
        }
        const end = toPoint(args.to_x, args.to_y)
        engineArgs = {
          action: 'drag',
          x: point.x,
          y: point.y,
          to_x: end.x,
          to_y: end.y,
          duration_ms: args.duration_ms ?? 350,
          button: args.button ?? 'left',
        }
      } else if (args.action === 'scroll') {
        engineArgs = {
          action: 'scroll',
          x: point.x,
          y: point.y,
          amount: args.amount ?? 120,
          horizontal: args.horizontal === true,
        }
      } else if (args.action === 'move') {
        engineArgs = { action: 'move', x: point.x, y: point.y }
      } else {
        const button = args.action === 'right_click' ? 'right' : args.action === 'middle_click' ? 'middle' : (args.button ?? 'left')
        const count = args.action === 'double_click' ? 2 : 1
        engineArgs = { action: 'click', x: point.x, y: point.y, button, count }
      }

      const result = await bridge.call('pointer', engineArgs, { signal: exec.signal })
      return {
        ok: true,
        action: args.action,
        cursor: result.cursor,
        target: point,
        coordinate_space: space,
      }
    },
  })
}
