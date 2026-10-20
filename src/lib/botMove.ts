import { Chess } from 'chess.js'
import type { EngineLine } from '../engine/Engine'
import type { Score } from './uci'
import { winPercent, type Color } from './evaluation'

// How the computer picks a move the way a person of its rating would. Stockfish's own Skill Level only
// ever plays one of its four best moves, so even level 1 hardly ever hung a piece. Instead the engine
// scores every legal move and the computer chooses among them:
// - most moves it plays sensibly: anything that loses less than a mistake's worth, with some randomness
//   (`noise`), so it drifts into inaccuracies like people do;
// - on a lapse (`lapse`, per move) it plays a real mistake or blunder, and of those the one that looks
//   most natural at a glance (a one-move-deep search): the move that walks into a fork, not a random one.
// Tuned against analysed Lichess games: people of every rating blunder far more often than they make
// small slips, which Skill Level gets the wrong way round.

export interface BotStyle {
  /** Chance per move of a lapse: playing a mistake or a blunder when one is there to play. */
  lapse: number
  /** Share of lapses that are blunders rather than mistakes. */
  blunderShare: number
  /** Randomness among the sound moves, in win-percentage points (softmax temperature). */
  noise: number
  /**
   * How bad a lapse may look one move deep (win% points behind the move that looks best). Beginners
   * hang pieces in plain sight; a strong player's blunders are deeper tactics, so on a lapse where every
   * bad move is visibly bad they play a sound move instead. Unset: no limit.
   */
  sight?: number
}

/** One legal move, scored for the mover: chance of winning (0–100) and centipawns (mates far beyond any material). */
export interface Candidate {
  uci: string
  win: number
  cp: number
}

/** Losses in win-percentage points, as the review's classifier counts them. */
const MISTAKE = 10
const BLUNDER = 20
/**
 * Centipawns per point of loss once the game is decided. Win% flattens out there (+8 and +15 are both
 * "won"), which left a winning computer shuffling at random; counted this way, dropping a rook or passing
 * up a mate still costs it.
 */
const CP_PER_POINT = 15
/** On a lapse: how strongly the most natural-looking of the bad moves is preferred. */
const LAPSE_NOISE = 4
/** Opening moves: book moves only, nearly always the soundest of them. */
const BOOK_NOISE = 1.5
/** The book names some dubious lines too; a book move losing more than this isn't played. */
const BOOK_MAX_LOSS = 4

function moverCp(score: Score, color: Color): number {
  const sign = color === 'white' ? 1 : -1
  if (score.type === 'cp') return sign * score.value
  // Mate in n: worth more the sooner it comes.
  const n = sign * score.value
  return Math.sign(n) * (10000 - 100 * Math.min(Math.abs(n), 50))
}

/**
 * Every move the search scored, from the mover's side. Underpromotions only when they beat promoting
 * to a queen: when everything is lost anyway they tie with it, and nobody plays a1=N+ for that.
 */
export function candidates(lines: EngineLine[], color: Color): Candidate[] {
  const moves = lines
    .filter((l) => l.pv.length > 0)
    .map((l) => ({
      uci: l.pv[0],
      win: color === 'white' ? winPercent(l.score) : 100 - winPercent(l.score),
      cp: moverCp(l.score, color),
    }))
  const queening = new Map(moves.filter((m) => m.uci[4] === 'q').map((m) => [m.uci.slice(0, 4), m.cp]))
  return moves.filter((m) => !m.uci[4] || m.uci[4] === 'q' || m.cp > (queening.get(m.uci.slice(0, 4)) ?? -Infinity))
}

/**
 * Whether `lines` all come from one finished iteration of the search. A search stopped by its time limit
 * leaves the moves it hadn't reached yet at the previous depth, and comparing scores from different
 * depths can make a blunder look like the best move.
 */
export function isComplete(lines: EngineLine[], legalMoves: number): boolean {
  return lines.length === Math.min(legalMoves, 256) && lines.every((l) => l.depth === lines[0].depth)
}

/** How much worse each move is than the best of `moves`, in win-percentage points. */
export function losses(moves: Candidate[]): number[] {
  const win = Math.max(...moves.map((m) => m.win))
  const cp = Math.max(...moves.map((m) => m.cp))
  return moves.map((m) => Math.max(win - m.win, (cp - m.cp) / CP_PER_POINT))
}

/** Picks a move with probability ∝ exp(−loss / noise). `rand` is in [0, 1). */
export function sample(moves: Candidate[], noise: number, rand: () => number = Math.random): string {
  const weights = losses(moves).map((l) => Math.exp(-l / noise))
  let r = rand() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < moves.length; i++) if ((r -= weights[i]) <= 0) return moves[i].uci
  return moves[moves.length - 1].uci
}

/**
 * The first step of a move: either the move itself, or (on a lapse) the bad moves to choose from,
 * which `pickLapse` narrows down once a quick one-move search has scored how they look.
 */
export function decide(moves: Candidate[], style: BotStyle, rand: () => number = Math.random): { move: string } | { lapse: Candidate[] } {
  const loss = losses(moves)
  const losing = (lo: number, hi: number) => moves.filter((_, i) => loss[i] >= lo && loss[i] < hi)
  if (rand() < style.lapse) {
    const mistakes = losing(MISTAKE, BLUNDER)
    const blunders = losing(BLUNDER, Infinity)
    const [first, second] = rand() < style.blunderShare ? [blunders, mistakes] : [mistakes, blunders]
    const pool = first.length ? first : second
    if (pool.length) return { lapse: pool }
  }
  return { move: soundMove(moves, style, rand) }
}

/** A move that loses less than a mistake's worth, picked with the style's noise. */
export function soundMove(moves: Candidate[], style: BotStyle, rand: () => number = Math.random): string {
  const loss = losses(moves)
  return sample(
    moves.filter((_, i) => loss[i] < MISTAKE),
    style.noise,
    rand,
  )
}

/**
 * The lapse's move: of the bad moves, one that looks fine one move deep (`glance`: shallow scores of the
 * same position), or null when every one of them looks worse than the style's `sight` allows.
 */
export function pickLapse(pool: Candidate[], glance: Candidate[], style: BotStyle, rand: () => number = Math.random): string | null {
  const glanceLoss = new Map(losses(glance).map((l, i) => [glance[i].uci, l]))
  const seen = new Map(glance.map((m) => [m.uci, m]))
  const plausible = pool.filter((m) => (glanceLoss.get(m.uci) ?? 0) <= (style.sight ?? Infinity))
  if (!plausible.length) return null
  return sample(
    plausible.map((m) => seen.get(m.uci) ?? m),
    LAPSE_NOISE,
    rand,
  )
}

/** An opening move from the book, when `fen` is still in it and a book move is among `moves`. */
export function bookMove(moves: Candidate[], fen: string, isBook: (fen: string) => boolean, rand: () => number = Math.random): string | null {
  const loss = losses(moves)
  const inBook = moves.filter((m, i) => {
    if (loss[i] > BOOK_MAX_LOSS) return false
    const chess = new Chess(fen)
    try {
      chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] })
    } catch {
      return false
    }
    return isBook(chess.fen())
  })
  return inBook.length ? sample(inBook, BOOK_NOISE, rand) : null
}
