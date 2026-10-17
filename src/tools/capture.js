/** `screen_capture`: screenshot the desktop, one window, or a region. */
import { defineTool, text } from '../tool.js'
import { attachScreenshot } from '../images.js'
import { imageRefSchema, pointSchema, rectSchema } from './shared.js'
import { rememberCapture, sessionKey } from '../session.js'

export function createCaptureTool({ ctx, cfg, bridge }) {
  return defineTool({
    name: 'screen_capture',
    description: [
      'Capture the current screen as an image. Defaults to the whole virtual desktop; pass `window` (title substring) to capture one window even if it is covered, or `region` for a rectangle.',
      'Returns the saved PNG/JPEG path plus the screen rectangle and image scale. Image-capable models also receive the picture itself; text-only models get the path and metadata.',
      'Capture before acting and again afterwards to verify the result.',
    ].join(' '),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        region: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y', 'width', 'height'],
          properties: {
            x: { type: 'integer', description: 'Left edge in screen pixels (may be negative on a left-hand monitor).' },
            y: { type: 'integer', description: 'Top edge in screen pixels.' },
            width: { type: 'integer', description: 'Region width in screen pixels.' },
            height: { type: 'integer', description: 'Region height in screen pixels.' },
          },
          description: 'Capture only this screen rectangle.',
        },
        window: { type: 'string', description: 'Capture the first visible window whose title contains this text (case-insensitive).' },
        hwnd: { type: 'integer', description: 'Capture this window handle instead of a title match.' },
        max_width: { type: 'integer', description: 'Downscale the image so it is at most this wide (default from plugin config, 1600).' },
        format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format (default png).' },
        include_cursor: { type: 'boolean', description: 'Draw a small crosshair at the current cursor position.' },
      },
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'path', 'mediaType', 'width', 'height', 'source', 'scale'],
      properties: {
        ok: { type: 'boolean' },
        path: { type: 'string' },
        mediaType: { type: 'string' },
        width: { type: 'integer' },
        height: { type: 'integer' },
        source: rectSchema,
        scale: { type: 'number' },
        cursor: pointSchema,
        image: imageRefSchema,
        note: { type: 'string' },
      },
    },
    render(args, value) {
      const lines = [
        `Captured ${value.width}x${value.height} image (screen ${value.source.width}x${value.source.height} at ${value.source.x},${value.source.y}; scale ${value.scale}).`,
        `Saved to ${value.path}.`,
      ]
      if (value.cursor) lines.push(`Cursor is at ${value.cursor.x},${value.cursor.y}.`)
      if (value.note) lines.push(value.note)
      const blocks = [text(lines.join('\n'))]
      if (value.image) blocks.push({ type: 'image', attachment: value.image })
      return blocks
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const shot = await bridge.call(
        'capture',
        {
          ...(args.region ? { region: args.region } : {}),
          ...(args.window ? { window: args.window } : {}),
          ...(args.hwnd ? { hwnd: args.hwnd } : {}),
          max_width: args.max_width ?? cfg.capture.maxWidth,
          format: args.format ?? cfg.capture.format,
          quality: cfg.capture.quality,
          include_cursor: args.include_cursor === true,
        },
        { signal: exec.signal },
      )

      const key = sessionKey(exec)
      rememberCapture(key, {
        origin: { x: shot.source.x, y: shot.source.y },
        scale: shot.scale,
        width: shot.width,
        height: shot.height,
        path: shot.path,
      })

      const image = await attachScreenshot(ctx, exec, shot)
      return {
        ok: true,
        path: shot.path,
        mediaType: shot.mediaType,
        width: shot.width,
        height: shot.height,
        source: shot.source,
        scale: shot.scale,
        cursor: shot.cursor,
        ...(image ? { image } : { note: 'The image block was not attached (text-only model route or attachment limits); inspect the file path if the model supports reading images.' }),
      }
    },
  })
}
