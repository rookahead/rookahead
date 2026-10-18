// Lichess's public API (https://lichess.org/api#tag/Games/operation/apiGamesUser).
// No auth needed and it sends CORS headers, so the browser can call it directly.
import type { Color } from './evaluation'

export interface LichessPlayer {
  username: string
  /** Missing for Lichess's AI and unrated pairings without one. */
  rating?: number
}

export interface LichessGame {
  url: string
  pgn: string
  /** "300+3" like Chess.com's; "1/86400" per day for correspondence; "-" when unlimited. */
  timeControl: string
  /** Seconds, like Chess.com's `end_time`. */
  endTime: number
  rated: boolean
  white: LichessPlayer
  black: LichessPlayer
  /** Absent for a draw. */
  winner?: Color
  opening?: string
}

interface ApiPlayer {
  user?: { name: string; id: string }
  aiLevel?: number
  rating?: number
}

export interface ApiGame {
  id: string
  rated: boolean
  variant: string
  status: string
  lastMoveAt: number
  players: { white: ApiPlayer; black: ApiPlayer }
  winner?: Color
  opening?: { eco: string; name: string }
  clock?: { initial: number; increment: number }
  daysPerTurn?: number
  pgn?: string
}

const API = 'https://lichess.org/api'
/** Standard chess only: variants and games from a set-up position are left out. */
const PERF_TYPES = 'ultraBullet,bullet,blitz,rapid,classical,correspondence'
/** Games that never really started. */
const UNPLAYED = new Set(['created', 'started', 'aborted', 'noStart'])

/** True only for lichess.org itself (or a subdomain), not URLs that merely mention it. */
export function isLichessUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'lichess.org' || host.endsWith('.lichess.org')
  } catch {
    return false
  }
}

function player(p: ApiPlayer): LichessPlayer {
  if (p.user) return { username: p.user.name, rating: p.rating }
  return { username: p.aiLevel ? `Lichess AI level ${p.aiLevel}` : 'Anonymous' }
}

function timeControl(g: ApiGame): string {
  if (g.clock) return `${g.clock.initial}+${g.clock.increment}`
  if (g.daysPerTurn) return `1/${g.daysPerTurn * 86400}`
  return '-'
}

/** One line of the API's ndjson, or null for a game we can't review. */
export function parseGame(g: ApiGame): LichessGame | null {
  if (g.variant !== 'standard' || UNPLAYED.has(g.status) || !g.pgn) return null
  return {
    url: `https://lichess.org/${g.id}`,
    pgn: g.pgn,
    timeControl: timeControl(g),
    endTime: Math.floor(g.lastMoveAt / 1000),
    rated: g.rated,
    white: player(g.players.white),
    black: player(g.players.black),
    winner: g.winner,
    opening: g.opening?.name,
  }
}

/** Most recent standard-chess games, newest first. */
export async function fetchRecentGames(username: string, max = 30): Promise<LichessGame[]> {
  const user = username.trim().toLowerCase()
  if (!user) return []
  const params = new URLSearchParams({ max: String(max), pgnInJson: 'true', opening: 'true', clocks: 'true', perfType: PERF_TYPES })
  const res = await fetch(`${API}/games/user/${encodeURIComponent(user)}?${params}`, { headers: { Accept: 'application/x-ndjson' } })
  if (res.status === 404) throw new Error('No Lichess player with that username.')
  if (res.status === 429) throw new Error('Lichess is busy. Try again in a minute.')
  if (!res.ok) throw new Error(`Lichess returned ${res.status}. Try again in a moment.`)
  const games: LichessGame[] = []
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue
    const game = parseGame(JSON.parse(line) as ApiGame)
    if (game) games.push(game)
  }
  return games
}

/** The game's outcome from `username`'s side. */
export function outcomeFor(game: LichessGame, username: string): 'win' | 'loss' | 'draw' {
  if (!game.winner) return 'draw'
  const meWhite = game.white.username.toLowerCase() === username.trim().toLowerCase()
  return (game.winner === 'white') === meWhite ? 'win' : 'loss'
}
