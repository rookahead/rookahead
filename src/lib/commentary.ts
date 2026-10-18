import { CLASS_INFO, type GameReport, type MoveReview } from './classify'
import type { Color } from './evaluation'
import { moveNumberLabel, type GameTree, type PgnHeaders } from './tree'

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** One-line verdict for a classified move, e.g. "Nxe5 is a blunder". */
export function moveHeadline(san: string, review: MoveReview): string {
  const HEADLINES: Record<MoveReview['cls'], string> = {
    brilliant: 'is genius!',
    great: 'is the only move',
    best: 'is precise',
    excellent: 'is sharp',
    good: 'is solid',
    book: 'is theory',
    inaccuracy: 'is a slip',
    mistake: 'is an error',
    miss: 'is an oversight',
    blunder: 'is a blunder',
    forced: 'is forced',
  }
  return `${san} ${HEADLINES[review.cls]}`
}

/** A second sentence giving context, when there's something useful to say. */
export function moveDetail(review: MoveReview, bestSan?: string): string | undefined {
  switch (review.cls) {
    case 'brilliant':
      return 'A sound sacrifice — the material comes back with interest.'
    case 'great':
      return 'Nothing else holds the position together.'
    case 'miss':
      return bestSan ? `Your opponent slipped, and ${bestSan} would have punished it.` : 'Your opponent slipped, and this lets them off the hook.'
    case 'inaccuracy':
    case 'mistake':
    case 'blunder':
      return bestSan ? `${bestSan} was best.` : undefined
    case 'excellent':
    case 'good':
      return bestSan ? `${bestSan} was slightly stronger.` : undefined
    default:
      return undefined
  }
}

/** A short paragraph summing up the game for the review overview. */
export function gameSummary(report: GameReport, tree: GameTree, headers: PgnHeaders): string {
  const name = (c: Color) => headers[c === 'white' ? 'White' : 'Black'] || (c === 'white' ? 'White' : 'Black')
  const parts: string[] = []

  const result = headers.Result
  const termination = headers.Termination?.match(/ won (by .+)$/)?.[1]
  if (result === '1-0' || result === '0-1') {
    const winner: Color = result === '1-0' ? 'white' : 'black'
    parts.push(`${name(winner)} won${termination ? ` ${termination}` : ''}.`)
  } else if (result === '1/2-1/2') {
    parts.push('The game ended in a draw.')
  }

  // The single most costly move, if it was a real error.
  const worst = Object.values(report.moves)
    .filter((m) => m.cls === 'blunder' || m.cls === 'mistake' || m.cls === 'miss')
    .sort((a, b) => b.loss - a.loss)[0]
  if (worst) {
    const san = tree.nodes[worst.nodeId]?.san
    const label = CLASS_INFO[worst.cls].label.toLowerCase()
    parts.push(`The turning point was ${moveNumberLabel(worst.ply)} ${san}, ${article(label)} ${label} by ${name(worst.color)}.`)
  } else if (Object.keys(report.moves).length > 6) {
    parts.push('A clean game: no real mistakes from either side.')
  }

  const brilliant = Object.values(report.moves).find((m) => m.cls === 'brilliant')
  if (brilliant) parts.push(`Look out for ${moveNumberLabel(brilliant.ply)} ${tree.nodes[brilliant.nodeId]?.san} — genius!`)

  return parts.join(' ') || 'Here’s how the game went.'
}
