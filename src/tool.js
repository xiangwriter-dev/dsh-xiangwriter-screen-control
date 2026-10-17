/**
 * Tool definition helpers.
 *
 * This plugin deliberately imports nothing from `@deepseek-ai/*`: an installed
 * bundle is loaded from the profile directory, where the harness packages are
 * not resolvable as Node ESM bare specifiers. A plain ToolDefinition object is
 * all the registry needs (`name`, `description`, `parameters`, `output`,
 * `execute`), so we validate arguments locally instead of using `defineTool`.
 */

/**
 * Register-ready tool definition.
 *
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.description
 * @param {object} options.parameters  JSON Schema (object root).
 * @param {object} options.outputSchema JSON Schema for the canonical value.
 * @param {(args: unknown, value: unknown) => object[]} options.render
 * @param {(args: any, exec: any) => Promise<unknown>} options.execute
 * @param {(args: any) => boolean} [options.isConcurrencySafe]
 */
export function defineTool(options) {
  const { name, description, parameters, outputSchema, render, execute, isConcurrencySafe } = options
  if (!name || typeof name !== 'string') throw new Error('screen-control: tool name is required')
  if (!description || typeof description !== 'string') throw new Error(`screen-control: tool "${name}" needs a description`)
  if (!parameters || typeof parameters !== 'object') throw new Error(`screen-control: tool "${name}" needs parameters`)
  if (!outputSchema || typeof outputSchema !== 'object') throw new Error(`screen-control: tool "${name}" needs an output schema`)
  if (typeof render !== 'function') throw new Error(`screen-control: tool "${name}" needs a render function`)
  if (typeof execute !== 'function') throw new Error(`screen-control: tool "${name}" needs an execute function`)

  return {
    name,
    description,
    parameters,
    output: { schema: outputSchema, render },
    async execute(args, exec) {
      const violations = validate(parameters, args)
      if (violations.length > 0) throw new Error(`invalid arguments for ${name}: ${violations.join('; ')}`)
      return execute(args ?? {}, exec)
    },
    ...(isConcurrencySafe ? { isConcurrencySafe } : {}),
  }
}

/** Build one text content block. */
export function text(value) {
  return { type: 'text', text: value }
}

/**
 * Validate a value against the JSON Schema subset DSH enforces.
 * @returns {string[]} path-qualified violations
 */
export function validate(schema, value, path = 'arguments') {
  const violations = []
  walk(schema, value, path, violations)
  return violations
}

function walk(schema, value, path, violations) {
  if (!schema || typeof schema !== 'object') return

  if (Array.isArray(schema.oneOf)) {
    const matched = schema.oneOf.some((candidate) => validate(candidate, value, path).length === 0)
    if (!matched) violations.push(`${path} does not match any allowed shape`)
    return
  }

  const type = schema.type
  if (type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      violations.push(`${path} must be an object`)
      return
    }
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (value[key] === undefined) violations.push(`${path}.${key} is required`)
      }
    }
    const properties = schema.properties ?? {}
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue
      const child = properties[key]
      if (!child) {
        if (schema.additionalProperties === false) violations.push(`${path}.${key} is not an allowed property`)
        continue
      }
      walk(child, entry, `${path}.${key}`, violations)
    }
    return
  }

  if (type === 'array') {
    if (!Array.isArray(value)) {
      violations.push(`${path} must be an array`)
      return
    }
    if (schema.items) value.forEach((entry, index) => walk(schema.items, entry, `${path}[${index}]`, violations))
    return
  }

  if (type === 'string') {
    if (typeof value !== 'string') violations.push(`${path} must be a string`)
  } else if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) violations.push(`${path} must be a finite number`)
  } else if (type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value)) violations.push(`${path} must be an integer`)
  } else if (type === 'boolean') {
    if (typeof value !== 'boolean') violations.push(`${path} must be a boolean`)
  } else if (type === 'null') {
    if (value !== null) violations.push(`${path} must be null`)
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    violations.push(`${path} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(', ')}`)
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    violations.push(`${path} must be ${JSON.stringify(schema.const)}`)
  }
}

/** Shared schema fragment for an x/y point. */
export function pointSchema(description = 'Point in the chosen coordinate space.') {
  return {
    type: 'object',
    description,
    additionalProperties: false,
    required: ['x', 'y'],
    properties: {
      x: { type: 'integer', description: 'Horizontal position.' },
      y: { type: 'integer', description: 'Vertical position.' },
    },
  }
}
