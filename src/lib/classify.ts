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
export const CLASS_ORDER: MoveClass[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced']

/**
 * Rookahead's own names and colours. Internal ids (and the share-link codes) keep the old names;
 * only these labels and colours are shown. Mid-tone colours: readable as text on light and dark,
 * and dark enough for white marks on the badges.
 */
export const CLASS_INFO: Record<MoveClass, { label: string; color: string }> = {
  brilliant: { label: 'Legendary', color: '#8b5cf6' },
  great: { label: 'Clutch', color: '#2f80ed' },
  best: { label: 'Best', color: '#4f9a3c' },
  excellent: { label: 'Strong', color: '#4f9a3c' },
  good: { label: 'Solid', color: '#7a9a68' },
  book: { label: 'Theory', color: '#a98a62' },
  inaccuracy: { label: 'Slip', color: '#c99a16' },
  mistake: { label: 'Mistake', color: '#d9711f' },
  miss: { label: 'Oversight', color: '#cf4b63' },
  blunder: { label: 'Blunder', color: '#c7372f' },
  forced: { label: 'Forced', color: '#5b5f68' },
}

/** Classes worth calling out with an icon in the move list and on the graph. */
export const NOTABLE: ReadonlySet<MoveClass> = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'])

/**
 * Expected-point loss bands for every move other than the engine's own (docs/rulebook.md):
 * only the engine's move, or a checkmate, is Best.
 */
export const LOSS_BANDS = { excellent: 0.02, good: 0.05, inaccuracy: 0.1, mistake: 0.2 } as const

/** "Equal or better" for Great and Legendary: a draw, or a slightly worse position that holds (about -0.5). */
const HOLDS = 45

/**
 * The verdict rules' version. Bump it whenever docs/rulebook.md changes a verdict: a saved review graded
 * under older rules is reviewed again when it's opened, rather than showing verdicts the rules no longer give.
 */
export const RULES_VERSION = 7

/** A Legendary sacrifice may fall this far short of the best move (expected points). */
export const LEGENDARY_LOSS = 0.035

/** Clutch also counts holding a worse game that isn't lost: about −2.3 or better. */
const HOLDING = 30

/** An advantage, however small: about +0.5 or better (the mirror of HOLDS). */
const ADVANTAGE = 55

/** What a position is for the side to move: an advantage (3), level (2), worse but holding (1) or lost (0). */
const standing = (win: number) => (win >= ADVANTAGE ? 3 : win >= HOLDS ? 2 : win >= HOLDING ? 1 : 0)

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
  /** The mover had mate in this many moves and the move let it go. */
  missedMate?: number
  /** The mover had mate in this many moves and the move keeps a mate, but a longer one. */
  fasterMate?: number
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

/** What a sacrifice gave up: material in general, or the exchange (a rook for a knight or bishop). */
export type Sacrifice = 'material' | 'exchange'

/**
 * Did the move sacrifice material (docs/rulebook.md)? Either the engine's line takes it and the
 * mover doesn't win it straight back, or the move leaves a piece en prise that the opponent does
 * better not to take. Two pawns or more, pawns included.
 *
 * `expected` is the eval before the move in pawns, mover's POV. When it's two pawns or more
 * below the material count, the engine already counts some of that material as lost
 * (a pinned or trapped piece), so giving it back isn't a sacrifice.
 *
 * `stillHanging`: also count a piece that was already en prise before the move and
 * is left there again. Off by default, or every move while it hangs would count.
 *
 * `olderFen`: the position before the opponent's last move. A piece that only became en prise
 * with that move, and that the mover now ignores, is a sacrifice; one that hung even then is
 * left hanging again. Without it, every piece en prise before the move counts as left hanging.
 */
export function sacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, expected = Infinity, stillHanging = false, olderFen?: string): Sacrifice | null {
  return sacrificeDetail(beforeFen, afterFen, pv, color, expected, stillHanging, olderFen)?.kind ?? null
}

type SacrificeDetail = { kind: Sacrifice; declined: boolean } | null

/**
 * Answers already worked out. A review re-grades the whole game each time a position comes in, and
 * this check (all of chess.js's verbose move generation) is most of the cost: on a long game, enough
 * to stall the board mid-slide.
 */
const sacrifices = new Map<string, SacrificeDetail>()
const SACRIFICES_KEPT = 4000

