// The computer's eight strengths: Stockfish's Skill Level (which picks weaker moves on purpose) with a
// search that grows with it. The Elo limiter isn't used: at these short think times UCI_Elo 1320–1600 came
// out weaker than skill 6 at depth 4. Calibrated engine-vs-engine: each level scores 5/6 or better
// against the one below.
export interface Level {
  level: number
  /** Approximate rating shown to players. */
  rating: number
  strength: { skill?: number; elo?: number }
  depth?: number
  movetime?: number
  /** Total time (ms) before the computer moves, picked at random in this range. */
  delay: [number, number]
}

export const LEVELS: Level[] = [
  { level: 1, rating: 400, strength: { skill: 0 }, depth: 1, delay: [600, 1400] },
  { level: 2, rating: 700, strength: { skill: 2 }, depth: 2, delay: [600, 1400] },
  { level: 3, rating: 1000, strength: { skill: 4 }, depth: 3, delay: [700, 1600] },
  { level: 4, rating: 1300, strength: { skill: 6 }, depth: 5, delay: [800, 1800] },
  { level: 5, rating: 1600, strength: { skill: 9 }, movetime: 400, delay: [800, 2000] },
  { level: 6, rating: 1900, strength: { skill: 12 }, movetime: 500, delay: [900, 2200] },
  { level: 7, rating: 2200, strength: { skill: 16 }, movetime: 700, delay: [1000, 2400] },
  { level: 8, rating: 2600, strength: { skill: 20 }, movetime: 900, delay: [1000, 2600] },
]

export function levelInfo(level: number): Level {
  return LEVELS[Math.min(LEVELS.length, Math.max(1, Math.round(level))) - 1]
}

/** The search for one move: the level's own limits, kept within 3% of the computer's clock (ms left, if timed). */
export function searchLimits(level: Level, clockMs: number | null): { depth?: number; movetime?: number } {
  const budget = clockMs === null ? Infinity : Math.max(50, Math.round(clockMs * 0.03))
  // Shallow depth-limited searches are quick; they only need a cap once the clock runs low.
  const movetime = level.movetime ? Math.min(level.movetime, budget) : budget < 1000 ? budget : undefined
  return { depth: level.depth, movetime }
}
