// Your mistakes as puzzles of more than one move: a missed mate is played out to the mate, a missed tactic to the
// piece it wins, and anything else over LINE_MOVES of your moves, each one good enough. The replies are the engine's best.
import { Chess, type PieceSymbol } from 'chess.js'
import { winPercent, type Color } from './evaluation'
import { nullMoveFen } from './explain'
import type { Score } from './uci'

/** 'line': a few good moves in a row, any good move counting; 'single': one move (only when the engine had nothing). */
export type LineKind = 'mate' | 'tactic' | 'line' | 'single'

export interface LinePlan {
  kind: LineKind
  /** From the mistake's position: your moves and the replies (the engine's line). One move for 'single'. */
  moves: string[]
  /** 'mate': your moves to the mate. */
  mateIn?: number
  /** 'tactic': what the line wins, said as the goal ("the queen", "a knight", "material"). */
  wins?: string
  /** The best line's score, White POV. */
  score: Score
  /** For saying why it was a mistake (Explain): the best line after the move you played, and what the other side was threatening. */
  why?: { best: string[]; reply: { pv: string[]; score: Score }; threat: { pv: string[]; score: Score } | null }
}

/** The longest missed mate played out (your moves). */
export const MAX_MATE = 8
/** A tactic is played out over at most this many of your moves, to the piece it wins. */
export const MAX_TACTIC = 3
/**
 * A 'line' puzzle runs at least LINE_MOVES of your moves, then on while your next move is the only good one (as
 * Lichess makes its puzzles), up to MAX_LINE.
 */
export const LINE_MOVES = 2
export const MAX_LINE = 8
/** The best move is the only good one when the next best is this far behind, in your win chance (0–100). */
const ONLY_GAP = 10
/** What a tactic must win, in pawns, and keep. */
const MIN_GAIN = 2

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

const toMove = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })

/** Mate for `color` in this many of its moves, if the score says so. */
export function mateFor(score: Score, color: Color): number | null {
  if (score.type !== 'mate' || score.value === 0) return null
  return score.value > 0 === (color === 'white') ? Math.abs(score.value) : null
}

/** Your material lead over the start after each ply of a line (index 0 = after the first move); stops at an illegal move. */
function balances(fen: string, color: Color, pv: string[]): { balance: number[]; taken: PieceSymbol[][] } {
  const chess = new Chess(fen)
  const balance: number[] = []
  const taken: PieceSymbol[][] = []
  let lead = 0
  let mine: PieceSymbol[] = []
  for (const uci of pv) {
    let move
    try {
      move = chess.move(toMove(uci))
    } catch {
      break
    }
    const yours = (move.color === 'w') === (color === 'white')
    const worth = (move.captured ? VALUES[move.captured] : 0) + (move.promotion ? VALUES[move.promotion] - 1 : 0)
    lead += yours ? worth : -worth
    if (yours && move.captured) mine = [...mine, move.captured]
    balance.push(lead)
    taken.push(mine)
  }
  return { balance, taken }
}

/** "the queen", "a rook", or "material" when no one piece is won outright. */
function winsWords(taken: PieceSymbol[], gain: number): string {
  const top = [...taken].sort((a, b) => VALUES[b] - VALUES[a])[0]
  if (!top || gain < VALUES[top]) return gain >= 2 && taken.includes('r') ? 'the exchange' : 'material'
  return top === 'q' ? 'the queen' : `a ${NAMES[top]}`
}

/**
 * Where a tactic ends: the first of your moves (an even index of `pv`) after which you're `MIN_GAIN` up on the start
 * and stay so for the next three plies of the line. -1 when there's none within `MAX_TACTIC` of your moves.
 */
export function tacticEnd(fen: string, color: Color, pv: string[]): { end: number; gain: number; taken: PieceSymbol[] } {
  const { balance, taken } = balances(fen, color, pv)
  for (let i = 0; i < Math.min(balance.length, MAX_TACTIC * 2); i += 2) {
    const after = balance.slice(i, i + 4)
    const gain = Math.min(...after)
    if (gain >= MIN_GAIN) return { end: i, gain, taken: taken[Math.min(i + 3, taken.length - 1)] }
  }
  return { end: -1, gain: 0, taken: [] }
}

/**
 * The puzzle a mistake makes, from the engine's best line at its position (`best`: White-POV score and PV;
 * `fallback`: the review's best move when the engine has nothing).
 */
export function planFrom(fen: string, color: Color, best: { score: Score; pv: string[] } | null, fallback: string, fallbackScore: Score): LinePlan {
  if (!best?.pv.length) return { kind: 'single', moves: [fallback], score: fallbackScore }
  const mate = mateFor(best.score, color)
  if (mate && mate <= MAX_MATE) return { kind: 'mate', moves: best.pv.slice(0, 2 * mate - 1), mateIn: mate, score: best.score }
  const { end, gain, taken } = tacticEnd(fen, color, best.pv)
  // Won on the first move: that's no line to play out, so it's a few good moves like any other.
  if (end > 0) return { kind: 'tactic', moves: best.pv.slice(0, end + 1), wins: winsWords(taken, gain), score: best.score }
  return { kind: 'line', moves: best.pv, score: best.score }
}

