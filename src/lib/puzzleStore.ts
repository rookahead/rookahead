// Puzzle progress on this device: the rating, counts, puzzles seen, today's daily and solved mistakes.
import { DIFFICULTY, localDayNumber, newRating, parsePuzzleLine, SPRINT_MODES, type Difficulty, type SprintMode } from './puzzles'
import { XP, xpFromHistory } from './puzzlePath'
import { markChanged, STORE_KEYS } from './syncBus'

/** A run of days in a row: the last day, how long, the longest, and the last fortnight's days. */
export interface DayRun {
  last: number
  count: number
  best: number
  recent?: number[]
}

export interface PuzzleProgress {
  rating: number
  played: number
  solved: number
  /** Rated puzzles solved in a row. */
  streak: number
  /** The longest run of rated puzzles solved in a row. */
  bestStreak: number
  /** Days (UTC day numbers) in a row with at least one puzzle solved, in any mode; `recent` lists the last
   * fortnight's days with a solve, oldest first, for Home's week of dots. */
  days?: DayRun
  /** Days in a row you opened Rookahead (local day numbers, like `days`): Home's streak counter. Kept here so it
   * syncs with the rest of your progress. */
  visits?: DayRun
  /** Mistake puzzles solved today, for Home's plan. */
  today?: { day: number; mistakes: number }
  /** Best Puzzle Sprint score per mode. */
  sprintBest: Partial<Record<SprintMode, number>>
  /** `rated` off: puzzles still count, but your rating stays where it is. */
  prefs: { autoNext: boolean; difficulty: Difficulty; rated: boolean }
  /** Ids of recent rated puzzles, oldest first, so they don't come round again soon. */
  seen: string[]
  /** How much the last rated puzzle moved your rating (the Puzzles front's rated tile); missing until one has. */
  lastChange?: number
  /** The rated puzzle on the board, so a refresh shows it again; `result` once it has counted. */
  current?: { line: string; result?: 'solved' | 'failed'; delta?: number }
  /** Today's daily puzzle, once done. */
  daily?: { day: number; result: 'solved' | 'failed' }
  /** Mistake puzzle ids solved: they leave the queue. */
  mistakesSolved: string[]
  /** XP earned from rated puzzles (puzzlePath.ts): it moves you along the path of chapters. */
  xp: number
  /** The last rated puzzles' results, oldest first (Rated's last ten): solved or not, and how far the rating moved. */
  recent: RatedResult[]
}

export interface RatedResult {
  id: string
  won: boolean
  delta?: number
}

/** How many results `recent` keeps. */
export const RECENT_RESULTS = 10

const KEY = STORE_KEYS.puzzles
export const SEEN_LIMIT = 3000
const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
const count = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function loadProgress(storage = defaultStorage()): PuzzleProgress {
  let parsed: unknown
  try {
    parsed = JSON.parse(storage?.getItem(KEY) ?? '{}')
  } catch {
    // Unreadable: start over.
  }
  return parseProgress(parsed)
}

const parseRun = (v: unknown): DayRun | undefined => {
  const run = v as Partial<DayRun> | null | undefined
  return run && typeof run.last === 'number' && typeof run.count === 'number'
    ? { last: run.last, count: run.count, best: count(run.best, run.count), recent: Array.isArray(run.recent) ? run.recent.filter((d) => typeof d === 'number') : undefined }
    : undefined
}

/** Progress from stored JSON, with anything missing or malformed set to its default. */
export function parseProgress(parsed: unknown): PuzzleProgress {
  const raw = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as Record<string, unknown>
  const current = raw.current as PuzzleProgress['current']
  const daily = raw.daily as PuzzleProgress['daily']
  const today = raw.today as PuzzleProgress['today']
  const prefs = (raw.prefs ?? {}) as Partial<PuzzleProgress['prefs']>
  const sprintBest = (raw.sprintBest ?? {}) as Record<string, unknown>
  return {
    rating: count(raw.rating, 1500),
    played: count(raw.played),
    solved: count(raw.solved),
    streak: count(raw.streak),
    bestStreak: count(raw.bestStreak),
    days: parseRun(raw.days),
    visits: parseRun(raw.visits),
    sprintBest: Object.fromEntries(Object.keys(SPRINT_MODES).flatMap((m) => (typeof sprintBest[m] === 'number' ? [[m, sprintBest[m]]] : []))),
    prefs: { autoNext: prefs.autoNext === true, difficulty: prefs.difficulty && prefs.difficulty in DIFFICULTY ? prefs.difficulty : 'normal', rated: prefs.rated !== false },
    seen: strings(raw.seen),
    current: current && typeof current.line === 'string' ? current : undefined,
    lastChange: typeof raw.lastChange === 'number' ? raw.lastChange : undefined,
    daily: daily && typeof daily.day === 'number' ? daily : undefined,
    mistakesSolved: strings(raw.mistakesSolved),
    today: today && typeof today.day === 'number' ? { day: today.day, mistakes: count(today.mistakes) } : undefined,
    // Progress from before XP starts from what you'd done.
    xp: count(raw.xp, xpFromHistory(count(raw.solved), count(raw.played))),
    recent: Array.isArray(raw.recent)
      ? (raw.recent as Partial<RatedResult>[])
          .filter((r) => r && typeof r.id === 'string' && typeof r.won === 'boolean')
          .map((r) => ({ id: r.id!, won: r.won!, delta: typeof r.delta === 'number' ? r.delta : undefined }))
          .slice(-RECENT_RESULTS)
      : [],
  }
}

