// The game a Lichess puzzle comes from, and how often it's been played: from Lichess's puzzle API (no token).
import type { Color } from './evaluation'
import type { Speed } from './speed'

export interface PuzzlePlayer {
  name: string
  rating?: number
  title?: string
  color: Color
}

export interface PuzzleGame {
  /** "15+15". */
  clock: string
  speed: Speed
  /** Lichess's name for the speed: "Classical". */
  perf: string
  players: PuzzlePlayer[]
  /** Times the puzzle has been played on Lichess. */
  plays: number
}

const API = 'https://lichess.org/api/puzzle/'

/** Lichess's speeds as the game list draws them: ultra bullet with bullet, correspondence as daily. */
const SPEEDS: Record<string, Speed> = { ultraBullet: 'bullet', bullet: 'bullet', blitz: 'blitz', rapid: 'rapid', classical: 'classical', correspondence: 'daily' }

/** The answer's game and plays, or null when it isn't shaped as expected. */
export function parsePuzzleGame(json: unknown): PuzzleGame | null {
  const j = json as { game?: { clock?: unknown; perf?: { key?: unknown; name?: unknown }; players?: unknown }; puzzle?: { plays?: unknown } } | null
  const game = j?.game
  const plays = j?.puzzle?.plays
  if (!game || typeof game.clock !== 'string' || typeof plays !== 'number' || !Array.isArray(game.players)) return null
  const players = (game.players as Record<string, unknown>[])
    .filter((p) => p && typeof p.name === 'string' && (p.color === 'white' || p.color === 'black'))
    .map((p) => ({
      name: p.name as string,
      color: p.color as Color,
      rating: typeof p.rating === 'number' ? p.rating : undefined,
      title: typeof p.title === 'string' ? p.title : undefined,
    }))
    // White first, as a game is written.
    .sort((a, b) => (a.color === b.color ? 0 : a.color === 'white' ? -1 : 1))
  if (players.length !== 2) return null
  const key = typeof game.perf?.key === 'string' ? game.perf.key : ''
  return {
    clock: game.clock,
    speed: SPEEDS[key] ?? 'untimed',
    perf: typeof game.perf?.name === 'string' ? game.perf.name : '',
    players,
    plays,
  }
}

/** After Lichess says "too many requests", the page leaves it alone this long. */
const BACK_OFF_MS = 5 * 60_000
let pausedUntil = 0
const cache = new Map<string, Promise<PuzzleGame | null>>()

/** The puzzle's game: asked once per puzzle; null when Lichess can't say (offline, too many requests). */
export function puzzleGame(id: string): Promise<PuzzleGame | null> {
  const known = cache.get(id)
  if (known) return known
  if (Date.now() < pausedUntil) return Promise.resolve(null)
  const asked = fetch(API + encodeURIComponent(id))
    .then((res) => {
      if (res.status === 429) pausedUntil = Date.now() + BACK_OFF_MS
      return res.ok ? res.json().then(parsePuzzleGame) : null
    })
    .catch(() => null)
    .then((game) => {
      // A miss can be asked again later; an answer is kept.
      if (!game) cache.delete(id)
      return game
    })
  cache.set(id, asked)
  return asked
}
