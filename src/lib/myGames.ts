// "My games": one list, newest first, of games played here and games imported by username from
// Chess.com and Lichess. Each row carries where it came from, like a phone's call log.
import * as chesscom from './chesscom'
import { clockLabel } from './clock'
import type { Color } from './evaluation'
import { loadGames, type PlayedGame } from './games'
import { movesInPgn } from './home'
import { levelInfo } from './levels'
import * as lichess from './lichess'
import { gameKey, type CachedReview } from './reviewCache'
import { mainline, treeFromPgn } from './tree'

export type GameSource = 'rookahead' | 'chesscom' | 'lichess'
export type ImportSite = Exclude<GameSource, 'rookahead'>

export const SOURCE_LABEL: Record<GameSource, string> = { rookahead: 'Rookahead', chesscom: 'Chess.com', lichess: 'Lichess' }

export interface MyGame {
  /** The review cache's key for this game. */
  key: string
  source: GameSource
  pgn: string
  white: { name: string; rating?: number }
  black: { name: string; rating?: number }
  /** The side you played. */
  color: Color
  result: 'win' | 'loss' | 'draw'
  /** "10 min", "5 | 3", "1 day". */
  time: string
  moves: number
  /** When it ended (ms). */
  endedAt: number
  opening?: string
}

// ── Imported games, cached on this device (re-fetchable, so not synced) ──

const CACHE_KEY = 'rookahead.imported.v1'
/** How long a fetched list counts as fresh. */
export const FRESH_MS = 5 * 60 * 1000

interface CachedList<G> {
  user: string
  at: number
  games: G[]
}

export interface ImportCache {
  chesscom?: CachedList<chesscom.ChesscomGame>
  lichess?: CachedList<lichess.LichessGame>
}

const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

export function loadImportCache(storage = defaultStorage()): ImportCache {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(CACHE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ImportCache) : {}
  } catch {
    return {}
  }
}

function saveImportCache(cache: ImportCache, storage = defaultStorage()) {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Storage full: the games are fetched again next time.
  }
}

const sameUser = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The cached list for `user`, if it is theirs (a changed username makes it stale). */
export function cachedFor<S extends ImportSite>(cache: ImportCache, site: S, user: string): ImportCache[S] | undefined {
  const entry = cache[site]
  return entry && user && sameUser(entry.user, user) ? entry : undefined
}

export const isFresh = (entry: { at: number } | undefined, now = Date.now()) => !!entry && now - entry.at < FRESH_MS

/** Fetches `user`'s recent games from `site` and caches them. Throws the site's error (unknown player, busy…). */
export async function importGames(site: ImportSite, user: string, storage = defaultStorage()): Promise<void> {
  const name = user.trim()
  const at = Date.now()
  if (site === 'chesscom') {
    const games = await chesscom.fetchRecentGames(name)
    saveImportCache({ ...loadImportCache(storage), chesscom: { user: name, at, games } }, storage)
  } else {
    const games = await lichess.fetchRecentGames(name)
    saveImportCache({ ...loadImportCache(storage), lichess: { user: name, at, games } }, storage)
  }
}

// ── Rows ──

function fromChesscom(g: chesscom.ChesscomGame, user: string): MyGame {
  const color: Color = sameUser(g.white.username, user) ? 'white' : 'black'
  return {
    key: g.url,
    source: 'chesscom',
    pgn: g.pgn,
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    color,
    result: chesscom.outcomeFor(g, user),
    time: chesscom.formatTimeControl(g.timeControl),
    moves: movesInPgn(g.pgn),
    endedAt: g.endTime * 1000,
    opening: g.opening,
  }
}

function fromLichess(g: lichess.LichessGame, user: string): MyGame {
  const color: Color = sameUser(g.white.username, user) ? 'white' : 'black'
  return {
    key: g.url,
    source: 'lichess',
    pgn: g.pgn,
    white: { name: g.white.username, rating: g.white.rating },
    black: { name: g.black.username, rating: g.black.rating },
    color,
    result: lichess.outcomeFor(g, user),
    time: g.timeControl === '-' ? 'Unlimited' : chesscom.formatTimeControl(g.timeControl),
    moves: movesInPgn(g.pgn),
    endedAt: g.endTime * 1000,
    opening: g.opening,
  }
}

// Played games' review keys come from their moves; parsing is the slow part, so each is done once.
const playedKeys = new Map<string, string>()

function playedKey(game: PlayedGame): string {
  let key = playedKeys.get(game.id)
  if (!key) {
    try {
      const { tree, headers } = treeFromPgn(game.pgn)
      key = gameKey(headers, mainline(tree))
    } catch {
      key = `played:${game.id}`
    }
    playedKeys.set(game.id, key)
  }
  return key
}

function fromPlayed(game: PlayedGame): MyGame {
  const computer = { name: `Level ${game.level}`, rating: levelInfo(game.level).rating }
  const you = { name: 'You' }
  return {
    key: playedKey(game),
    source: 'rookahead',
    pgn: game.pgn,
    white: game.color === 'white' ? you : computer,
    black: game.color === 'black' ? you : computer,
    color: game.color,
    result: game.result,
    time: clockLabel(game.clock),
    moves: movesInPgn(game.pgn),
    endedAt: game.endedAt,
  }
}

export interface Usernames {
  chesscom: string
  lichess: string
}

/** Every game, newest first: played here, plus the cached imports of the current usernames. */
export function myGames(users: Usernames, cache: ImportCache, played: PlayedGame[] = loadGames()): MyGame[] {
  const rows = played.map(fromPlayed)
  const cc = cachedFor(cache, 'chesscom', users.chesscom)
  if (cc) rows.push(...cc.games.map((g) => fromChesscom(g, users.chesscom)))
  const li = cachedFor(cache, 'lichess', users.lichess)
  if (li) rows.push(...li.games.map((g) => fromLichess(g, users.lichess)))
  return rows.sort((a, b) => b.endedAt - a.endedAt)
}

// ── Numbers for the stat cards ──

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

export interface GameStats {
  /** Your average accuracy over your last 10 reviewed games. */
  accuracy: number | null
  /** Change against the 10 before them (needs at least 3 of those). */
  trend: number | null
  /** Your Genius moves in games reviewed in the last 7 days. */
  genius: number
  reviewed: number
}

export function gameStats(games: MyGame[], reviews: Record<string, CachedReview>, now = Date.now()): GameStats {
  const mine = games.flatMap((g) => {
    const review = reviews[g.key]
    const accuracy = review?.accuracy[g.color]
    return review ? [{ review, accuracy, color: g.color }] : []
  })
  const accuracies = mine.flatMap((m) => (m.accuracy == null ? [] : [m.accuracy]))
  const last = accuracies.slice(0, 10)
  const before = accuracies.slice(10, 20)
  const weekAgo = now - 7 * 86400000
  return {
    accuracy: last.length ? mean(last) : null,
    trend: last.length && before.length >= 3 ? mean(last) - mean(before) : null,
    genius: mine.filter((m) => m.review.at > weekAgo).reduce((s, m) => s + (m.review.brilliant[m.color] ?? 0), 0),
    reviewed: mine.length,
  }
}

/** "Today", "Yesterday", or "Oct 16" (with the year when it isn't this one): for grouping rows by day. */
export function dayLabel(ms: number, now = new Date()): string {
  const d = new Date(ms)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
}