/** `sacrifice`, also saying whether the opponent's best line declines it (it can't safely be taken). */
function sacrificeDetail(beforeFen: string, afterFen: string, pv: string[], color: Color, expected: number, stillHanging: boolean, olderFen?: string): SacrificeDetail {
  // The engine's line is read four plies deep at most (acceptedSacrifice).
  const key = [beforeFen, afterFen, pv.slice(0, 4).join(' '), color, expected, stillHanging, olderFen].join('|')
  if (sacrifices.has(key)) return sacrifices.get(key)!
  if (sacrifices.size >= SACRIFICES_KEPT) sacrifices.clear()
  const detail = findSacrifice(beforeFen, afterFen, pv, color, expected, stillHanging, olderFen)
  sacrifices.set(key, detail)
  return detail
}

function findSacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, expected: number, stillHanging: boolean, olderFen?: string): SacrificeDetail {
  const us = color === 'white' ? 'w' : 'b'
  const before = new Chess(beforeFen)
  const older = olderFen ? new Chess(olderFen) : null
  const hungAlready = (sq: Square, type: string) => !stillHanging && hanging(before, sq, type, us) && (!older || hanging(older, sq, type, us))
  const accepted = acceptedSacrifice(beforeFen, afterFen, pv, color, expected, hungAlready)
  if (accepted) return { kind: accepted, declined: false }
  const offered = offeredSacrifice(beforeFen, afterFen, pv, color, hungAlready)
  return offered ? { kind: offered, declined: true } : null
}

/** Is our piece of this type on `sq`, and can the opponent win it? */
function hanging(chess: Chess, sq: Square, type: string, us: 'w' | 'b'): boolean {
  const piece = chess.get(sq)
  return Boolean(piece && piece.color === us && piece.type === type && enPrise(chess, sq, us, chess.attackers(sq, us === 'w' ? 'b' : 'w')))
}

export function isSacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, expected = Infinity, stillHanging = false): boolean {
  return sacrifice(beforeFen, afterFen, pv, color, expected, stillHanging) !== null
}

/**
 * Walks the engine's expected continuation a few plies: the opponent takes the mover's
 * material at once (capturing from their first move), leaving the mover down at least two pawns' worth compared with before the move,
 * and the mover's next move doesn't win it straight back. Winning it back later through a
 * tactic still counts, as in 18…Nxe4 19.dxe4 d3, which only regains the piece two moves on.
 * A piece that was left hanging again (`hungAlready`) counts as lost already.
 */
function acceptedSacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, expected: number, hungAlready: (sq: Square, type: string) => boolean): Sacrifice | null {
  const material = materialBalance(beforeFen, color)
  // Only an eval two pawns or more below the material count means material is already lost
  // (a pinned or trapped piece); less is just compensation.
  let baseline = material - expected >= 2 ? expected : material
  const chess = new Chess(afterFen)
  const balance = () => materialBalance(chess.fen(), color)
  const down = () => balance() <= baseline - 2
  const taken: string[] = [] // the mover's material the opponent took
  // Only a rook lost, for less than a minor piece's worth: the exchange.
  const kind = (): Sacrifice => (taken.length === 1 && taken[0] === 'r' && material - balance() < 3 ? 'exchange' : 'material')
  let pieceTaken = false
  for (const uci of pv.slice(0, 4)) {
    let move
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    const ours = (move.color === 'w' ? 'white' : 'black') === color
    if (!ours && move.captured && hungAlready(move.to, move.captured)) {
      baseline -= VALUES[move.captured] // it was left hanging again: taking it now isn't a sacrifice
      continue
    }
    // The opponent has to go straight for it: a quiet move first means they had to set up the attack,
    // so whatever they win later, this move didn't offer it (23.g4 Be7 24.Kb1 Bxg5).
    if (!ours && !move.captured && !pieceTaken) return null
    if (!ours && move.captured) taken.push(move.captured)
    // Our next move doesn't take back as much (still a pawn or more behind): a sacrifice. All of it: a trade.
    if (ours && pieceTaken) return balance() <= baseline - 1 ? kind() : null
    // Once the mover captures something itself, a new exchange begins: what's lost after it
    // belongs to that move, not this one (8…Bxc3 9.Bxc3 Nxe4 10.Qxe4: the knight is 9…Nxe4's).
    if (ours && move.captured) return null
    if (!ours && move.captured && down()) pieceTaken = true
  }
  return pieceTaken ? kind() : null
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
 * Does the move leave a piece (knight or better) en prise, other than one left hanging
 * again (`hungAlready`), where the engine's reply declines it? Taking it back for something
 * worth as much (a trade) doesn't count. A rook that only a knight or bishop can win is the exchange.
 */
function offeredSacrifice(beforeFen: string, afterFen: string, pv: string[], color: Color, hungAlready: (sq: Square, type: string) => boolean): Sacrifice | null {
  const us = color === 'white' ? 'w' : 'b'
  const before = new Chess(beforeFen)
  const after = new Chess(afterFen)
  const gained = materialBalance(afterFen, color) - materialBalance(beforeFen, color)
  const captures = after.moves({ verbose: true }).filter((m) => m.captured)
  const reply = pv[0]
  let found: Sacrifice | null = null
  for (const piece of after.board().flat()) {
    if (!piece || piece.color !== us || VALUES[piece.type] < 3 || gained >= VALUES[piece.type]) continue
    const sq = piece.square
    if (reply?.slice(2, 4) === sq) continue // taken at once: acceptedSacrifice decides
    const takers = captures.filter((m) => m.to === sq).map((m) => m.from)
    if (!enPrise(after, sq, us, takers)) continue
    if (hungAlready(sq, piece.type)) continue
    // A piece left behind (not the one that moved) while the move attacks as much is a trade. The moved
    // piece is still offered: a person takes a queen they're given, whatever comes back (14.Qxh3 Bxh3 15.Bxg5+).
    const leftBehind = before.get(sq)?.type === piece.type && before.get(sq)?.color === us
    if (leftBehind && winsBack(after, sq, us, gained)) continue
    // A defended rook that only a knight or bishop can win is the exchange; anything else is material.
    const exchange = piece.type === 'r' && after.attackers(sq, us).length > 0 && cheapest(after, takers) === 3
    if (!exchange) return 'material'
    found = 'exchange'
  }
  return found
}

/**
 * However the opponent takes the piece on `sq`, can the mover's next move win back as much: under a pawn
 * behind, counting what the move itself took (`gained`)? Then leaving it there was a trade, not an
 * offer: 5…Qxg2 leaves the h8 rook to the f7 knight, but 6.Nxh8 Qxh1+ wins a rook back.
 */
function winsBack(after: Chess, sq: Square, us: 'w' | 'b', gained: number): boolean {
  const lost = VALUES[after.get(sq)!.type]
  const takes = after.moves({ verbose: true }).filter((m) => m.to === sq && m.captured)
  return takes.every((take) => {
    const chess = new Chess(after.fen())
    chess.move(take)
    // A defended piece is only worth taking with something cheaper, and only for the difference.
    const wins = chess.moves({ verbose: true }).filter((m) => m.captured).map((m) => {
      const defended = chess.attackers(m.to, us === 'w' ? 'b' : 'w').length > 0
      return defended ? VALUES[m.captured!] - VALUES[m.piece] : VALUES[m.captured!]
    })
    return gained - lost + Math.max(0, ...wins) > -1
  })
}

/**
 * Does the move take back what the opponent just took: a recapture on the same square, or a
 * capture anywhere that only brings the material back to where it was before their capture?
 * A capture elsewhere by a piece that was under attack is escaping a threat, not taking back
 * (5…Qxg2, the queen out of the f7 fork).
 */
function takesBack(older: MoveNode | undefined, prev: MoveNode, node: MoveNode, color: Color) {
  if (!prev.san?.includes('x') || !node.san?.includes('x')) return false
  if (prev.to === node.to) return true
  const before = new Chess(prev.fen)
  const piece = node.from && before.get(node.from)
  if (piece && hanging(before, node.from!, piece.type, piece.color)) return false
  return older !== undefined && materialBalance(node.fen, color) <= materialBalance(older.fen, color)
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
    // A book move that would be a Mistake or worse gets graded instead, and theory ends there.
    if (stillInBook && isBook(node.fen) && (playedBest || loss < LOSS_BANDS.inaccuracy)) {
      cls = 'book'
    } else {
      stillInBook = false
      if (legalMoves === 1) cls = 'forced'
      else if (playedBest || (after.score.type === 'mate' && after.score.value === 0)) cls = 'best'
      else if (loss < LOSS_BANDS.excellent) cls = 'excellent'
      else if (loss < LOSS_BANDS.good) cls = 'good'
      else if (loss < LOSS_BANDS.inaccuracy) cls = 'inaccuracy'
      else if (loss < LOSS_BANDS.mistake) cls = 'mistake'
      else cls = 'blunder'

      // The only move (Clutch): every other move gives up what we have, an advantage, a level game or a
      // worse one that holds, or would be a Blunder even where it keeps some advantage (+6.0 to +0.9).
      // Another move that keeps most of an advantage leaves it no Clutch.
      // Or it's the only fast mate (the next-best move doesn't mate, or takes 3+ moves longer).
      // The only good move (for giving up the exchange): every alternative would be a mistake or worse,
      // short of leaving us clearly winning. A mating sacrifice only needs the fastest mate, 2+ moves
      // ahead of the next-best.
      let onlyMove = false
      let onlyGood = false
      let onlyMate = false
      let fastestMate = false
      if (playedBest && before.second && legalMoves > 1) {
        const secondWin = moverWin(before.second, color)
        const worse = (winBefore - secondWin) / 100 >= LOSS_BANDS.inaccuracy
        onlyMove = winAfter >= HOLDING && worse && (standing(secondWin) < standing(winBefore) || (winBefore - secondWin) / 100 >= LOSS_BANDS.mistake)
        onlyGood = winAfter >= HOLDING && worse && secondWin < 85
        const mate = mateIn(before.score, color)
        const secondMate = mateIn(before.second, color)
        onlyMate = mate !== null && mate >= 2 && (secondMate === null || secondMate >= mate + 3)
        fastestMate = mate !== null && mate >= 2 && (secondMate === null || secondMate >= mate + 2)
      }

      // Legendary (docs/rulebook.md): a sacrifice at most 3.5% short of the best move that leaves us level
      // or better, when we weren't already completely winning — not even with a mate on the board: at
      // review depth the engine often misses a second, slightly longer mate. A sacrifice the opponent does
      // best to decline (it can't safely be taken) counts even then. Giving up the exchange must also be
      // the only good move. Or a sacrifice that is the fastest mate. Leaving a piece that already hung en
      // prise again counts only when the move is the only good one.
      const gradable = cls === 'best' || cls === 'excellent' || cls === 'good'
      const offered = (pv: string[]) => sacrificeDetail(parent.fen, node.fen, pv, color, moverPawns(before.score, color), onlyGood, line[i - 2]?.fen)
      // Where the game went the engine's way, its own moves have to show the sacrifice too: the engine's line
      // may throw in a check that gives more up (22.Nd5 Nbxd5 23.Nc6+ Bxc6), where the game just took back.
      const played = line.slice(i + 1, i + 5).flatMap((n) => (n.uci ? [n.uci] : []))
      const sac = gradable ? offered(after.pv) && (played[0] !== after.pv[0] || played.length < 2 ? offered(after.pv) : offered(played)) : null
      const mates = after.score.type === 'mate' && after.score.value === 0
      const soundSac = sac !== null && (playedBest || loss < LEGENDARY_LOSS) && winAfter >= HOLDS && (winBefore < 97 || sac.declined) && (sac.kind !== 'exchange' || onlyGood)
      if (soundSac || (sac !== null && fastestMate)) {
        cls = 'brilliant'
      } else if ((onlyMove || onlyMate) && !mates && !takesBack(line[i - 2], parent, node, color)) {
        // Clutch: the only move, however obvious (a free capture, an attacked piece to its one safe
        // square), but not taking back what the opponent just took, and not the mating move itself.
        cls = 'great'
      }

      // Miss: the opponent just erred and we let it go, ending up about where we were before their
      // error. Falling further than that is a mistake or blunder of our own.
      const prev = moves[parent.id]
      if ((cls === 'mistake' || cls === 'blunder') && prev && (prev.cls === 'mistake' || prev.cls === 'blunder') && winAfter >= 100 - prev.winBefore - 5) {
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
    const mate = mateIn(before.score, color)
    const mateAfter = mateIn(after.score, color)
    if (mate !== null && !playedBest && cls !== 'book' && cls !== 'forced') {
      // The best line leaves mate in one move fewer; anything more is a slower mate.
      if (mateAfter === null) review.missedMate = mate
      else if (mateAfter > mate - 1) review.fasterMate = mate
    }
    moves[node.id] = review
    counts[color][cls]++
  }

  return { moves, counts, accuracy: gameAccuracy(line, evals) }
}

/** Replaces the classes of the given moves (keyed by node id), e.g. a shared review's verdicts. */
export function withClasses(report: GameReport, classes: Record<string, MoveClass>): GameReport {
  const moves = { ...report.moves }
  const counts = { white: { ...report.counts.white }, black: { ...report.counts.black } }
  for (const [id, cls] of Object.entries(classes)) {
    const move = moves[id]
    if (!move || move.cls === cls) continue
    counts[move.color][move.cls]--
    counts[move.color][cls]++
    moves[id] = { ...move, cls }
  }
  return { ...report, moves, counts }
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
