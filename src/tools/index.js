/** Registers the six screen-control tools on the plugin context. */
import { createCaptureTool } from './capture.js'
import { createPointerTool } from './pointer.js'
import { createKeyboardTool } from './keyboard.js'
import { createWindowsTool } from './windows.js'
import { createUiTool } from './ui.js'
import { createWaitTool } from './wait.js'

export function registerTools(ctx, cfg, bridge) {
  const definitions = [
    createCaptureTool({ ctx, cfg, bridge }),
    createPointerTool({ ctx, cfg, bridge }),
    createKeyboardTool({ ctx, cfg, bridge }),
    createWindowsTool({ ctx, cfg, bridge }),
    createUiTool({ ctx, cfg, bridge }),
    createWaitTool({ ctx, cfg, bridge }),
  ]
  for (const definition of definitions) {
    ctx.effect(() => ctx.tools.register(definition))
  }
  return definitions
}
