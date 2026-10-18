// Chess.com's public API (https://www.chess.com/news/view/published-data-api).
// No auth needed and it sends CORS headers, so the browser can call it directly.

export interface ChesscomPlayer {
  username: string
  rating: number
  result: string
}

export interface ChesscomGame {
  url: string
  pgn: string
  timeClass: string
  timeControl: string
  endTime: number
  rated: boolean
  white: ChesscomPlayer
  black: ChesscomPlayer
  opening?: string
}

interface ApiGame {
  url: string
  pgn?: string
  time_class: string
  time_control: string
  end_time: number
  rated: boolean
  rules: string
  white: { username: string; rating: number; result: string }
  black: { username: string; rating: number; result: string }
  eco?: string
}

const API = 'https://api.chess.com/pub'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (res.status === 404) throw new Error('No Chess.com player with that username.')
  if (!res.ok) throw new Error(`Chess.com returned ${res.status}. Try again in a moment.`)
  return res.json() as Promise<T>
}

/** "https://www.chess.com/openings/Italian-Game-Two-Knights-Defense" → "Italian Game Two Knights Defense" */
/** True only for chess.com itself (or a subdomain), not URLs that merely mention it. */
export function isChesscomUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'chess.com' || host.endsWith('.chess.com')
  } catch {
    return false
  }
}

export function openingFromEcoUrl(url?: string): string | undefined {
  const slug = url?.split('/openings/')[1]
  if (!slug) return undefined
  // Slugs often continue with the moves played: "...-Variation...9.Nc3-Bg7" or "...-Defense-2.Nf3".
  const name = decodeURIComponent(slug).split(/\.{3}\d|-\d/)[0]
  return name.replace(/-/g, ' ').trim() || undefined
}

/** Most recent standard-chess games, newest first. Reads back month by month until it has `min` games. */
export async function fetchRecentGames(username: string, min = 30, maxMonths = 3): Promise<ChesscomGame[]> {
  const user = username.trim().toLowerCase()
  if (!user) return []
  const { archives } = await getJson<{ archives: string[] }>(`${API}/player/${encodeURIComponent(user)}/games/archives`)
  const games: ChesscomGame[] = []
  for (const archive of archives.slice(-maxMonths).reverse()) {
    const { games: month } = await getJson<{ games: ApiGame[] }>(archive)
    for (const g of month.reverse()) {
      if (g.rules !== 'chess' || !g.pgn) continue
      games.push({
        url: g.url,
        pgn: g.pgn,
        timeClass: g.time_class,
        timeControl: g.time_control,
        endTime: g.end_time,
        rated: g.rated,
        white: g.white,
        black: g.black,
        opening: openingFromEcoUrl(g.eco),
      })
    }
    if (games.length >= min) break
  }
  return games
}

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'])

/** The game's outcome from `username`'s side. */
export function outcomeFor(game: ChesscomGame, username: string): 'win' | 'loss' | 'draw' {
  const me = game.white.username.toLowerCase() === username.toLowerCase() ? game.white : game.black
  if (me.result === 'win') return 'win'
  return DRAW_RESULTS.has(me.result) ? 'draw' : 'loss'
}

/** "600" → "10 min", "180+2" → "3 | 2", "1/86400" → "1 day". */
export function formatTimeControl(tc: string): string {
  if (tc.includes('/')) {
    const days = Math.round(Number(tc.split('/')[1]) / 86400)
    return `${days} day${days === 1 ? '' : 's'}`
  }
  const [base, inc] = tc.split('+').map(Number)
  const minutes = base / 60
  const label = minutes >= 1 ? `${+minutes.toFixed(1)}` : `${base}s`
  if (inc) return `${label} | ${inc}`
  return minutes >= 1 ? `${label} min` : label
}
