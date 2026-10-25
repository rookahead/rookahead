import type { PositionEval } from '../hooks/useAnalysis'
import type { Score } from './uci'

/**
 * Lichess's cloud evals: deep searches (often depth 40+) players already ran on lichess.org, stored per
 * position. Openings and well-known games are there; the middle of an ordinary game almost never is. No
 * token needed, but Lichess asks for one request at a time and a minute's pause after a 429.
 */
const CLOUD = 'https://lichess.org/api/cloud-eval'

/** A cloud eval worth trusting over the review's own search. */
const MIN_DEPTH = 24

interface CloudPv {
  moves: string
  cp?: number
  mate?: number
}

/** Scores in the cloud are from White's point of view, as ours are. */
const scoreOf = (pv: CloudPv): Score => (pv.mate !== undefined ? { type: 'mate', value: pv.mate } : { type: 'cp', value: pv.cp ?? 0 })

/** The cloud's eval of one position: null when it has none (or too shallow), 'stop' when Lichess can't be asked. */
export async function cloudEval(fen: string, signal: AbortSignal): Promise<PositionEval | null | 'stop'> {
  try {
    const res = await fetch(`${CLOUD}?multiPv=2&fen=${encodeURIComponent(fen)}`, { signal })
    if (res.status === 404) return null
    if (!res.ok) return 'stop'
    const data = (await res.json()) as { depth: number; pvs: CloudPv[] }
    const [top, second] = data.pvs ?? []
    if (!top || data.depth < MIN_DEPTH) return null
    const pv = top.moves.split(' ')
    return { score: scoreOf(top), bestMove: pv[0], pv, depth: data.depth, second: second && scoreOf(second), cloud: true }
  } catch {
    return 'stop'
  }
}

/**
 * The cloud's evals for the start of a game: position by position from the first, until the first one it
 * doesn't have. Past that point a game has left well-trodden ground, and the rest are left to the engine.
 * `onEach` hears of every position as it comes, for the review's progress.
 */
export async function cloudOpening(fens: string[], signal: AbortSignal, onEach?: (fen: string, entry: PositionEval) => void): Promise<Record<string, PositionEval>> {
  const found: Record<string, PositionEval> = {}
  for (const fen of fens) {
    if (signal.aborted) break
    const entry = await cloudEval(fen, signal)
    if (!entry || entry === 'stop') break
    found[fen] = entry
    onEach?.(fen, entry)
  }
  return found
}
