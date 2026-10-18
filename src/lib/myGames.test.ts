import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChesscomGame } from './chesscom'
import type { PlayedGame } from './games'
import type { LichessGame } from './lichess'
import { cachedFor, dayLabel, FRESH_MS, gameStats, importGames, isFresh, loadImportCache, myGames, type ImportCache, type MyGame } from './myGames'
import type { CachedReview } from './reviewCache'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size
    },
  }
}

const cc: ChesscomGame = {
  url: 'https://www.chess.com/game/live/1',
  pgn: '[Link "https://www.chess.com/game/live/1"]\n\n1. e4 e5 2. Nf3 0-1',
  timeClass: 'rapid',
  timeControl: '600',
  endTime: 3000,
  rated: true,
  white: { username: 'knightowl', rating: 1712, result: 'win' },
  black: { username: 'Bijoy_V9', rating: 1698, result: 'resigned' },
  opening: 'Italian Game',
}

const li: LichessGame = {
  url: 'https://lichess.org/abc',
  pgn: '[Site "https://lichess.org/abc"]\n\n1. d4 d5 1/2-1/2',
  timeControl: '300+3',
  endTime: 2000,
  rated: true,
  white: { username: 'bijoyv9', rating: 1755 },
  black: { username: 'Lichess AI level 3' },
}

const played: PlayedGame = {
  id: 'p1',
  pgn: '[White "You"]\n[Black "Rookahead Level 5"]\n\n1. e4 c5 1-0',
  result: 'win',
  reason: 'resignation',
  color: 'white',
  level: 5,
  clock: '300+3',
  takebacks: 0,
  hints: 0,
  endedAt: 1_000_000,
}

const cache: ImportCache = {
  chesscom: { user: 'bijoy_v9', at: 0, games: [cc] },
  lichess: { user: 'bijoyv9', at: 0, games: [li] },
}

describe('myGames', () => {
  it('merges every source, newest first, from your side', () => {
    const rows = myGames({ chesscom: 'bijoy_v9', lichess: 'BijoyV9' }, cache, [played])
    expect(rows.map((r) => r.source)).toEqual(['chesscom', 'lichess', 'rookahead'])
    const [c, l, p] = rows
    expect(c).toMatchObject({ key: cc.url, color: 'black', result: 'loss', time: '10 min', moves: 2, endedAt: 3_000_000, opening: 'Italian Game' })
    expect(l).toMatchObject({ key: li.url, color: 'white', result: 'draw', time: '5 | 3', black: { name: 'Lichess AI level 3' } })
    expect(p).toMatchObject({ source: 'rookahead', color: 'white', result: 'win', white: { name: 'You' }, black: { name: 'Level 5', rating: 1600 } })
    expect(p.key).toMatch(/^pgn:/)
  })

  it('leaves out a cached list that belongs to another username', () => {
    const rows = myGames({ chesscom: 'someone_else', lichess: '' }, cache, [])
    expect(rows).toEqual([])
    expect(cachedFor(cache, 'chesscom', 'BIJOY_V9')).toBe(cache.chesscom)
  })
})

describe('isFresh', () => {
  it('is fresh for a few minutes', () => {
    expect(isFresh({ at: 1000 }, 1000 + FRESH_MS - 1)).toBe(true)
    expect(isFresh({ at: 1000 }, 1000 + FRESH_MS)).toBe(false)
    expect(isFresh(undefined)).toBe(false)
  })
})

describe('importGames', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('caches what Lichess returns, keeping the other site', async () => {
    const s = memoryStorage()
    s.setItem('rookahead.imported.v1', JSON.stringify({ chesscom: cache.chesscom }))
    const line = JSON.stringify({
      id: 'abc',
      rated: true,
      variant: 'standard',
      status: 'draw',
      lastMoveAt: 2_000_000,
      players: { white: { user: { name: 'bijoyv9', id: 'bijoyv9' }, rating: 1755 }, black: { aiLevel: 3 } },
      clock: { initial: 300, increment: 3 },
      pgn: li.pgn,
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(line + '\n')))
    await importGames('lichess', ' bijoyv9 ', s)
    const saved = loadImportCache(s)
    expect(saved.chesscom).toEqual(cache.chesscom)
    expect(saved.lichess?.user).toBe('bijoyv9')
    expect(saved.lichess?.games[0].url).toBe('https://lichess.org/abc')
  })

  it('passes the site’s error on and caches nothing', async () => {
    const s = memoryStorage()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(importGames('lichess', 'nobody', s)).rejects.toThrow('No Lichess player')
    expect(loadImportCache(s)).toEqual({})
  })
})

describe('gameStats', () => {
  const game = (key: string, color: 'white' | 'black'): MyGame => ({
    key,
    source: 'chesscom',
    pgn: '',
    white: { name: 'a' },
    black: { name: 'b' },
    color,
    result: 'win',
    time: '10 min',
    moves: 30,
    endedAt: 0,
  })
  const review = (white: number, black: number, at: number, genius = 0): CachedReview => ({
    token: 't',
    white: 'a',
    black: 'b',
    accuracy: { white, black },
    brilliant: { white: genius, black: 0 },
    at,
  })

  it('averages your side over the last 10 reviewed and compares with the 10 before', () => {
    const now = 100 * 86400000
    const games = Array.from({ length: 14 }, (_, i) => game(`g${i}`, 'white'))
    const reviews = Object.fromEntries(games.map((g, i) => [g.key, review(i < 10 ? 80 : 70, 10, now - i * 86400000, 1)]))
    const stats = gameStats(games, reviews, now)
    expect(stats.accuracy).toBe(80)
    expect(stats.trend).toBe(10)
    expect(stats.reviewed).toBe(14)
    expect(stats.genius).toBe(7) // reviewed within the last 7 days: days 0–6
  })

  it('reads the side you played and has nothing without reviews', () => {
    expect(gameStats([game('x', 'black')], { x: review(90, 60, 0) }).accuracy).toBe(60)
    expect(gameStats([game('x', 'black')], {})).toEqual({ accuracy: null, trend: null, genius: 0, reviewed: 0 })
  })
})

describe('dayLabel', () => {
  it('says Today, Yesterday, or the date', () => {
    const now = new Date(2026, 9, 18, 21, 0)
    expect(dayLabel(new Date(2026, 9, 18, 1, 0).getTime(), now)).toBe('Today')
    expect(dayLabel(new Date(2026, 9, 17, 23, 0).getTime(), now)).toBe('Yesterday')
    expect(dayLabel(new Date(2026, 9, 15, 12, 0).getTime(), now)).toBe('Oct 15')
    expect(dayLabel(new Date(2025, 11, 31, 12, 0).getTime(), now)).toBe('Dec 31, 2025')
  })
})
