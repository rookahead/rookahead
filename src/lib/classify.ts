import { Chess, type Square } from 'chess.js'
import { winPercent, type Color } from './evaluation'
import type { MoveNode } from './tree'
import type { Score } from './uci'

// Move classification and accuracy, computed from a finished game review.
//
// Everything is measured in *expected points* for the side that moved: the
// win chance (0–1) from the same logistic curve the eval bar uses. A move's
// "loss" is how much expected points it gave up compared with the engine's
// best move. The loss bands follow the thresholds Chess.com has published;
// book / great / brilliant / miss are our own heuristics on top.

export type MoveClass =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'
  | 'forced'

/** Display order, best first (used for the summary table). */
export const CLASS_ORDER: MoveClass[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']

export const CLASS_INFO: Record<MoveClass, { label: string; color: string }> = {
  brilliant: { label: 'Brilliant', color: '#22c3a6' },
  great: { label: 'Great', color: '#5a8fd0' },
  best: { label: 'Best', color: '#7fbf5f' },
  excellent: { label: 'Excellent', color: '#93c06a' },
  good: { label: 'Good', color: '#8fab8a' },
  book: { label: 'Book', color: '#b08d6a' },
  inaccuracy: { label: 'Inaccuracy', color: '#f0c04a' },
  mistake: { label: 'Mistake', color: '#f0973a' },
  miss: { label: 'Miss', color: '#ef6b5b' },
  blunder: { label: 'Blunder', color: '#dc4a40' },
  forced: { label: 'Forced', color: '#8a909a' },
}

/** Classes worth calling out with an icon in the move list and on the graph. */
export const NOTABLE: ReadonlySet<MoveClass> = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'])

/**
 * Expected-point loss bands (Chess.com's published thresholds). Under `best`, a
 * move keeps the same eval as the engine's top move, so it's as good as best.
 */
export const LOSS_BANDS = { best: 0.01, excellent: 0.02, good: 0.05, inaccuracy: 0.1, mistake: 0.2 } as const

/** What the review engine reported for one position. */
export interface ReviewedPosition {
  score: Score
  bestMove: string | null
  pv: string[]
  /** Score of the second-best move, when the review ran with MultiPV 2. */
  second?: Score
}

export interface MoveReview {
  nodeId: string
  ply: number
  color: Color
  cls: MoveClass
  /** Mover's win chance before (with best play) and after the move, 0–100. */
  winBefore: number
  winAfter: number
  /** Expected points given up, 0–1. */
  loss: number
  /** Per-move accuracy, 0–100 (Lichess formula). */
  accuracy: number
  /** Engine's preferred move in the position before (UCI), if different from the move played. */
  bestMove?: string
  /** Score after the move, White POV. */
  score: Score
}

export interface GameReport {
  moves: Record<string, MoveReview>
  accuracy: Record<Color, number | null>
  counts: Record<Color, Record<MoveClass, number>>
}

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Material balance (pawn units) from `color`'s side. */
export function materialBalance(fen: string, color: Color): number {
  let balance = 0
  for (const ch of fen.split(' ')[0]) {
    const v = VALUES[ch.toLowerCase()]
    if (v === undefined) continue
    const white = ch === ch.toUpperCase()
    balance += (white === (color === 'white') ? 1 : -1) * v
  }
  return balance
}

const moverWin = (score: Score, color: Color) => (color === 'white' ? winPercent(score) : 100 - winPercent(score))

/** Moves until `color` delivers mate, or null when it has no forced mate. */
function mateIn(score: Score, color: Color): number | null {
  if (score.type !== 'mate' || score.value === 0) return null
  const n = color === 'white' ? score.value : -score.value
  return n > 0 ? n : null
}

/** A score in pawns from `color`'s side; a forced mate counts as unbounded. */
function moverPawns(score: Score, color: Color): number {
  if (score.type === 'mate') {
    const win = moverWin(score, color)
    return win > 50 ? Infinity : win < 50 ? -Infinity : 0
  }
  return ((color === 'white' ? 1 : -1) * score.value) / 100
}

/** Lichess's per-move accuracy from the mover's win% before and after (both 0–100). */
export function moveAccuracy(before: number, after: number): number {
  if (after >= before) return 100
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411
  return Math.max(0, Math.min(100, raw + 1)) // +1: uncertainty bonus for imperfect analysis
}

/**
 * Did the move sacrifice a piece? Either the engine's line takes it and the mover
 * doesn't win the material straight back, or the move leaves a piece en prise
 * that the opponent does better not to take.
 *
 * `expected` is the eval before the move in pawns, mover's POV. When it's below
 * the material count, the engine already counts some of that material as lost
 * (a pinned or trapped piece), so giving it back isn't a sacrifice.
 *
 * `stillHanging`: also count a piece that was already en prise before the move and
 * is left there again. Off by default, or every move while it hangs would count.
 */
export function isSacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, expected = Infinity, stillHanging = false): boolean {
  return acceptedSacrifice(beforeFen, afterFen, pv, color, expected) || offeredSacrifice(beforeFen, afterFen, pv, color, stillHanging)
}

