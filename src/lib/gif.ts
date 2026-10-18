// Encodes GIF frames in the browser (gifenc), one frame at a time so the page stays responsive.
// Loaded lazily from the Share dialog.
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import type { FrameSpec } from './frame'
import { drawFrame, prepareAssets } from './render'

export async function makeGif(frames: { spec: FrameSpec; delayMs: number }[], width: number, onProgress: (done: number, total: number) => void): Promise<Blob> {
  const classes = [...new Set(frames.flatMap((f) => [f.spec.cls, f.spec.verdict]).filter((c) => c !== undefined))]
  const assets = await prepareAssets(classes)
  const canvas = document.createElement('canvas')
  const gif = GIFEncoder()
  for (let i = 0; i < frames.length; i++) {
    drawFrame(canvas, frames[i].spec, width, assets)
    const { data, width: w, height: h } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const palette = quantize(data, 256)
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: frames[i].delayMs })
    onProgress(i + 1, frames.length)
    // Let the progress bar paint between frames.
    await new Promise((resolve) => setTimeout(resolve))
  }
  gif.finish()
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' })
}
