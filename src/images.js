/**
 * Screenshot delivery.
 *
 * A capture is always saved to a file, which is useful even for text-only
 * routes. When the current model route declares image input and the attachment
 * service accepts the bytes, the capture is also committed as a durable image
 * attachment and rendered as a real image block.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

/** Whether the currently routed model accepts image input. */
export async function routeSupportsImage(ctx, exec) {
  const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
  if (!llm || typeof llm.resolveModelInfo !== 'function') return false
  const agent = exec?.agent
  let routed
  try {
    routed = agent?.session?.requestHeader?.()?.config
  } catch {
    routed = undefined
  }
  const provider = routed?.provider ?? agent?.options?.provider
  const model = routed?.model ?? agent?.options?.model
  if (!provider || !model) return false
  try {
    const info = await llm.resolveModelInfo(provider, model, exec.signal)
    return Array.isArray(info?.inputModalities) && info.inputModalities.includes('image')
  } catch {
    return false
  }
}

/**
 * Commit a capture as an image attachment.
 * @returns {Promise<{attachmentId: string, mediaType: string, bytes: number, width: number, height: number, name?: string} | null>}
 */
export async function attachScreenshot(ctx, exec, shot) {
  const attachments = typeof ctx.get === 'function' ? ctx.get('attachments') : undefined
  if (!attachments || typeof attachments.saveImage !== 'function') return null
  if (!(await routeSupportsImage(ctx, exec))) return null

  const limits = attachments.imageLimits
  if (limits?.mediaTypes && !limits.mediaTypes.includes(shot.mediaType)) return null
  if (limits?.maxImageBytes && typeof shot.bytes === 'number' && shot.bytes > limits.maxImageBytes) return null
  if (limits?.maxImagePixels && shot.width * shot.height > limits.maxImagePixels) return null

  let data
  try {
    data = await readFile(shot.path)
  } catch {
    return null
  }
  if (limits?.maxImageBytes && data.byteLength > limits.maxImageBytes) return null

  try {
    const reference = await attachments.saveImage({
      data,
      mediaType: shot.mediaType,
      name: basename(shot.path),
    })
    if (!reference) return null
    return {
      attachmentId: String(reference.attachmentId),
      mediaType: reference.mediaType,
      bytes: reference.bytes,
      width: reference.width,
      height: reference.height,
      ...(reference.name ? { name: reference.name } : {}),
    }
  } catch (error) {
    const logger = ctx?.logger
    if (typeof logger?.warn === 'function') logger.warn(`screen-control: could not attach screenshot: ${error.message}`)
    return null
  }
}
