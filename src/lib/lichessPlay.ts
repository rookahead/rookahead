import { DEFAULT_POSITION } from 'chess.js'
import { standardMoves } from './cloudEval'
import { lichessNow, lichessTokenRefused } from './lichessAuth'

// Online play through Lichess's Board API (https://lichess.org/api#tag/Board): a game against a real player,
// found and played on lichess.org with your Lichess account, shown on Rookahead's board. Lichess pairs board
// players only at rapid and classical speeds. Engine help is forbidden, so nothing here asks the engine.

const API = 'https://lichess.org/api'

/** The time controls you can be paired at: minutes + increment seconds. Rapid and classical only (Lichess's rule). */
export const ONLINE_CLOCKS = [
  { group: 'Rapid', clocks: ['10+0', '10+5', '15+10'] },
  { group: 'Classical', clocks: ['30+0', '30+20'] },
] as const
export type OnlineClock = (typeof ONLINE_CLOCKS)[number]['clocks'][number]
export const isOnlineClock = (v: unknown): v is OnlineClock => ONLINE_CLOCKS.some((g) => (g.clocks as readonly string[]).includes(v as string))

export type Side = 'white' | 'black'

export interface OnlinePlayer {
  name: string
  rating: number | null
  title: string | null
}

/** A game's fixed facts (gameFull) and its current state. */
export interface OnlineGame {
  id: string
  white: OnlinePlayer
  black: OnlinePlayer
  rated: boolean
  /** Starting clock, ms, and increment, ms. */
  initial: number
  increment: number
  state: OnlineState
}

export interface OnlineState {
  /** UCI moves from the start. */
  moves: string[]
  /** Each side's clock as Lichess last sent it, ms, and when it arrived here (so the running one can tick). */
  wtime: number
  btime: number
  at: number
  status: string
  winner: Side | null
  /** A draw offered by this side, waiting for an answer. */
  drawOffer: Side | null
}

/** Lichess statuses for a game still being played. */
export const LIVE_STATUSES = new Set(['created', 'started'])

function token(): string | null {
  return lichessNow()?.token ?? null
}

/**
 * Reads a Lichess ndjson stream (one JSON object a line; blank lines keep it alive) until it ends or `signal` stops
 * it. Resolves with the HTTP status when it ends.
 */
