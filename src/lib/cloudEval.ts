import { Chess, type Square } from 'chess.js'
import type { PositionEval } from '../hooks/useAnalysis'
import { uciToMove } from './tree'
import type { Score } from './uci'

/**
 * Lichess's cloud evals: deep searches (often depth 40+) players already ran on lichess.org, stored per
 * position. Openings and well-known games are there; the middle of an ordinary game almost never is. No
 * token needed, but Lichess asks for one request at a time and a minute's pause after a 429.
 */
const CLOUD = 'https://lichess.org/api/cloud-eval'

/** A cloud eval worth trusting over the review's own search. */
const MIN_DEPTH = 24

/** After Lichess says "too many requests", reviews leave the cloud alone this long (Lichess asks for a minute). */
const BACK_OFF_MS = 5 * 60_000

let pausedUntil = 0

interface CloudPv {
  moves: string
  cp?: number
  mate?: number
}

/** Scores in the cloud are from White's point of view, as ours are. */
const scoreOf = (pv: CloudPv): Score => (pv.mate !== undefined ? { type: 'mate', value: pv.mate } : { type: 'cp', value: pv.cp ?? 0 })

/** Lichess writes castling as the king taking its own rook; the engine, and everything here, as the king's move. */
const CASTLING: Record<string, string> = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' }

/**
 * Lichess's moves (UCI, space-separated) as the board writes them: castling as the king's two-square move, and only
 * for a king (a queen going e8 to h8 is just that). Stops at a move that doesn't fit the position.
 */
export function standardMoves(fen: string, moves: string): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const uci of moves.split(' ')) {
    const kingMoves = chess.get(uci.slice(0, 2) as Square)?.type === 'k'
    const move = (kingMoves && CASTLING[uci]) || uci
    try {
      chess.move(uciToMove(move))
    } catch {
      break
    }
    out.push(move)
  }
  return out
}

/** The cloud's eval of one position: null when it has none (or too shallow), 'stop' when Lichess can't be asked. */
export async function cloudEval(fen: string, signal: AbortSignal): Promise<PositionEval | null | 'stop'> {
  if (Date.now() < pausedUntil) return 'stop'
  try {
    const res = await fetch(`${CLOUD}?multiPv=2&fen=${encodeURIComponent(fen)}`, { signal })
    if (res.status === 404) return null
    if (res.status === 429) pausedUntil = Date.now() + BACK_OFF_MS
    if (!res.ok) return 'stop'
    const data = (await res.json()) as { depth: number; pvs: CloudPv[] }
    const [top, second] = data.pvs ?? []
    if (!top || data.depth < MIN_DEPTH) return null
    const pv = standardMoves(fen, top.moves)
    return { score: scoreOf(top), bestMove: pv[0], pv, depth: data.depth, second: second && scoreOf(second), secondMove: second && standardMoves(fen, second.moves)[0], cloud: true }
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
