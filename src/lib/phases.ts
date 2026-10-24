// Accuracy by phase of the game, from a saved review: how well you open, play the middlegame and finish.
import { Chess } from 'chess.js'
import { moveAccuracy } from './classify'
import { winPercent, type Color } from './evaluation'
import type { SharedGame } from './share'

export type Phase = 'opening' | 'middlegame' | 'endgame'
export const PHASES: Phase[] = ['opening', 'middlegame', 'endgame']

/** The opening is the first ten moves; the endgame starts once six or fewer pieces (not pawns or kings) are left. */
const OPENING_PLIES = 20
const ENDGAME_PIECES = 6

const pieces = (fen: string) => (fen.split(' ')[0].match(/[nbrqNBRQ]/g) ?? []).length

/** Your per-move accuracies in one game, sorted by the phase each move was played in. */
export function phaseMoves(game: SharedGame, color: Color): Record<Phase, number[]> {
  const out: Record<Phase, number[]> = { opening: [], middlegame: [], endgame: [] }
  const scores = game.review?.scores
  if (!scores || scores.length < game.moves.length + 1) return out
  const chess = new Chess(game.startFen)
  let endgame = false
  for (let i = 0; i < game.moves.length; i++) {
    const mover: Color = chess.turn() === 'w' ? 'white' : 'black'
    endgame ||= pieces(chess.fen()) <= ENDGAME_PIECES
    const phase: Phase = endgame ? 'endgame' : i < OPENING_PLIES ? 'opening' : 'middlegame'
    if (mover === color) {
      const before = winPercent(scores[i])
      const after = winPercent(scores[i + 1])
      out[phase].push(color === 'white' ? moveAccuracy(before, after) : moveAccuracy(100 - before, 100 - after))
    }
    const uci = game.moves[i]
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
  }
  return out
}

/** Accuracy in each phase over several games, blended like a game's (mean and harmonic mean, so a blunder
 * weighs as it should); null for a phase none of them reached. */
export function phaseAccuracy(games: { game: SharedGame; color: Color }[]): Record<Phase, number | null> {
  const all: Record<Phase, number[]> = { opening: [], middlegame: [], endgame: [] }
  for (const { game, color } of games) {
    const moves = phaseMoves(game, color)
    for (const p of PHASES) all[p].push(...moves[p])
  }
  const mean = (xs: number[]) => {
    if (!xs.length) return null
    const plain = xs.reduce((a, x) => a + x, 0) / xs.length
    const harmonic = xs.length / xs.reduce((a, x) => a + 1 / Math.max(x, 1), 0)
    return (plain + harmonic) / 2
  }
  return { opening: mean(all.opening), middlegame: mean(all.middlegame), endgame: mean(all.endgame) }
}

/** Games a phase must be reached in, and reviewed games in all, before Home names your weakest phase. */
export const WEAKEST_MIN_GAMES = 3
export const WEAKEST_MIN_REVIEWED = 5

/**
 * Your weakest phase over several reviewed games, or null until there's enough to say: five games, and only
 * phases reached in three of them count (a single endgame proves nothing), at least two of them.
 */
export function weakestPhase(games: { game: SharedGame; color: Color }[]): { phase: Phase; accuracy: number } | null {
  if (games.length < WEAKEST_MIN_REVIEWED) return null
  const reached: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 }
  for (const { game, color } of games) {
    const moves = phaseMoves(game, color)
    for (const p of PHASES) if (moves[p].length) reached[p]++
  }
  const accuracy = phaseAccuracy(games)
  const counted = PHASES.filter((p) => reached[p] >= WEAKEST_MIN_GAMES && accuracy[p] != null)
  if (counted.length < 2) return null
  const phase = counted.reduce((a, b) => (accuracy[a]! <= accuracy[b]! ? a : b))
  return { phase, accuracy: accuracy[phase]! }
}
