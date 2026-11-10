// "My games": one list, newest first, of games played here and games imported by username from
// Chess.com and Lichess. Each row carries where it came from, like a phone's call log.
import { Chess } from 'chess.js'
import * as chesscom from './chesscom'
import { clockLabel } from './clock'
import type { Color } from './evaluation'
import { loadGames, type PlayedGame } from './games'
import { movesInPgn } from './home'
import { levelInfo } from './levels'
import * as lichess from './lichess'
import { lichessNow } from './lichessAuth'
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
/** How long a fetched list counts as fresh: coming back sooner doesn't ask the site again. */
export const FRESH_MS = 60 * 1000
/** How often the Chess.com list is read in full; in between, only the latest month is, and added to it. */
export const FULL_MS = 12 * 60 * 60 * 1000

interface CachedList<G> {
  user: string
  at: number
  /** When the list was last read in full (a list from before this was kept has none). */
  fullAt?: number
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

/** Newest first, each game once (the newer copy wins). */
function merged(newer: chesscom.ChesscomGame[], older: chesscom.ChesscomGame[]): chesscom.ChesscomGame[] {
  const seen = new Set(newer.map((g) => g.url))
  return [...newer, ...older.filter((g) => !seen.has(g.url))].sort((a, b) => b.endTime - a.endTime)
}

/**
 * Fetches `user`'s recent games from `site` and caches them. Throws the site's error (unknown player, busy…).
 * Chess.com's list, once read in full, is topped up from the latest month alone until it's due a full read: the
 * full one asks for the list of months and can read a whole month before (megabytes, for someone who plays a lot).
 */
export async function importGames(site: ImportSite, user: string, storage = defaultStorage()): Promise<void> {
  const name = user.trim()
  const at = Date.now()
  if (site === 'chesscom') {
    const had = cachedFor(loadImportCache(storage), 'chesscom', name)
    const entry =
      had?.fullAt && at - had.fullAt < FULL_MS
        ? { user: name, at, fullAt: had.fullAt, games: merged(await chesscom.fetchGamesSince(name, had.at, at), had.games) }
        : { user: name, at, fullAt: at, games: await chesscom.fetchRecentGames(name) }
    saveImportCache({ ...loadImportCache(storage), chesscom: entry }, storage)
  } else {
    // Lichess sends you your own games faster when it knows it's you.
    const link = lichessNow()
    const token = link && sameUser(link.username, name) ? link.token : undefined
    const games = await lichess.fetchRecentGames(name, undefined, token)
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
  /** Your Legendary moves in games played in the last 7 days. */
  legendary: number
  /** Your Legendary moves in all your reviewed games: the Legendary moves page. */
  legendaryAll: number
  reviewed: number
  /** Your accuracy in your last 10 reviewed games, oldest first (for a trend line). */
  recent: number[]
}

export function gameStats(games: MyGame[], reviews: Record<string, CachedReview>, now = Date.now()): GameStats {
  const mine = games.flatMap((g) => {
    const review = reviews[g.key]
    const accuracy = review?.accuracy[g.color]
    return review ? [{ key: g.key, review, accuracy, color: g.color, endedAt: g.endedAt }] : []
  })
  const accuracies = mine.flatMap((m) => (m.accuracy == null ? [] : [m.accuracy]))
  const last = accuracies.slice(0, 10)
  const before = accuracies.slice(10, 20)
  const weekAgo = now - 7 * 86400000
  // By when the game was played, like the Legendary moves page: a review's own date moves when it's graded again.
  const thisWeek = mine.filter((m) => m.endedAt >= weekAgo)
  return {
    accuracy: last.length ? mean(last) : null,
    trend: last.length && before.length >= 3 ? mean(last) - mean(before) : null,
    legendary: thisWeek.reduce((s, m) => s + (m.review.brilliant[m.color] ?? 0), 0),
    legendaryAll: mine.reduce((s, m) => s + (m.review.brilliant[m.color] ?? 0), 0),
    reviewed: mine.length,
    recent: [...last].reverse(),
  }
}

// One of each: making a formatter is the slow part of formatting a date, and a list of games asks hundreds of times.
const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const LONG_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** "Today", "Yesterday", or "Oct 16" (with the year when it isn't this one): for grouping rows by day. */
export function dayLabel(ms: number, now = new Date()): string {
  const d = new Date(ms)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return (d.getFullYear() === now.getFullYear() ? SHORT_DATE : LONG_DATE).format(d)
}

// Each game's final position, worked out once. Reading the PGN is the slow part of drawing a row, so it stops at
// the last position instead of building the whole game's tree: a list opens with dozens of these at a time.
const finals = new Map<string, { fen: string; lastMove?: [string, string] } | null>()

/** Where the game ended, and its last move, for a small board picture. */
export function finalPosition(game: MyGame): { fen: string; lastMove?: [string, string] } | null {
  const id = `${game.source}:${game.key}`
  if (!finals.has(id)) {
    try {
      const chess = new Chess()
      chess.loadPgn(game.pgn.trim())
      const fen = chess.fen()
      const last = chess.undo()
      finals.set(id, { fen, lastMove: last ? [last.from, last.to] : undefined })
    } catch {
      finals.set(id, null)
    }
  }
  return finals.get(id)!
}
