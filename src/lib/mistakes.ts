// "Learn from your mistakes": your Errors, Oversights and Blunders from reviewed games, as
// find-the-better-move puzzles. Built from the review cache, so nothing is analysed again.
import { Chess } from 'chess.js'
import { LOSS_BANDS, type MoveClass } from './classify'
import { winPercent, type Color } from './evaluation'
import { loadReviews, type CachedReview } from './reviewCache'
import { decodeSaved, type SharedGame } from './share'
import type { Score } from './uci'

export interface MistakePuzzle {
  /** `<game key>#<move index>`. */
  id: string
  gameKey: string
  /** The review's share token, to open the game in Analysis. */
  token: string
  /** The position before your move. */
  fen: string
  /** Ply of your move (1 = White's first move from the standard start). */
  ply: number
  played: string
  playedSan: string
  best: string
  bestSan: string
  /** White POV: the position with the best move, and after the move you played. */
  bestScore: Score
  playedScore: Score
  cls: MoveClass
  color: Color
  /** Who you were playing. */
  opponent: string
  /** When the game was reviewed (ms). */
  at: number
}

const MISTAKES: ReadonlySet<MoveClass> = new Set(['mistake', 'miss', 'blunder'])

const moverWin = (score: Score, color: Color) => (color === 'white' ? winPercent(score) : 100 - winPercent(score))

/** A move is right if it would have been Good or better: under the Good band of expected-point loss. */
export function acceptable(bestScore: Score, moveScore: Score, color: Color): boolean {
  return Math.max(0, moverWin(bestScore, color) - moverWin(moveScore, color)) / 100 < LOSS_BANDS.good
}

/** The mistakes made by the side the board faced (that's you) in one reviewed game. */
export function mistakesFromGame(key: string, entry: CachedReview, shared: SharedGame): MistakePuzzle[] {
  const review = shared.review
  if (!review) return []
  const chess = new Chess(shared.startFen)
  const opponent = (shared.orientation === 'white' ? shared.headers.Black : shared.headers.White) || 'Opponent'
  const found: MistakePuzzle[] = []
  shared.moves.forEach((uci, i) => {
    const fen = chess.fen()
    const color: Color = chess.turn() === 'w' ? 'white' : 'black'
    const ply = (Number(fen.split(' ')[5]) - 1) * 2 + (color === 'white' ? 1 : 2)
    const best = review.bestMoves[i]
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    if (color !== shared.orientation || !MISTAKES.has(review.classes[i]) || !best || best === uci) return
    const bestSan = new Chess(fen).move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] }).san
    found.push({
      id: `${key}#${i}`,
      gameKey: key,
      token: entry.token,
      fen,
      ply,
      played: uci,
      playedSan: move.san,
      best,
      bestSan,
      bestScore: review.scores[i],
      playedScore: review.scores[i + 1],
      cls: review.classes[i],
      color,
      opponent,
      at: entry.at,
    })
  })
  return found
}

/** Every unsolved mistake from the cached reviews: newest game first, each game in move order. */
export async function loadMistakes(solved: string[]): Promise<MistakePuzzle[]> {
  const done = new Set(solved)
  const entries = Object.entries(loadReviews()).sort(([, a], [, b]) => b.at - a.at)
  const found: MistakePuzzle[] = []
  for (const [key, entry] of entries) {
    try {
      const shared = await decodeSaved(entry.token)
      if (shared) found.push(...mistakesFromGame(key, entry, shared))
    } catch {
      // A game that won't replay has no puzzles to give.
    }
    // A turn for the page between games: a long list would otherwise hold up scrolling and drawing for seconds.
    await new Promise((go) => setTimeout(go))
  }
  return found.filter((m) => !done.has(m.id))
}
