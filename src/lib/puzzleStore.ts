// Puzzle progress on this device: the rating, counts, puzzles seen, today's daily and solved mistakes.
import { dayNumber, DIFFICULTY, newRating, parsePuzzleLine, SPRINT_MODES, type Difficulty, type SprintMode } from './puzzles'

export interface PuzzleProgress {
  rating: number
  played: number
  solved: number
  /** Rated puzzles solved in a row. */
  streak: number
  /** The longest run of rated puzzles solved in a row. */
  bestStreak: number
  /** Days (UTC day numbers) in a row with at least one puzzle solved, in any mode. */
  days?: { last: number; count: number; best: number }
  /** Best Puzzle Sprint score per mode. */
  sprintBest: Partial<Record<SprintMode, number>>
  prefs: { autoNext: boolean; difficulty: Difficulty }
  /** Ids of recent rated puzzles, oldest first, so they don't come round again soon. */
  seen: string[]
  /** The rated puzzle on the board, so a refresh shows it again; `result` once it has counted. */
  current?: { line: string; result?: 'solved' | 'failed'; delta?: number }
  /** Today's daily puzzle, once done. */
  daily?: { day: number; result: 'solved' | 'failed' }
  /** Mistake puzzle ids solved: they leave the queue. */
  mistakesSolved: string[]
}

const KEY = 'rookahead.puzzles.v1'
export const SEEN_LIMIT = 3000
const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
const count = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function loadProgress(storage = defaultStorage()): PuzzleProgress {
  let raw: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>
  } catch {
    // Unreadable: start over.
  }
  const current = raw.current as PuzzleProgress['current']
  const daily = raw.daily as PuzzleProgress['daily']
  const days = raw.days as PuzzleProgress['days']
  const prefs = (raw.prefs ?? {}) as Partial<PuzzleProgress['prefs']>
  const sprintBest = (raw.sprintBest ?? {}) as Record<string, unknown>
  return {
    rating: count(raw.rating, 1500),
    played: count(raw.played),
    solved: count(raw.solved),
    streak: count(raw.streak),
    bestStreak: count(raw.bestStreak),
    days: days && typeof days.last === 'number' && typeof days.count === 'number' ? { last: days.last, count: days.count, best: count(days.best, days.count) } : undefined,
    sprintBest: Object.fromEntries(Object.keys(SPRINT_MODES).flatMap((m) => (typeof sprintBest[m] === 'number' ? [[m, sprintBest[m]]] : []))),
    prefs: { autoNext: prefs.autoNext === true, difficulty: prefs.difficulty && prefs.difficulty in DIFFICULTY ? prefs.difficulty : 'normal' },
    seen: strings(raw.seen),
    current: current && typeof current.line === 'string' ? current : undefined,
    daily: daily && typeof daily.day === 'number' ? daily : undefined,
    mistakesSolved: strings(raw.mistakesSolved),
  }
}

export function saveProgress(progress: PuzzleProgress, storage = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Storage full or unavailable: progress just isn't remembered.
  }
}

/** A new rated puzzle goes on the board. */
export function startRated(progress: PuzzleProgress, line: string): PuzzleProgress {
  const id = line.split(' ')[0]
  return { ...progress, current: { line }, seen: [...progress.seen.filter((s) => s !== id), id].slice(-SEEN_LIMIT) }
}

/** A puzzle was solved on `day`: the day streak goes on (or starts again). */
export function recordDay(progress: PuzzleProgress, day: number): PuzzleProgress {
  const d = progress.days
  if (d?.last === day) return progress
  const count = d && d.last === day - 1 ? d.count + 1 : 1
  return { ...progress, days: { last: day, count, best: Math.max(count, d?.best ?? 0) } }
}

/** The day streak as of `today`: still alive until a whole day goes by without a solve. */
export function dayStreak(progress: PuzzleProgress, today: number): number {
  const d = progress.days
  return d && d.last >= today - 1 ? d.count : 0
}

/** A finished sprint: keeps the best score per mode; any solve counts for the day streak. */
export function recordSprint(progress: PuzzleProgress, mode: SprintMode, score: number, day = dayNumber(new Date())): { progress: PuzzleProgress; newBest: boolean } {
  const newBest = score > (progress.sprintBest[mode] ?? 0)
  let next = newBest ? { ...progress, sprintBest: { ...progress.sprintBest, [mode]: score } } : progress
  if (score > 0) next = recordDay(next, day)
  return { progress: next, newBest }
}

/** The current rated puzzle's result: counts once (the first wrong move, or the solve). */
export function recordRated(progress: PuzzleProgress, won: boolean, day = dayNumber(new Date())): PuzzleProgress {
  const current = progress.current
  const puzzle = current && parsePuzzleLine(current.line)
  if (!current || !puzzle || current.result) return progress
  const rating = newRating(progress.rating, puzzle.rating, won, progress.played)
  const streak = won ? progress.streak + 1 : 0
  const next = {
    ...progress,
    rating,
    played: progress.played + 1,
    solved: progress.solved + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    current: { ...current, result: won ? ('solved' as const) : ('failed' as const), delta: rating - progress.rating },
  }
  return won ? recordDay(next, day) : next
}