/**
 * Walks the engine's expected continuation a few plies: the opponent takes one of
 * the mover's pieces (not just pawns), leaving the mover down at least two pawns'
 * worth compared with before the move, and the mover's next move doesn't win it
 * straight back. Winning it back later through a tactic still counts, as in
 * 18…Nxe4 19.dxe4 d3, which only regains the piece two moves on.
 */
function acceptedSacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, expected: number): boolean {
  const baseline = Math.min(materialBalance(beforeFen, color), expected)
  const chess = new Chess(afterFen)
  const down = () => materialBalance(chess.fen(), color) <= baseline - 2
  let pieceTaken = false
  for (const uci of pv.slice(0, 4)) {
    let move
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    const ours = (move.color === 'w' ? 'white' : 'black') === color
    if (ours && pieceTaken) {
      if (down()) return true
      pieceTaken = false // taken straight back: a trade
    } else if (!ours && move.captured && move.captured !== 'p' && down()) {
      pieceTaken = true
    }
  }
  return pieceTaken
}

/** The cheapest piece on `squares`, by value; the king can only take an undefended piece, so it counts as dearest. */
function cheapest(chess: Chess, squares: Square[]): number {
  return Math.min(...squares.map((sq) => (chess.get(sq)?.type === 'k' ? 100 : VALUES[chess.get(sq)!.type])))
}

/** Can the side opposite `us` win the piece on `square`: take it with something cheaper, or take it undefended? */
function enPrise(chess: Chess, square: Square, us: 'w' | 'b', takers: Square[]): boolean {
  if (!takers.length) return false
  return !chess.attackers(square, us).length || cheapest(chess, takers) < VALUES[chess.get(square)!.type]
}

/**
 * Does the move leave a piece (knight or better) en prise that wasn't before
 * (or, with `stillHanging`, that already was), where the engine's reply declines
 * it? Taking it back for something worth as much (a trade) doesn't count.
 */
function offeredSacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, stillHanging: boolean): boolean {
  const us = color === 'white' ? 'w' : 'b'
  const them = us === 'w' ? 'b' : 'w'
  const before = new Chess(beforeFen)
  const after = new Chess(afterFen)
  const gained = materialBalance(afterFen, color) - materialBalance(beforeFen, color)
  const captures = after.moves({ verbose: true }).filter((m) => m.captured)
  const reply = pv[0]
  return after.board().some((row) =>
    row.some((piece) => {
      if (!piece || piece.color !== us || VALUES[piece.type] < 3 || gained >= VALUES[piece.type]) return false
      const sq = piece.square
      if (reply?.slice(2, 4) === sq) return false // taken at once: acceptedSacrifice decides
      const takers = captures.filter((m) => m.to === sq).map((m) => m.from)
      if (!enPrise(after, sq, us, takers)) return false
      if (stillHanging) return true
      const was = before.get(sq)
      return !(was && was.color === us && was.type === piece.type && enPrise(before, sq, us, before.attackers(sq, them)))
    }),
  )
}

function isRecapture(prev: MoveNode, node: MoveNode) {
  return Boolean(prev.san?.includes('x') && node.san?.includes('x') && prev.to === node.to)
}

function emptyCounts(): Record<MoveClass, number> {
  return Object.fromEntries(Object.keys(CLASS_INFO).map((k) => [k, 0])) as Record<MoveClass, number>
}

const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'black' : 'white')

/**
 * Classifies every main-line move that has engine data for both its before and
 * after positions. `isBook` reports whether a position is in the opening book.
 */
