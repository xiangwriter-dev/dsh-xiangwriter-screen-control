import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { apply } from '../../index.js'
import { validate } from '../../src/tool.js'
import { createMockContext } from '../helpers/mock-ctx.mjs'

// The harness enforces a JSON Schema subset; a registered schema that uses any
// other keyword fails activation. These checks keep the repo honest without
// importing the harness package (which a bundle cannot resolve).
const ALLOWED_KEYWORDS = new Set([
  'type',
  'oneOf',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'description',
  'title',
  'default',
  'examples',
])
const ALLOWED_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

function assertSchema(schema, path) {
  assert.equal(typeof schema, 'object', `${path} must be a schema object`)
  assert.ok(schema !== null, `${path} must not be null`)
  for (const key of Object.keys(schema)) {
    assert.ok(ALLOWED_KEYWORDS.has(key), `${path}: unsupported keyword "${key}"`)
  }
  if (schema.type !== undefined) assert.ok(ALLOWED_TYPES.has(schema.type), `${path}: unsupported type "${schema.type}"`)
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      assert.ok(schema.properties && Object.hasOwn(schema.properties, key), `${path}.required names unknown property "${key}"`)
    }
  }
  if (schema.properties) {
    for (const [key, child] of Object.entries(schema.properties)) assertSchema(child, `${path}.properties.${key}`)
  }
  if (schema.items) assertSchema(schema.items, `${path}.items`)
  if (Array.isArray(schema.oneOf)) {
    assert.ok(schema.oneOf.length >= 2, `${path}.oneOf needs at least two variants`)
    schema.oneOf.forEach((child, index) => assertSchema(child, `${path}.oneOf[${index}]`))
  }
}

describe('tool schemas', () => {
  const harness = createMockContext()
  apply(harness.ctx, { inputPolicy: 'deny' })

  it('registers six uniquely named tools', () => {
    assert.equal(harness.tools.size, 6)
  })

  it('uses only the supported JSON Schema subset', () => {
    for (const tool of harness.tools.values()) {
      assert.ok(tool.description.length > 40, `${tool.name} needs a useful description`)
      assertSchema(tool.parameters, `${tool.name}.parameters`)
      assertSchema(tool.output.schema, `${tool.name}.output`)
      assert.equal(tool.parameters.type, 'object')
    }
  })

  it('publishes the expected tool names', () => {
    assert.deepEqual([...harness.tools.keys()].sort(), [
      'screen_capture',
      'screen_keyboard',
      'screen_pointer',
      'screen_ui',
      'screen_wait',
      'screen_windows',
    ])
  })

  it('validates arguments before executing', async () => {
    const pointer = harness.tools.get('screen_pointer')
    await assert.rejects(() => pointer.execute({ action: 'click' }, { signal: new AbortController().signal }), /x is required/)
    await assert.rejects(
      () => pointer.execute({ action: 'teleport', x: 1, y: 1 }, { signal: new AbortController().signal }),
      /must be one of/,
    )
    await assert.rejects(
      () => pointer.execute({ action: 'move', x: 1, y: 1, surprise: true }, { signal: new AbortController().signal }),
      /not an allowed property/,
    )
  })
})

describe('argument validation', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'count'],
    properties: {
      action: { type: 'string', enum: ['a', 'b'] },
      count: { type: 'integer' },
      flag: { type: 'boolean' },
      nested: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' } },
      },
    },
  }

  it('accepts a valid value', () => {
    assert.deepEqual(validate(schema, { action: 'a', count: 2, flag: true, nested: { name: 'x' } }), [])
  })

  it('reports required, type, enum and unknown properties', () => {
    assert.deepEqual(validate(schema, {}), ['arguments.action is required', 'arguments.count is required'])
    assert.deepEqual(validate(schema, { action: 'a', count: 1.5 }), ['arguments.count must be an integer'])
    assert.deepEqual(validate(schema, { action: 'c', count: 1 }), ['arguments.action must be one of "a", "b"'])
    assert.deepEqual(validate(schema, { action: 'a', count: 1, extra: 1 }), ['arguments.extra is not an allowed property'])
  })

  it('validates array items', () => {
    const arraySchema = { type: 'array', items: { type: 'string' } }
    assert.deepEqual(validate(arraySchema, ['a', 'b'], 'list'), [])
    assert.deepEqual(validate(arraySchema, ['a', 2], 'list'), ['list[1] must be a string'])
  })
})
