/** JSON Schema fragments shared by the screen tools (DSH-supported subset only). */

export const imageRefSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
  properties: {
    attachmentId: { type: 'string' },
    mediaType: { type: 'string' },
    bytes: { type: 'integer' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    name: { type: 'string' },
  },
}

export const rectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'width', 'height'],
  properties: {
    x: { type: 'integer' },
    y: { type: 'integer' },
    width: { type: 'integer' },
    height: { type: 'integer' },
  },
}

export const pointSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y'],
  properties: {
    x: { type: 'integer' },
    y: { type: 'integer' },
  },
}

export const windowSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['hwnd', 'title', 'pid'],
  properties: {
    hwnd: { type: 'integer' },
    title: { type: 'string' },
    pid: { type: 'integer' },
    process: { type: 'string' },
    x: { type: 'integer' },
    y: { type: 'integer' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    minimized: { type: 'boolean' },
    foreground: { type: 'boolean' },
  },
}
