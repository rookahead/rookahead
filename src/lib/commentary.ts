import type { MoveReview } from './classify'

/** One-line verdict for a classified move, e.g. "Nxe5 is a blunder". */
export function moveHeadline(san: string, review: MoveReview): string {
  const HEADLINES: Record<MoveReview['cls'], string> = {
    brilliant: 'is legendary!',
    great: 'is clutch!',
    best: 'is best',
    excellent: 'is strong',
    good: 'is solid',
    book: 'is theory',
    inaccuracy: 'is a slip',
    mistake: 'is a mistake',
    miss: 'is an oversight',
    blunder: 'is a blunder',
    forced: 'is forced',
  }
  return `${san} ${HEADLINES[review.cls]}`
}

/** A second sentence giving context, when there's something useful to say. */
export function moveDetail(review: MoveReview, bestSan?: string): string | undefined {
  const bad = review.cls === 'inaccuracy' || review.cls === 'mistake' || review.cls === 'miss' || review.cls === 'blunder'
  if (review.missedMate && (bad || review.missedMate <= 3)) {
    const mate = `mate in ${review.missedMate}`
    return bestSan ? `${bestSan} had ${mate}.` : `There was ${mate}.`
  }
  if (review.fasterMate) return bestSan ? `${bestSan} mates in ${review.fasterMate}.` : `There was mate in ${review.fasterMate}.`
  // A missed win: winning before, about level or worse after.
  if (bad && review.winBefore >= 80 && review.winAfter <= 60) {
    return bestSan ? `This lets the win slip. ${bestSan} kept it.` : 'This lets the win slip.'
  }
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
    case 'best':
      return review.score.type === 'mate' && review.score.value === 0 ? 'Checkmate.' : 'Nothing on the board beats it.'
    case 'book':
      return 'A well-known opening move.'
    case 'forced':
      return 'The only legal move.'
    default:
      return undefined
  }
}
