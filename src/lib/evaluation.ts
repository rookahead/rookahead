import type { Score } from './uci'

export type Color = 'white' | 'black'

/** Flips a side-to-move score so it's always from White's point of view. */
export function toWhitePov(score: Score, turn: Color): Score {
  if (score.type === 'mate' && score.value === 0) return { type: 'mate', value: 0, mated: turn }
  if (turn === 'white') return score
  return score.type === 'cp' ? { type: 'cp', value: -score.value } : { type: 'mate', value: -score.value }
}

/** The White-POV score for a position where `turn` has been checkmated. */
export function checkmatedScore(turn: Color): Score {
  return { type: 'mate', value: 0, mated: turn }
}

/**
 * White's winning chances in [0, 100], from a White-POV score.
 * Uses the logistic model Lichess fitted to real games, so the eval bar moves
 * the way a human would feel the position (+1 matters more than +9 → +10).
 */
export function winPercent(score: Score): number {
  if (score.type === 'mate') {
    if (score.value === 0) return score.mated === 'white' ? 0 : score.mated === 'black' ? 100 : 50
    return score.value > 0 ? 100 : 0
  }
  const cp = Math.max(-1000, Math.min(1000, score.value))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

/** The White-POV score that gives White these winning chances: winPercent's inverse, within ±10 pawns. */
export function scoreForWin(win: number): Score {
  const cp = -Math.log(100 / Math.max(0.01, Math.min(99.99, win)) - 1) / 0.00368208
  return { type: 'cp', value: Math.round(Math.max(-1000, Math.min(1000, cp))) }
}

/** "+1.24", "−0.50", "M3", "−M2", "0.00". Expects a White-POV score. */
export function formatScore(score: Score): string {
  if (score.type === 'mate') {
    if (score.value === 0) return '#'
    return `${score.value < 0 ? '−' : ''}M${Math.abs(score.value)}`
  }
  const pawns = score.value / 100
  if (Math.abs(pawns) < 0.005) return '0.00'
  return `${pawns > 0 ? '+' : '−'}${Math.abs(pawns).toFixed(2)}`
}

/** Short form for the eval bar: "1.2", "M3". */
export function formatScoreShort(score: Score): string {
  if (score.type === 'mate') {
    if (score.value === 0) return score.mated === 'white' ? '0-1' : score.mated === 'black' ? '1-0' : '#'
    return `M${Math.abs(score.value)}`
  }
  const pawns = Math.abs(score.value / 100)
  return pawns >= 10 ? pawns.toFixed(0) : pawns.toFixed(1)
}

/** Which side the score favours (for colouring badges). Draw-ish → null. */
export function favoured(score: Score): Color | null {
  if (score.type === 'mate') {
    if (score.value === 0) return score.mated ? (score.mated === 'white' ? 'black' : 'white') : null
    return score.value > 0 ? 'white' : 'black'
  }
  if (Math.abs(score.value) < 5) return null
  return score.value > 0 ? 'white' : 'black'
}
