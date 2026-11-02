// Phones' puzzle path (the Puzzles tab): a line of chapters worked out from the rated puzzles you've played, so
// nothing new is stored. Each chapter is five rated puzzles.

/** Rated puzzles in a chapter. */
export const PER_STOP = 5

export interface Stop {
  index: number
  state: 'done' | 'current' | 'ahead'
  /** The chapter you're on: puzzles played in it so far. */
  inStop?: number
}

/** The path from the rated puzzles you've played: every chapter so far, the one you're on, and a few ahead. */
export function puzzlePath(played: number, ahead = 4): { stops: Stop[]; current: number } {
  const current = Math.floor(played / PER_STOP)
  const stops: Stop[] = []
  for (let i = 0; i <= current + ahead; i++) {
    const state = i < current ? 'done' : i === current ? 'current' : 'ahead'
    stops.push({ index: i, state, inStop: state === 'current' ? played % PER_STOP : undefined })
  }
  return { stops, current }
}