export function saveProgress(progress: PuzzleProgress, storage = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(progress))
    markChanged('puzzles', storage)
  } catch {
    // Storage full or unavailable: progress just isn't remembered.
  }
}

/** A new rated puzzle goes on the board. */
export function startRated(progress: PuzzleProgress, line: string): PuzzleProgress {
  const id = line.split(' ')[0]
  return { ...progress, current: { line }, seen: [...progress.seen.filter((s) => s !== id), id].slice(-SEEN_LIMIT) }
}

const RECENT_DAYS = 14

/** A run with `day` in it: one more if it follows the last day, a new run of one after a gap. */
function stepRun(d: DayRun | undefined, day: number): DayRun {
  if (d?.last === day) return d
  const count = d && d.last === day - 1 ? d.count + 1 : 1
  const recent = [...(d?.recent ?? []), day].filter((x) => x > day - RECENT_DAYS)
  return { last: day, count, best: Math.max(count, d?.best ?? 0), recent }
}

/** A puzzle was solved on `day` (a local day): the puzzle streak goes on (or starts again). */
export function recordDay(progress: PuzzleProgress, day: number): PuzzleProgress {
  return progress.days?.last === day ? progress : { ...progress, days: stepRun(progress.days, day) }
}

/** Rookahead was opened on `day` (a local day): the visit streak goes on (or starts again). */
export function recordVisit(progress: PuzzleProgress, day: number): PuzzleProgress {
  return progress.visits?.last === day ? progress : { ...progress, visits: stepRun(progress.visits, day) }
}

/** Notes today's visit in the stored progress, once a day (on opening, and on coming back to the tab). */
export function noteVisit(day = localDayNumber(new Date()), storage = defaultStorage()): void {
  const progress = loadProgress(storage)
  const next = recordVisit(progress, day)
  if (next !== progress) saveProgress(next, storage)
}

/** Days in a row you've opened Rookahead, up to today (0 once a day has been missed). */
export function visitStreak(progress: PuzzleProgress, today: number): number {
  const d = progress.visits
  return d && d.last >= today - 1 ? d.count : 0
}

/** A mistake puzzle solved on `day`: it leaves the queue, counts for today's plan and keeps the streak. */
export function recordMistakeSolved(progress: PuzzleProgress, id: string, day: number): PuzzleProgress {
  const mistakes = (progress.today?.day === day ? progress.today.mistakes : 0) + 1
  return recordDay({ ...progress, mistakesSolved: [...progress.mistakesSolved.filter((x) => x !== id), id], today: { day, mistakes } }, day)
}

/** Whether a puzzle was solved on `day`: inside the current run, or among the fortnight's days. */
export function solvedOn(progress: PuzzleProgress, day: number): boolean {
  const d = progress.days
  return !!d && ((day <= d.last && day > d.last - d.count) || !!d.recent?.includes(day))
}

/** The puzzle streak as of `today` (a local day): still alive until a whole day goes by without a solve. */
export function dayStreak(progress: PuzzleProgress, today: number): number {
  const d = progress.days
  return d && d.last >= today - 1 ? d.count : 0
}

/** A finished sprint: keeps the best score per mode; any solve counts for the puzzle streak. */
export function recordSprint(progress: PuzzleProgress, mode: SprintMode, score: number, day = localDayNumber(new Date()), forBest = true): { progress: PuzzleProgress; newBest: boolean } {
  const newBest = forBest && score > (progress.sprintBest[mode] ?? 0)
  let next = newBest ? { ...progress, sprintBest: { ...progress.sprintBest, [mode]: score } } : progress
  if (score > 0) next = recordDay(next, day)
  return { progress: next, newBest }
}

/** The current rated puzzle's result: counts once (the first wrong move, or the solve). */
export function recordRated(progress: PuzzleProgress, won: boolean, day = localDayNumber(new Date())): PuzzleProgress {
  const current = progress.current
  const puzzle = current && parsePuzzleLine(current.line)
  if (!current || !puzzle || current.result) return progress
  // Unrated: the puzzle counts, the rating doesn't move.
  const rating = progress.prefs.rated ? newRating(progress.rating, puzzle.rating, won, progress.played) : progress.rating
  const streak = won ? progress.streak + 1 : 0
  const delta = progress.prefs.rated ? rating - progress.rating : undefined
  const next = {
    ...progress,
    rating,
    played: progress.played + 1,
    xp: progress.xp + (won ? XP.solve + (puzzle.rating > progress.rating ? XP.harder : 0) : XP.miss),
    solved: progress.solved + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    lastChange: progress.prefs.rated ? rating - progress.rating : progress.lastChange,
    current: { ...current, result: won ? ('solved' as const) : ('failed' as const), delta },
    recent: [...progress.recent, { id: puzzle.id, won, delta }].slice(-RECENT_RESULTS),
  }
  return won ? recordDay(next, day) : next
}
