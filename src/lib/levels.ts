import type { BotStyle } from './botMove'

// The computer's eight strengths. Each one searches every legal move to its own depth and then chooses
// like a person of that rating would (see botMove.ts): how often it lapses into a mistake or blunder, and
// how loosely it plays the rest. Strong levels play loosely very little: strong players mostly find the
// best move, and a loose level 7 drifted without a plan between lapses. Their lapses are more often a
// mistake than an outright blunder, and only ones that look fine one move deep (`sight`): a 1600 beat
// an earlier level 7 that left a rook en prise with check, which a real 2200 never does. The shape of its errors comes from analysed Lichess games; the levels were
// then set engine-vs-engine so each one scores 70–90% against the one below, and anchored on the old
// Skill Level bots (which players around 1600 found too strong even at level 1–3).
export interface Level {
  level: number
  /** Approximate rating shown to players. */
  rating: number
  style: BotStyle
  /** How deep it searches every legal move. */
  depth: number
  /** Opening moves (plies from the start) it may take from the book. */
  bookPlies: number
  /** Total time (ms) before the computer moves, picked at random in this range. */
  delay: [number, number]
}

export const LEVELS: Level[] = [
  { level: 1, rating: 400, style: { lapse: 0.6, blunderShare: 0.6, noise: 9 }, depth: 2, bookPlies: 6, delay: [600, 1400] },
  { level: 2, rating: 700, style: { lapse: 0.5, blunderShare: 0.55, noise: 7 }, depth: 4, bookPlies: 8, delay: [600, 1400] },
  { level: 3, rating: 1000, style: { lapse: 0.37, blunderShare: 0.5, noise: 6 }, depth: 5, bookPlies: 10, delay: [700, 1600] },
  { level: 4, rating: 1300, style: { lapse: 0.21, blunderShare: 0.45, noise: 5 }, depth: 6, bookPlies: 12, delay: [800, 1800] },
  { level: 5, rating: 1600, style: { lapse: 0.13, blunderShare: 0.45, noise: 3 }, depth: 8, bookPlies: 14, delay: [800, 2000] },
  { level: 6, rating: 1900, style: { lapse: 0.14, blunderShare: 0.35, noise: 2.2, sight: 30 }, depth: 9, bookPlies: 16, delay: [900, 2200] },
  { level: 7, rating: 2200, style: { lapse: 0.11, blunderShare: 0.3, noise: 1.5, sight: 20 }, depth: 10, bookPlies: 18, delay: [1000, 2400] },
  { level: 8, rating: 2600, style: { lapse: 0.07, blunderShare: 0.25, noise: 0.8, sight: 12 }, depth: 12, bookPlies: 20, delay: [1000, 2600] },
]

/** Lines to ask for: every legal move (no position has more than 218). */
export const ALL_MOVES = 256

/** The longest a search may run without a clock, so slow devices still move in time. */
const MAX_THINK_MS = 3000

export function levelInfo(level: number): Level {
  return LEVELS[Math.min(LEVELS.length, Math.max(1, Math.round(level))) - 1]
}

/** The search for one move: the level's depth, kept within 3% of the computer's clock (ms left, if timed). */
export function searchLimits(level: Level, clockMs: number | null): { depth: number; movetime: number } {
  const budget = clockMs === null ? MAX_THINK_MS : Math.min(MAX_THINK_MS, Math.max(50, Math.round(clockMs * 0.03)))
  return { depth: level.depth, movetime: budget }
}
