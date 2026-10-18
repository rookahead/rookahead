// Which positions an animated GIF shows, and for how long.
export type GifSpeed = 'slow' | 'normal' | 'fast'
export type GifRange = 'game' | 'last10'

export interface GifFrame {
  /** Index into the main line (0 = start position). */
  nodeIndex: number
  delayMs: number
  /** Show the move's classification badge. */
  badge: boolean
}

export const GIF_DELAYS: Record<GifSpeed, number> = { slow: 1600, normal: 1000, fast: 500 }
const FINAL_HOLD_MS = 3000
const LAST_MOVES = 10

/** `endIndex` is the shared move: "last 10" ends there, "game" ignores it. */
export function planGif(lineLength: number, opts: { speed: GifSpeed; range: GifRange; endIndex: number; badged: boolean[] }): GifFrame[] {
  const end = opts.range === 'game' ? lineLength - 1 : Math.min(opts.endIndex, lineLength - 1)
  const start = opts.range === 'game' ? 0 : Math.max(0, end - LAST_MOVES)
  const frames: GifFrame[] = []
  for (let i = start; i <= end; i++) {
    frames.push({ nodeIndex: i, delayMs: i === end ? FINAL_HOLD_MS : GIF_DELAYS[opts.speed], badge: Boolean(opts.badged[i]) })
  }
  return frames
}
