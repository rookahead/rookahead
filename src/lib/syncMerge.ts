// Merging a store's copy on this device with the copy in the account, for when both have changed
// (or a guest signs in). Each merge is pure; `null` means that side has nothing yet.
import { GAMES_LIMIT, type PlayedGame } from './games'
import { parseProgress, SEEN_LIMIT, type PuzzleProgress } from './puzzleStore'
import { REVIEWS_LIMIT, type CachedReview } from './reviewCache'
import type { Settings } from './settings'

export type StoreKey = 'settings' | 'puzzles' | 'games' | 'reviews'

/** Every game from both sides, newest first. */
export function mergeGames(local: PlayedGame[] | null, remote: PlayedGame[] | null): PlayedGame[] {
  const byId = new Map<string, PlayedGame>()
  for (const g of [...(remote ?? []), ...(local ?? [])]) byId.set(g.id, g)
  return [...byId.values()].sort((a, b) => b.endedAt - a.endedAt).slice(0, GAMES_LIMIT)
}

/** Every review from both sides; the newer one where both reviewed the same game. */
export function mergeReviews(local: Record<string, CachedReview> | null, remote: Record<string, CachedReview> | null): Record<string, CachedReview> {
  const all: Record<string, CachedReview> = { ...remote }
  for (const [key, entry] of Object.entries(local ?? {})) if (!all[key] || entry.at > all[key].at) all[key] = entry
  const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at)
  return Object.fromEntries(keys.slice(0, REVIEWS_LIMIT).map((k) => [k, all[k]]))
}

const isRecord = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]

function mergeDays(a: PuzzleProgress['days'], b: PuzzleProgress['days']): PuzzleProgress['days'] {
  if (!a || !b) return a ?? b
  const later = a.last > b.last || (a.last === b.last && a.count >= b.count) ? a : b
  return { ...later, best: Math.max(a.best, b.best) }
}

/**
 * The rating line (rating, counts, current streak, prefs) comes whole from the side with more
 * puzzles played; bests take the max, id lists are unioned, and the puzzle on the board stays local.
 */
export function mergePuzzles(local: PuzzleProgress, remote: PuzzleProgress): PuzzleProgress {
  const lead = local.played >= remote.played ? local : remote
  const sprintBest = { ...remote.sprintBest }
  for (const [mode, score] of Object.entries(local.sprintBest) as [keyof typeof sprintBest, number][]) sprintBest[mode] = Math.max(score, sprintBest[mode] ?? 0)
  const daily = !local.daily || !remote.daily ? (local.daily ?? remote.daily) : remote.daily.day > local.daily.day ? remote.daily : local.daily
  return {
    rating: lead.rating,
    played: lead.played,
    solved: lead.solved,
    streak: lead.streak,
    prefs: lead.prefs,
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
    days: mergeDays(local.days, remote.days),
    sprintBest,
    seen: union(remote.seen, local.seen).slice(-SEEN_LIMIT),
    current: local.current,
    daily,
    mistakesSolved: union(remote.mistakesSolved, local.mistakesSolved),
  }
}

/** The side changed more recently wins; the engine choice stays with the device. */
export function mergeSettings(local: Settings, remote: Settings, localAt: number, remoteAt: number): Settings {
  return { ...(localAt > remoteAt ? local : remote), engine: local.engine }
}

/** Merges one store's two copies, as stored (parsed JSON). `localAt`/`remoteAt`: when each last changed. */
export function mergeStore(key: StoreKey, local: unknown, remote: unknown, localAt: number, remoteAt: number): unknown {
  if (local == null) return remote
  if (remote == null) return local
  switch (key) {
    case 'games':
      return mergeGames(Array.isArray(local) ? local : null, Array.isArray(remote) ? remote : null)
    case 'reviews':
      return mergeReviews(isRecord(local) ? (local as Record<string, CachedReview>) : null, isRecord(remote) ? (remote as Record<string, CachedReview>) : null)
    case 'puzzles':
      return mergePuzzles(parseProgress(local), parseProgress(remote))
    case 'settings':
      return mergeSettings(local as Settings, remote as Settings, localAt, remoteAt)
  }
}
