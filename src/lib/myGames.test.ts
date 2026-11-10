import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChesscomGame } from './chesscom'
import type { PlayedGame } from './games'
import type { LichessGame } from './lichess'
import { cachedFor, dayLabel, finalPosition, FRESH_MS, FULL_MS, gameStats, importGames, isFresh, loadImportCache, myGames, type ImportCache, type MyGame } from './myGames'
import { mainline, treeFromPgn } from './tree'
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

  it('tops up a Chess.com list read in full from the latest month alone, newest first', async () => {
    const s = memoryStorage()
    const now = Date.now()
    const old = { ...cc, url: 'https://www.chess.com/game/live/0', endTime: 1000 }
    s.setItem('rookahead.imported.v1', JSON.stringify({ chesscom: { user: 'Bijoy_V9', at: now - 2 * FRESH_MS, fullAt: now - 60_000, games: [cc, old] } }))
    const api = (g: ChesscomGame) => ({ ...g, rules: 'chess', time_class: g.timeClass, time_control: g.timeControl, end_time: g.endTime })
    const newer = { ...cc, url: 'https://www.chess.com/game/live/2', endTime: 4000 }
    const fetch = vi.fn(async (_url: string) => Response.json({ games: [api(cc), api(newer)] }))
    vi.stubGlobal('fetch', fetch)
    await importGames('chesscom', 'bijoy_v9', s)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toMatch(/\/player\/bijoy_v9\/games\/\d{4}\/\d{2}$/)
    const saved = loadImportCache(s).chesscom!
    expect(saved.games.map((g) => g.url)).toEqual([newer.url, cc.url, old.url])
    expect(saved.fullAt).toBe(now - 60_000)
  })

  it('reads a Chess.com list in full when it is due one', async () => {
    const s = memoryStorage()
    s.setItem('rookahead.imported.v1', JSON.stringify({ chesscom: { user: 'Bijoy_V9', at: 0, fullAt: Date.now() - FULL_MS, games: [cc] } }))
    const fetch = vi.fn(async (url: string) => Response.json(url.endsWith('/archives') ? { archives: [] } : { games: [] }))
    vi.stubGlobal('fetch', fetch)
    await importGames('chesscom', 'bijoy_v9', s)
    expect(fetch.mock.calls[0][0]).toMatch(/\/archives$/)
    expect(loadImportCache(s).chesscom?.games).toEqual([])
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
  const review = (white: number, black: number, at: number, legendary = 0): CachedReview => ({
    token: 't',
    white: 'a',
    black: 'b',
    accuracy: { white, black },
    brilliant: { white: legendary, black: 0 },
    at,
  })

  it('averages your side over the last 10 reviewed and compares with the 10 before', () => {
    const now = 100 * 86400000
    const games = Array.from({ length: 14 }, (_, i) => ({ ...game(`g${i}`, 'white'), endedAt: now - i * 86400000 - 1000 }))
    const reviews = Object.fromEntries(games.map((g, i) => [g.key, review(i < 10 ? 80 : 70, 10, now - i * 86400000, 1)]))
    const stats = gameStats(games, reviews, now)
    expect(stats.accuracy).toBe(80)
    expect(stats.trend).toBe(10)
    expect(stats.reviewed).toBe(14)
    expect(stats.legendary).toBe(7) // played within the last 7 days: days 0–6
    expect(stats.recent).toHaveLength(10)
    expect(stats.legendaryAll).toBe(14) // in every reviewed game, for the Legendary moves page
  })

  it('reads the side you played and has nothing without reviews', () => {
    expect(gameStats([game('x', 'black')], { x: review(90, 60, 0) }).accuracy).toBe(60)
    expect(gameStats([game('x', 'black')], {})).toEqual({ accuracy: null, trend: null, legendary: 0, legendaryAll: 0, reviewed: 0, recent: [] })
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

describe('gameStats, the week', () => {
  const now = 100 * 86400000
  const game = (key: string, endedAt: number) => ({ key, source: 'chesscom', color: 'white', endedAt }) as MyGame
  const saved = (at: number, legendary: number) => ({ accuracy: { white: 80, black: 80 }, brilliant: { white: legendary, black: 0 }, at }) as CachedReview

  it('counts Legendary moves by when the game was played, not when its review was last saved', () => {
    const games = [game('new', now - 86400000), game('old', now - 60 * 86400000)]
    // Grading a review again under new rules saves it again, however old the game.
    const reviews = { new: saved(now - 3600000, 1), old: saved(now - 3600000, 3) }
    const stats = gameStats(games, reviews, now)
    expect(stats.legendary).toBe(1)
    expect(stats.legendaryAll).toBe(4)
  })
})

describe('finalPosition', () => {
  const game = (pgn: string, key: string) => ({ source: 'chesscom', key, pgn }) as MyGame
  const viaTree = (pgn: string) => {
    const line = mainline(treeFromPgn(pgn).tree)
    const last = line[line.length - 1]
    return { fen: last.fen, lastMove: last.uci ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : undefined }
  }
  const pgns: [string, string][] = [
    ['clock comments', '[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:09:58.1]} 1... e5 {[%clk 0:09:57]} 2. Qh5 {[%clk 0:09:50]} Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'],
    ['a promotion', '[Result "*"]\n\n1. a4 b5 2. axb5 a6 3. bxa6 Bb7 4. axb7 Nc6 5. bxa8=N *'],
    ['a set-up position', '[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n[SetUp "1"]\n[Result "*"]\n\n1. a8=Q+ Kd7 *'],
    ['side lines', '[Result "*"]\n\n1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *'],
    ['no moves', '[White "a"]\n[Result "*"]\n\n*'],
  ]
  for (const [name, pgn] of pgns) {
    it(`matches a full replay with ${name}`, () => {
      expect(finalPosition(game(pgn, name))).toEqual(viaTree(pgn))
    })
  }

  it('has nothing to show for a game it cannot read', () => {
    expect(finalPosition(game('1. e4 e5 2. Ke7', 'broken'))).toBeNull()
  })
})

describe('dayLabel on a long list', () => {
  it('formats a year of games quickly', () => {
    const now = new Date(2026, 9, 18, 12)
    const started = performance.now()
    for (let i = 0; i < 5000; i++) dayLabel(now.getTime() - i * 3600000 * 2, now)
    expect(performance.now() - started).toBeLessThan(150)
  })
})
