// The My games page's numbers: how your games went, your rating through them, and your games by time control and
// by opening.
import type { Color } from './evaluation'
import { ratingAfter, ratingBefore, samePool } from './homeGames'
import { SOURCE_LABEL, type MyGame } from './myGames'

export interface Results {
  won: number
  drawn: number
  lost: number
}

export function results(games: MyGame[]): Results {
  const r = { won: 0, drawn: 0, lost: 0 }
  for (const g of games) {
    if (g.result === 'win') r.won++
    else if (g.result === 'loss') r.lost++
    else r.drawn++
  }
  return r
}

/** Ratings the line holds at most. */
const RATING_POINTS = 30
const MONTH_MS = 30 * 86400000

export interface RatingLine {
  /** "10 min", with the site when you have games from more than one. */
  label: string
  now: number
  /** Your rating after each of your latest games in that time control, oldest first. */
  points: number[]
  /** How far it moved: in the last 30 days when where it stood then is known, else across the points. */
  change: number
  over: 'month' | 'points'
}

/** Your rating in the time control of your latest rated game: where it stands and how it got there. */
export function ratingLine(games: MyGame[], now = Date.now()): RatingLine | null {
  const latest = games.find((g) => g.source !== 'rookahead' && ratingAfter(g) != null)
  if (!latest) return null
  const pool = games.filter((g) => samePool(g, latest))
  const points = pool.flatMap((g) => ratingAfter(g) ?? []).slice(0, RATING_POINTS).reverse()
  const current = points[points.length - 1]
  // Where it stood 30 days ago: after the last game before then, else before the first game since.
  const before = pool.find((g) => g.endedAt <= now - MONTH_MS)
  const since = pool.filter((g) => g.endedAt > now - MONTH_MS)
  const then = before ? ratingAfter(before) : since.length ? ratingBefore(since[since.length - 1], games) : null
  const label = poolLabel(latest, games)
  return then == null ? { label, now: current, points, change: current - points[0], over: 'points' } : { label, now: current, points, change: current - then, over: 'month' }
}

const poolLabel = (g: MyGame, all: MyGame[]) => (new Set(all.map((x) => x.source)).size > 1 ? `${g.time}, ${SOURCE_LABEL[g.source]}` : g.time)

export interface Group extends Results {
  /** What the list is filtered by when the group is picked. */
  key: string
  label: string
  games: number
  /** Time controls: the site, when you have games from more than one. */
  site?: string
  /** Time controls: your rating after your latest game in it. */
  rating?: number | null
  /** Openings: the side you had. */
  color?: Color
}

/** A game's time control as a group's key: one per site, since each site rates its own. */
export const timeKey = (g: MyGame) => `${g.source}|${g.time}`

/** Your games by time control, most played first. */
export function byTimeControl(games: MyGame[]): Group[] {
  const groups = new Map<string, MyGame[]>()
  for (const g of games) groups.set(timeKey(g), [...(groups.get(timeKey(g)) ?? []), g])
  const sites = new Set(games.map((g) => g.source)).size > 1
  return [...groups]
    .map(([key, list]) => ({
      key,
      label: list[0].time,
      site: sites ? SOURCE_LABEL[list[0].source] : undefined,
      games: list.length,
      rating: ratingAfter(list[0]),
      ...results(list),
    }))
    .sort((a, b) => b.games - a.games)
}

const FAMILY_END = /^(.+?\b(?:Opening|Defen[cs]e|Game|Gambit|Attack|System))\b/

/**
 * An opening's family: "Sicilian Defense: Najdorf Variation" (Lichess) and "Sicilian Defense Najdorf Variation"
 * (Chess.com, from its link) are both "Sicilian Defense".
 */
export function openingFamily(name: string): string {
  const head = name.split(':')[0].trim()
  return FAMILY_END.exec(head)?.[1] ?? head
}

/** A game's opening as a group's key: its family and your side, since a defence you play and one you face aren't the same. */
export const openingKey = (g: MyGame) => (g.opening ? `${openingFamily(g.opening)}|${g.color}` : null)

/** Your most played openings, by family and side. */
export function byOpening(games: MyGame[], top = 6): Group[] {
  const groups = new Map<string, MyGame[]>()
  for (const g of games) {
    const key = openingKey(g)
    if (key) groups.set(key, [...(groups.get(key) ?? []), g])
  }
  // Sorted by games, ties to the one played most recently (the Map keeps first-seen order, newest first).
  return [...groups]
    .map(([key, list]) => ({ key, label: openingFamily(list[0].opening!), color: list[0].color, games: list.length, ...results(list) }))
    .sort((a, b) => b.games - a.games)
    .slice(0, top)
}