/** Whether the side to move has one good move only (or one legal move): the puzzle goes on. */
export function onlyMove(best: Score, second: Score | undefined, color: Color): boolean {
  if (!second) return true
  const win = (s: Score) => (color === 'white' ? winPercent(s) : 100 - winPercent(s))
  return win(best) - win(second) >= ONLY_GAP
}

/**
 * A forcing move keeps a line going even when it isn't the only good one: a check, a capture, a promotion, or a pawn
 * pushing to its sixth or seventh rank. Those are the moves that carry a win through to where it's plain.
 */
export function forcing(fen: string, uci: string): boolean {
  try {
    const move = new Chess(fen).move(toMove(uci))
    if (move.captured || move.promotion || /[+#]/.test(move.san)) return true
    const rank = Number(move.to[1])
    return move.piece === 'p' && (move.color === 'w' ? rank >= 6 : rank <= 3)
  } catch {
    return false
  }
}

/** The goal, said before you move. */
export function lineGoal(plan: LinePlan, playedSan: string): string {
  if (plan.kind === 'mate') return plan.mateIn === 1 ? 'You missed a mate in one. Find it.' : `You missed a mate in ${plan.mateIn}. Find it.`
  if (plan.kind === 'tactic') return `You missed a way to win ${plan.wins}. Find it.`
  return `Find a better move than ${playedSan}.`
}

/** "1. Qxf7+ Kxf7 2. Ng5+": a line in numbered SAN from a position. */
export function lineSan(fen: string, moves: string[]): string {
  const chess = new Chess(fen)
  const parts: string[] = []
  for (const uci of moves) {
    const n = chess.moveNumber()
    const white = chess.turn() === 'w'
    let san: string
    try {
      san = chess.move(toMove(uci)).san
    } catch {
      break
    }
    if (white) parts.push(`${n}. ${san}`)
    else parts.push(parts.length ? san : `${n}… ${san}`)
  }
  return parts.join(' ')
}

const CACHE_KEY = 'rookahead.mistakeLines.v4'
const CACHE_SIZE = 300

/** Plans already worked out, by mistake id (on this device only: the engine can always make them again). */
function readCache(): Record<string, LinePlan> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, LinePlan>) : {}
  } catch {
    return {}
  }
}

export const cachedPlan = (id: string): LinePlan | undefined => readCache()[id]

function savePlan(id: string, plan: LinePlan) {
  try {
    const all = { ...readCache(), [id]: plan }
    const ids = Object.keys(all)
    for (const old of ids.slice(0, Math.max(0, ids.length - CACHE_SIZE))) delete all[old]
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    // Storage full or blocked: worked out again next time.
  }
}

/** Searches a line's position (White-POV score and PV), or null when the search was dropped. */
export type LineSearch = (
  fen: string,
  opts: { depth: number; movetime?: number; fresh?: boolean; multiPv?: number; signal?: AbortSignal },
) => Promise<{ score: Score; pv: string[]; depth: number; second?: Score } | null>

/** Deep enough to trust a plan with (and keep it); a search stopped sooner is used once, not saved. */
const TRUSTED_DEPTH = 14

/** The puzzle for a mistake: from the cache, or from a search of its position. */
export async function planMistake(
  m: { id: string; fen: string; color: Color; played: string; best: string; bestScore: Score; playedScore: Score },
  search: LineSearch,
  signal?: AbortSignal,
): Promise<LinePlan | null> {
  const saved = cachedPlan(m.id)
  if (saved) return saved
  const found = await search(m.fen, { depth: 22, movetime: 2500, signal })
  if (signal?.aborted) return null
  // Why it was a mistake: what the move let the other side do, and what they were threatening before it.
  const after = new Chess(m.fen)
  after.move(toMove(m.played))
  const reply = after.isGameOver() ? null : await search(after.fen(), { depth: 18, fresh: true, signal })
  if (signal?.aborted) return null
  const nullFen = nullMoveFen(m.fen)
  const threat = nullFen ? await search(nullFen, { depth: 16, fresh: true, signal }) : null
  if (signal?.aborted) return null
  const plan: LinePlan = {
    ...planFrom(m.fen, m.color, found, m.best, m.bestScore),
    why: { best: found?.pv ?? [m.best], reply: { pv: reply?.pv ?? [], score: reply?.score ?? m.playedScore }, threat: threat ? { pv: threat.pv, score: threat.score } : null },
  }
  if (found && found.depth >= TRUSTED_DEPTH) savePlan(m.id, plan)
  return plan
}