export function classifyGame(line: MoveNode[], evals: Record<string, ReviewedPosition>, isBook: (fen: string) => boolean = () => false): GameReport {
  const moves: Record<string, MoveReview> = {}
  const counts = { white: emptyCounts(), black: emptyCounts() }
  let stillInBook = true

  for (let i = 1; i < line.length; i++) {
    const parent = line[i - 1]
    const node = line[i]
    const before = evals[parent.fen]
    const after = evals[node.fen]
    if (!before || !after || !node.uci) {
      stillInBook = false
      continue
    }
    const color = turnOf(parent.fen)
    const winBefore = moverWin(before.score, color)
    const winAfter = moverWin(after.score, color)
    const loss = Math.max(0, winBefore - winAfter) / 100
    const playedBest = node.uci === before.bestMove
    const legalMoves = new Chess(parent.fen).moves().length

    let cls: MoveClass
    if (stillInBook && isBook(node.fen)) {
      cls = 'book'
    } else {
      stillInBook = false
      if (legalMoves === 1) cls = 'forced'
      else if (playedBest || loss < LOSS_BANDS.best) cls = 'best'
      else if (loss < LOSS_BANDS.excellent) cls = 'excellent'
      else if (loss < LOSS_BANDS.good) cls = 'good'
      else if (loss < LOSS_BANDS.inaccuracy) cls = 'inaccuracy'
      else if (loss < LOSS_BANDS.mistake) cls = 'mistake'
      else cls = 'blunder'

      // The only move that works: it keeps us equal or better and every alternative would be a
      // mistake or worse, or it's the only fast mate (the next-best move doesn't mate, or takes 3+ moves longer).
      let onlyGood = false
      let onlyMate = false
      if (playedBest && before.second && legalMoves > 1) {
        const secondWin = moverWin(before.second, color)
        onlyGood = winAfter >= 50 && (winBefore - secondWin) / 100 >= LOSS_BANDS.inaccuracy && secondWin < 85
        const mate = mateIn(before.score, color)
        const secondMate = mateIn(before.second, color)
        onlyMate = mate !== null && mate >= 2 && (secondMate === null || secondMate >= mate + 3)
      }

      // Brilliant: a best move that sacrifices a piece and leaves us equal or better, when we
      // weren't already completely winning — not even with a mate on the board: at review depth
      // the engine often misses a second, slightly longer mate. Leaving a piece that already
      // hung en prise again counts only when the move is also the only good one.
      if (cls === 'best' && winAfter >= 50 && winBefore < 97 && isSacrifice(parent.fen, node.fen, after.pv, color, moverPawns(before.score, color), onlyGood)) {
        cls = 'brilliant'
      } else if ((onlyGood || onlyMate) && !isRecapture(parent, node)) {
        cls = 'great'
      }

      // Miss: the opponent just erred, we were winning, and we let most of it slip without losing.
      const prev = moves[parent.id]
      if ((cls === 'mistake' || cls === 'blunder') && prev && (prev.cls === 'mistake' || prev.cls === 'blunder') && winBefore >= 65 && winAfter >= 35) {
        cls = 'miss'
      }
    }

    const review: MoveReview = {
      nodeId: node.id,
      ply: node.ply,
      color,
      cls,
      winBefore,
      winAfter,
      loss,
      accuracy: moveAccuracy(winBefore, winAfter),
      bestMove: playedBest || !before.bestMove ? undefined : before.bestMove,
      score: after.score,
    }
    moves[node.id] = review
    counts[color][cls]++
  }

  return { moves, counts, accuracy: gameAccuracy(line, evals) }
}

function stdDev(xs: number[]) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length)
}

/**
 * Lichess's game accuracy: the average of a volatility-weighted mean and a
 * harmonic mean of per-move accuracies. Needs every main-line position reviewed.
 */
export function gameAccuracy(line: MoveNode[], evals: Record<string, ReviewedPosition>): Record<Color, number | null> {
  const wins: number[] = []
  for (const node of line) {
    const e = evals[node.fen]
    if (!e) return { white: null, black: null }
    wins.push(winPercent(e.score))
  }
  if (wins.length < 2) return { white: null, black: null }

  const windowSize = Math.max(2, Math.min(8, Math.floor(wins.length / 10)))
  const windows: number[][] = []
  for (let i = 0; i < Math.min(windowSize, wins.length) - 2; i++) windows.push(wins.slice(0, windowSize))
  for (let i = 0; i + windowSize <= wins.length; i++) windows.push(wins.slice(i, i + windowSize))
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))))

  const per: Record<Color, { acc: number; weight: number }[]> = { white: [], black: [] }
  const firstMover = turnOf(line[0].fen)
  for (let i = 0; i + 1 < wins.length; i++) {
    const color: Color = (i % 2 === 0) === (firstMover === 'white') ? 'white' : 'black'
    const before = color === 'white' ? wins[i] : 100 - wins[i]
    const after = color === 'white' ? wins[i + 1] : 100 - wins[i + 1]
    per[color].push({ acc: moveAccuracy(before, after), weight: weights[i] ?? 0.5 })
  }

  const combine = (xs: { acc: number; weight: number }[]) => {
    if (!xs.length) return null
    const weighted = xs.reduce((a, x) => a + x.acc * x.weight, 0) / xs.reduce((a, x) => a + x.weight, 0)
    const harmonic = xs.length / xs.reduce((a, x) => a + 1 / Math.max(x.acc, 1), 0)
    return (weighted + harmonic) / 2
  }
  return { white: combine(per.white), black: combine(per.black) }
}