async function stream(url: string, init: RequestInit, onLine: (line: Record<string, unknown>) => void, signal: AbortSignal, onData?: () => void): Promise<number> {
  const t = token()
  if (!t) return 401
  const res = await fetch(url, { ...init, signal, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}`, Accept: 'application/x-ndjson' } })
  if (res.status === 401) lichessTokenRefused()
  if (!res.ok || !res.body) return res.status
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    // Anything at all, keep-alive newlines included: the connection is still there.
    onData?.()
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      try {
        onLine(JSON.parse(line))
      } catch {
        // A line that isn't JSON: skip it.
      }
    }
  }
  return res.status
}

async function post(path: string, body?: Record<string, string>): Promise<boolean> {
  const t = token()
  if (!t) return false
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? new URLSearchParams(body) : undefined,
    })
    if (res.status === 401) lichessTokenRefused()
    return res.ok
  } catch {
    return false
  }
}

/** A game of yours Lichess says has started: its id and your colour. */
export interface StartedGame {
  id: string
  color: Side
}

function startedFrom(line: Record<string, unknown>): StartedGame | null {
  if (line.type !== 'gameStart') return null
  const g = line.game as Record<string, unknown> | undefined
  const compat = g?.compat as Record<string, unknown> | undefined
  // Only a game the Board API can play (not, say, a blitz game you have open on lichess.org).
  if (!g || typeof g.gameId !== 'string' || compat?.board === false) return null
  return { id: g.gameId, color: g.color === 'black' ? 'black' : 'white' }
}

/**
 * Finds you an opponent: listens for your games starting, then asks Lichess to pair you at this time control.
 * Resolves with the game once it starts, or null if the seek ended without one (cancelled with `signal`, or
 * expired). A board game of yours already being played resolves at once, so a reload goes back to it.
 */
export async function seek(clock: OnlineClock, rated: boolean, signal: AbortSignal): Promise<StartedGame | null | 'refused'> {
  const [minutes, increment] = clock.split('+')
  const stop = new AbortController()
  const end = () => stop.abort()
  signal.addEventListener('abort', end)
  let found: StartedGame | null = null
  let refused = false
  // Lichess's advice: the event stream first, then the seek, so a game that starts at once isn't missed.
  const events = stream(
    `${API}/stream/event`,
    {},
    (line) => {
      const g = startedFrom(line)
      if (g && !found) {
        found = g
        end()
      }
    },
    stop.signal,
  ).catch(() => 0)
  // A moment for the event stream to open (and report a game already going) before seeking.
  await new Promise((r) => setTimeout(r, 400))
  if (!stop.signal.aborted) {
    const status = await stream(`${API}/board/seek`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ time: minutes, increment, rated: String(rated), variant: 'standard' }) }, () => {}, stop.signal).catch(() => 0)
    if (status === 400 || status === 401 || status === 403) refused = true
    // The seek stream closes when someone joins: the game's start comes on the event stream a moment later.
    if (!stop.signal.aborted && !refused) await Promise.race([events, new Promise((r) => setTimeout(r, 3000))])
  }
  end()
  signal.removeEventListener('abort', end)
  await events
  return found ?? (refused ? 'refused' : null)
}

const player = (raw: unknown): OnlinePlayer => {
  const p = (raw ?? {}) as Record<string, unknown>
  return {
    name: typeof p.name === 'string' ? p.name : typeof p.id === 'string' ? p.id : p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous',
    rating: typeof p.rating === 'number' ? p.rating : null,
    title: typeof p.title === 'string' ? p.title : null,
  }
}

function stateFrom(raw: Record<string, unknown>, at: number): OnlineState {
  const n = (v: unknown) => (typeof v === 'number' ? v : 0)
  // Castling comes as the king taking its rook (e1h1): the board wants the king's own move, for a king only.
  const moves = typeof raw.moves === 'string' && raw.moves ? standardMoves(DEFAULT_POSITION, raw.moves) : []
  return {
    moves,
    wtime: n(raw.wtime),
    btime: n(raw.btime),
    at,
    status: typeof raw.status === 'string' ? raw.status : 'started',
    winner: raw.winner === 'white' || raw.winner === 'black' ? raw.winner : null,
    drawOffer: raw.wdraw ? 'white' : raw.bdraw ? 'black' : null,
  }
}

/** Sends your move. Resolves with null once Lichess has it, else Lichess's reason (or a connection problem). */
export async function sendMove(id: string, uci: string): Promise<string | null> {
  const t = token()
  if (!t) return 'Your Lichess connection ended.'
  try {
    const res = await fetch(`${API}/board/game/${id}/move/${uci}`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) return null
    if (res.status === 401) lichessTokenRefused()
    const body = (await res.json().catch(() => ({}))) as { error?: unknown }
    return typeof body.error === 'string' ? body.error : `Lichess answered ${res.status}`
  } catch {
    return 'Couldn’t reach Lichess.'
  }
}

export interface GameStreamHandlers {
  onGame: (game: OnlineGame) => void
  onState: (state: OnlineState) => void
  /** The opponent left; you can claim the win after this many seconds (null: they're back). */
  onGone: (claimInSeconds: number | null) => void
  /** Anything arrived, keep-alives included (a quiet connection may have died). */
  onAlive?: () => void
}

/** Follows a game until it ends (or `signal` stops it). Resolves with the HTTP status. */
export function followGame(id: string, handlers: GameStreamHandlers, signal: AbortSignal): Promise<number> {
  return stream(
    `${API}/board/game/stream/${id}`,
    {},
    (line) => {
      const at = Date.now()
      if (line.type === 'gameFull') {
        const clock = (line.clock ?? {}) as Record<string, unknown>
        handlers.onGame({
          id,
          white: player(line.white),
          black: player(line.black),
          rated: line.rated === true,
          initial: typeof clock.initial === 'number' ? clock.initial : 0,
          increment: typeof clock.increment === 'number' ? clock.increment : 0,
          state: stateFrom((line.state ?? {}) as Record<string, unknown>, at),
        })
      } else if (line.type === 'gameState') handlers.onState(stateFrom(line, at))
      else if (line.type === 'opponentGone') handlers.onGone(line.gone === true && typeof line.claimWinInSeconds === 'number' ? line.claimWinInSeconds : null)
    },
    signal,
    handlers.onAlive,
  )
}

export const resign = (id: string) => post(`/board/game/${id}/resign`)
export const abort = (id: string) => post(`/board/game/${id}/abort`)
export const answerDraw = (id: string, yes: boolean) => post(`/board/game/${id}/draw/${yes ? 'yes' : 'no'}`)
export const claimVictory = (id: string) => post(`/board/game/${id}/claim-victory`)

/** The finished game's PGN, with its clocks, for the review. */
export async function gamePgn(id: string): Promise<string | null> {
  try {
    const t = token()
    const res = await fetch(`https://lichess.org/game/export/${id}?clocks=true&evals=false&literate=false`, { headers: { Accept: 'application/x-chess-pgn', ...(t ? { Authorization: `Bearer ${t}` } : {}) } })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/** Who's to move after `moves` (standard start). */
export const sideToMove = (moves: string[]): Side => (moves.length % 2 === 0 ? 'white' : 'black')

/**
 * Each side's clock now, ms: the side to move loses the time since Lichess's last word (clocks run once both
 * sides have moved, and only while the game is on).
 */
export function clockNow(state: OnlineState, now: number): { white: number; black: number } {
  const running = LIVE_STATUSES.has(state.status) && state.moves.length >= 2 ? sideToMove(state.moves) : null
  const spent = running ? Math.max(0, now - state.at) : 0
  return { white: state.wtime - (running === 'white' ? spent : 0), black: state.btime - (running === 'black' ? spent : 0) }
}

/** How a finished game ended, in a few words, from your side. */
export function endText(state: OnlineState, you: Side): string {
  const s = state.status
  if (s === 'aborted' || s === 'noStart') return 'Game aborted'
  const won = state.winner === you
  const how: Record<string, string> = { mate: 'by checkmate', resign: 'by resignation', outoftime: 'on time', timeout: 'by timeout', cheat: '(fair-play)' }
  if (!state.winner) return s === 'stalemate' ? 'Draw by stalemate' : 'Draw'
  return `${won ? 'You won' : 'You lost'} ${how[s] ?? ''}`.trim()
}

/** A challenge Lichess tells you about: from your opponent asking for a rematch, say. */
export interface IncomingChallenge {
  id: string
  from: string
  /** The game it's a rematch of, if it is one. */
  rematchOf: string | null
}

export interface EventHandlers {
  onGameStart: (game: StartedGame) => void
  onChallenge: (challenge: IncomingChallenge) => void
  /** A challenge to you was withdrawn (or one of yours was declined). */
  onChallengeGone: (id: string) => void
}

/** Follows the events reaching your account (games starting, challenges) until `signal` stops it. */
export function watchEvents(handlers: EventHandlers, signal: AbortSignal): Promise<number> {
  return stream(
    `${API}/stream/event`,
    {},
    (line) => {
      const started = startedFrom(line)
      if (started) return handlers.onGameStart(started)
      const c = line.challenge as Record<string, unknown> | undefined
      if (!c || typeof c.id !== 'string') return
      if (line.type === 'challenge' && c.direction === 'in') {
        const from = (c.challenger as Record<string, unknown> | undefined)?.name
        handlers.onChallenge({ id: c.id, from: typeof from === 'string' ? from : 'Your opponent', rematchOf: typeof c.rematchOf === 'string' ? c.rematchOf : null })
      } else if (line.type === 'challengeCanceled' || line.type === 'challengeDeclined') handlers.onChallengeGone(c.id)
    },
    signal,
  )
}

/**
 * A rematch: a challenge to the same opponent at the same clock, colours swapped. It stays open while `signal`
 * does (Lichess's keep-alive), and resolves with how it ended: accepted (the game's start comes on the event
 * stream), declined, cancelled, or 'failed' when Lichess turned it down outright.
 */
export async function challenge(opponent: string, game: { initial: number; increment: number; rated: boolean }, color: Side, signal: AbortSignal): Promise<string> {
  let done = 'canceled'
  const status = await stream(
    `${API}/challenge/${encodeURIComponent(opponent)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'clock.limit': String(Math.round(game.initial / 1000)), 'clock.increment': String(Math.round(game.increment / 1000)), rated: String(game.rated), color, variant: 'standard', keepAliveStream: 'true' }),
    },
    (line) => {
      if (typeof line.done === 'string') done = line.done
    },
    signal,
  ).catch((e: Error) => (e.name === 'AbortError' ? 200 : 0))
  return status >= 200 && status < 300 ? done : 'failed'
}

export const acceptChallenge = (id: string) => post(`/challenge/${id}/accept`)
export const declineChallenge = (id: string) => post(`/challenge/${id}/decline`)

/** What an opponent's Lichess account says about them: enough to spot a brand-new (or flagged) account. */
export interface PlayerFacts {
  name: string
  title: string | null
  url: string
  createdAt: number
  /** Rated games, all speeds. */
  rated: number
  /** Their rating at this game's speed, and whether Lichess still calls it provisional ("?"). */
  rating: number | null
  provisional: boolean
  speedGames: number
  /** Two-letter country code, if they set one. */
  country: string | null
  /** Lichess has marked the account for breaking its rules. */
  marked: boolean
}

/** Rapid or classical, from the game's clock (Lichess's own split: 25 minutes estimated, 40 moves). */
export const speedOf = (initialMs: number, incrementMs: number): 'rapid' | 'classical' => (initialMs / 1000 + (40 * incrementMs) / 1000 >= 1500 ? 'classical' : 'rapid')

/** A player's public Lichess account (no sign-in needed); null when it can't be read. */
export async function playerFacts(name: string, speed: 'rapid' | 'classical'): Promise<PlayerFacts | null> {
  try {
    const res = await fetch(`${API}/user/${encodeURIComponent(name)}`)
    if (!res.ok) return null
    const u = (await res.json()) as Record<string, any>
    const perf = u.perfs?.[speed] ?? {}
    const flag = typeof u.profile?.flag === 'string' && /^[A-Z]{2}$/.test(u.profile.flag) ? u.profile.flag : null
    return {
      name: u.username ?? name,
      title: typeof u.title === 'string' ? u.title : null,
      url: typeof u.url === 'string' ? u.url : `https://lichess.org/@/${name}`,
      createdAt: typeof u.createdAt === 'number' ? u.createdAt : 0,
      rated: typeof u.count?.rated === 'number' ? u.count.rated : 0,
      rating: typeof perf.rating === 'number' ? perf.rating : null,
      provisional: perf.prov === true,
      speedGames: typeof perf.games === 'number' ? perf.games : 0,
      country: flag,
      marked: u.tosViolation === true,
    }
  } catch {
    return null
  }
}

/** An account this young is worth a look (many fair-play bans hit accounts in their first weeks). */
export const NEW_ACCOUNT_DAYS = 30

/** The game you're playing, kept so a reload goes back to it. */
const LIVE_KEY = 'rookahead.online'

export function loadLiveOnline(): StartedGame | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LIVE_KEY) ?? 'null')
    return raw && typeof raw.id === 'string' && (raw.color === 'white' || raw.color === 'black') ? raw : null
  } catch {
    return null
  }
}

export function saveLiveOnline(game: StartedGame | null) {
  try {
    if (game) localStorage.setItem(LIVE_KEY, JSON.stringify(game))
    else localStorage.removeItem(LIVE_KEY)
  } catch {
    // Not kept past this visit.
  }
}
