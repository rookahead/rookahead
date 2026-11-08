// The profile page's numbers: your games sorted into ratings the way each site rates them (one per speed: Blitz,
// Rapid…), each rating's line through your games, and how your games in it went.
import type { Color } from './evaluation'
import { ratingAfter } from './homeGames'
import type { GameSource, MyGame } from './myGames'

export type Speed = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily'

export const SPEED_LABEL: Record<Speed, string> = {
  ultrabullet: 'UltraBullet',
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  daily: 'Daily',
}

/** A PGN tag's value, or undefined when the game doesn't have it. */
const tag = (pgn: string, name: string) => new RegExp(`\\[${name} "([^"]*)"\\]`).exec(pgn)?.[1]

/**
 * The speed a site rates the game under, from its time control: both sites guess a game's length as the base time
 * plus 40 moves' increment, and cut it in different places. Correspondence and unlimited games are Daily. Games
 * played here aren't rated, so they have none.
 */
export function speedOf(game: MyGame): Speed | null {
  if (game.source === 'rookahead') return null
  const control = tag(game.pgn, 'TimeControl')
  if (!control || control === '-' || control.includes('/')) return 'daily'
  const [base, inc = '0'] = control.split('+')
  const length = Number(base) + 40 * Number(inc)
  if (!Number.isFinite(length)) return null
  if (game.source === 'chesscom') return length < 180 ? 'bullet' : length < 600 ? 'blitz' : 'rapid'
  if (length < 30) return 'ultrabullet'
  if (length < 180) return 'bullet'
  if (length < 480) return 'blitz'
  if (length < 1500) return 'rapid'
  return 'classical'
}

export interface RatingPoint {
  at: number
  rating: number
}

/** One rating of yours on a site, or your games against the computer here (which have no rating). */
export interface Perf {
  /** "lichess:blitz", "chesscom:rapid", "computer". */
  id: string
  source: GameSource
  label: string
  /** Newest first. */
  games: MyGame[]
  /** Your rating after your latest rated game in it. */
  rating: number | null
  /** Your rating after each rated game, oldest first. */
  points: RatingPoint[]
}

/** The ratings you have on `source`, most played first; for Rookahead, your games against the computer. */
export function perfsFor(games: MyGame[], source: GameSource): Perf[] {
  const mine = games.filter((g) => g.source === source)
  if (source === 'rookahead') return mine.length ? [{ id: 'computer', source, label: 'Computer', games: mine, rating: null, points: [] }] : []
  const groups = new Map<Speed, MyGame[]>()
  for (const g of mine) {
    const speed = speedOf(g)
    if (speed) groups.set(speed, [...(groups.get(speed) ?? []), g])
  }
  return [...groups]
    .map(([speed, list]) => {
      const points = ratingPoints(list)
      return { id: `${source}:${speed}`, source, label: SPEED_LABEL[speed], games: list, rating: points.length ? points[points.length - 1].rating : null, points }
    })
    .sort((a, b) => b.games.length - a.games.length)
}

/** Your rating after each of these games that has one, oldest first. */
export function ratingPoints(games: MyGame[]): RatingPoint[] {
  return games.flatMap((g) => {
    const rating = ratingAfter(g)
    return rating == null ? [] : [{ at: g.endedAt, rating }]
  }).reverse()
}

export interface Results {
  games: number
  won: number
  drawn: number
  lost: number
}

function results(games: MyGame[]): Results {
  const r = { games: games.length, won: 0, drawn: 0, lost: 0 }
  for (const g of games) {
    if (g.result === 'win') r.won++
    else if (g.result === 'loss') r.lost++
    else r.drawn++
  }
  return r
}

export interface PerfStats {
  results: Record<'all' | Color, Results>
  /** Your highest rating among these games, and when. */
  highest: RatingPoint | null
  lowest: RatingPoint | null
  /** The highest-rated player you beat. */
  bestWin: { name: string; rating: number; at: number } | null
  winStreak: number
  lossStreak: number
  /** Your opponents' average rating: in all your games, and in the ones you won, drew and lost. */
  opponents: Record<'all' | MyGame['result'], number | null>
}

const opponentOf = (g: MyGame) => (g.color === 'white' ? g.black : g.white)

function average(games: MyGame[]): number | null {
  const ratings = games.flatMap((g) => opponentOf(g).rating ?? [])
  return ratings.length ? Math.round(ratings.reduce((s, r) => s + r, 0) / ratings.length) : null
}

/** Longest run of games in a row with this result, oldest to newest. */
function longestRun(games: MyGame[], result: MyGame['result']): number {
  let best = 0
  let run = 0
  for (const g of games) {
    run = g.result === result ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

export function perfStats(perf: Perf): PerfStats {
  const { games, points } = perf
  let bestWin: PerfStats['bestWin'] = null
  for (const g of games) {
    const them = opponentOf(g)
    if (g.result === 'win' && them.rating != null && (!bestWin || them.rating > bestWin.rating)) bestWin = { name: them.name, rating: them.rating, at: g.endedAt }
  }
  const oldestFirst = [...games].reverse()
  return {
    results: { all: results(games), white: results(games.filter((g) => g.color === 'white')), black: results(games.filter((g) => g.color === 'black')) },
    highest: points.reduce<RatingPoint | null>((best, p) => (!best || p.rating > best.rating ? p : best), null),
    lowest: points.reduce<RatingPoint | null>((low, p) => (!low || p.rating < low.rating ? p : low), null),
    bestWin,
    winStreak: longestRun(oldestFirst, 'win'),
    lossStreak: longestRun(oldestFirst, 'loss'),
    opponents: {
      all: average(games),
      win: average(games.filter((g) => g.result === 'win')),
      draw: average(games.filter((g) => g.result === 'draw')),
      loss: average(games.filter((g) => g.result === 'loss')),
    },
  }
}
