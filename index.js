/**
 * dsh-xiangwriter-screen-control — Windows screen control for DeepSeek Harness.
 *
 * Registers screen_capture / screen_pointer / screen_keyboard / screen_windows /
 * screen_ui / screen_wait on top of a long-lived Windows PowerShell engine.
 *
 * @module dsh-xiangwriter-screen-control
 */
import { ScreenBridge } from './src/bridge.js'
import { normalizeConfig } from './src/config.js'
import { SCREEN_CONTROL_PROMPT } from './src/system-prompt.js'
import { registerTools } from './src/tools/index.js'

export const name = 'dsh-xiangwriter-screen-control'
export const inject = ['tools']

/**
 * Plugin entry point.
 * @param {object} ctx Cordis plugin context.
 * @param {object} [config] row configuration from cordis.patch.yml.
 */
export function apply(ctx, config) {
  const cfg = normalizeConfig(config)
  const bridge = new ScreenBridge(cfg, ctx)

  ctx.effect(() => () => {
    bridge.dispose()
  })

  const definitions = registerTools(ctx, cfg, bridge)

  const systemPrompt = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined
  if (systemPrompt && typeof systemPrompt.section === 'function') {
    ctx.effect(() =>
      systemPrompt.section({
        name: 'tool:screen-control',
        order: 106,
        text: SCREEN_CONTROL_PROMPT,
      }),
    )
  }

  const logger = ctx.logger
  if (typeof logger?.info === 'function') {
    logger.info(`dsh-xiangwriter-screen-control: registered ${definitions.length} tools (inputPolicy: ${cfg.inputPolicy})`)
  }
}
