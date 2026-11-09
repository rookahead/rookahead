import { lichessNow, lichessTokenRefused } from './lichessAuth'

// Lichess's opening explorer (https://lichess.org/api#tag/Opening-Explorer): for a position, the moves played
// from it and how those games ended, from masters' games or from rated games on Lichess. It wants a signed-in
// player, so it's asked with your Lichess connection (lichessAuth.ts).

const API = 'https://explorer.lichess.ovh'

export type ExplorerSource = 'masters' | 'lichess'

export interface ExplorerMove {
  uci: string
  san: string
  white: number
  draws: number
  black: number
  /** Their average rating, in these games. */
  rating: number | null
}

export interface ExplorerResult {
  opening: { eco: string; name: string } | null
  white: number
  draws: number
  black: number
  moves: ExplorerMove[]
}

export type ExplorerAnswer = { ok: ExplorerResult } | { error: 'connect' | 'busy' | 'offline' }

/** Games on Lichess: the speeds and ratings most club players would compare themselves with. */
const LICHESS_QUERY = { speeds: 'blitz,rapid,classical', ratings: '1600,1800,2000,2200,2500' }
const MOVES = 12

const cache = new Map<string, ExplorerResult>()
const CACHE_MAX = 300

/** The games total of a move or position. */
export const total = (r: { white: number; draws: number; black: number }) => r.white + r.draws + r.black

function read(raw: unknown): ExplorerResult {
  const r = (raw ?? {}) as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const opening = r.opening && typeof r.opening === 'object' ? (r.opening as Record<string, unknown>) : null
  return {
    opening: opening && typeof opening.name === 'string' ? { eco: String(opening.eco ?? ''), name: opening.name } : null,
    white: n(r.white),
    draws: n(r.draws),
    black: n(r.black),
    moves: (Array.isArray(r.moves) ? r.moves : [])
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object' && typeof (m as Record<string, unknown>).uci === 'string')
      .map((m) => ({ uci: String(m.uci), san: String(m.san ?? m.uci), white: n(m.white), draws: n(m.draws), black: n(m.black), rating: typeof m.averageRating === 'number' ? m.averageRating : null })),
  }
}

/** The explorer's answer for a position (by FEN), from cache when it's been asked before. */
export async function explore(source: ExplorerSource, fen: string, signal?: AbortSignal): Promise<ExplorerAnswer> {
  const link = lichessNow()
  if (!link) return { error: 'connect' }
  const key = `${source} ${fen}`
  const hit = cache.get(key)
  if (hit) return { ok: hit }
  const params = new URLSearchParams({ fen, moves: String(MOVES), topGames: '0', ...(source === 'lichess' ? { recentGames: '0', ...LICHESS_QUERY } : {}) })
  try {
    const res = await fetch(`${API}/${source}?${params}`, { headers: { Authorization: `Bearer ${link.token}` }, signal })
    if (res.status === 401) {
      lichessTokenRefused()
      return { error: 'connect' }
    }
    if (res.status === 429) return { error: 'busy' }
    if (!res.ok) return { error: 'offline' }
    const result = read(await res.json())
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
    cache.set(key, result)
    return { ok: result }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    return { error: 'offline' }
  }
}
