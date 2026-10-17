/** `screen_ui`: read the UI Automation tree of a window as text. */
import { defineTool, text } from '../tool.js'

const MAX_LINES = 400

export function createUiTool({ bridge }) {
  return defineTool({
    name: 'screen_ui',
    description: [
      'Read the UI Automation tree of a window (default: the foreground window) as indented text: control type, name, automation id, rectangle, enabled/offscreen state and, with include_value, the current value of value controls.',
      'Prefer this over guessing pixels: the rectangles give exact screen coordinates for screen_pointer. It also gives text-only models something to read. Large trees are truncated by max_nodes.',
      'Some applications expose no automation tree, and elevated windows may refuse inspection.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        window: { type: 'string', description: 'Title substring of the window to inspect (default: foreground window).' },
        hwnd: { type: 'integer', description: 'Window handle to inspect instead of a title match.' },
        depth: { type: 'integer', description: 'Maximum tree depth to return (default 3).' },
        max_nodes: { type: 'integer', description: 'Maximum number of elements to walk (default 300).' },
        include_value: { type: 'boolean', description: 'Read the current value of value patterns (text fields, sliders).' },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'window', 'nodeCount', 'tree'],
      properties: {
        ok: { type: 'boolean' },
        window: {
          type: 'object',
          additionalProperties: false,
          required: ['hwnd', 'title'],
          properties: {
            hwnd: { type: 'integer' },
            title: { type: 'string' },
            process: { type: 'string' },
          },
        },
        nodeCount: { type: 'integer' },
        maxNodes: { type: 'integer' },
        tree: { type: 'object' },
      },
    },
    render(_args, value) {
      const lines = []
      formatNode(value.tree, 0, lines)
      const header = `UI Automation tree of "${value.window.title}" (hwnd ${value.window.hwnd}): ${value.nodeCount} element(s).`
      if (lines.length > MAX_LINES) {
        const shown = lines.slice(0, MAX_LINES)
        shown.push(`... ${lines.length - MAX_LINES} more lines truncated`)
        return [text([header, ...shown].join('\n'))]
      }
      return [text([header, ...lines].join('\n'))]
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const result = await bridge.call(
        'ui',
        {
          ...(args.window ? { window: args.window } : {}),
          ...(args.hwnd ? { hwnd: args.hwnd } : {}),
          ...(args.depth ? { depth: args.depth } : {}),
          ...(args.max_nodes ? { max_nodes: args.max_nodes } : {}),
          include_value: args.include_value === true,
        },
        { signal: exec.signal },
      )
      return {
        ok: true,
        window: result.window,
        nodeCount: result.nodeCount,
        maxNodes: result.maxNodes,
        tree: result.tree ?? {},
      }
    },
  })
}

function formatNode(node, depth, lines) {
  if (!node || typeof node !== 'object') return
  const indent = '  '.repeat(Math.min(depth, 12))
  const parts = [`${indent}- ${node.type || 'Node'}`]
  if (node.name) parts.push(JSON.stringify(node.name))
  if (node.automationId) parts.push(`#${node.automationId}`)
  if (node.value !== undefined) parts.push(`= ${JSON.stringify(node.value)}`)
  if (node.enabled === false) parts.push('(disabled)')
  if (node.offscreen === true) parts.push('(offscreen)')
  if (node.rect) parts.push(`@${node.rect.x},${node.rect.y} ${node.rect.width}x${node.rect.height}`)
  lines.push(parts.join(' '))
  const children = Array.isArray(node.children) ? node.children : []
  for (const child of children) formatNode(child, depth + 1, lines)
}
