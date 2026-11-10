import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGamesSince, isChesscomUrl } from './chesscom'

describe('isChesscomUrl', () => {
  it('accepts Chess.com game links', () => {
    expect(isChesscomUrl('https://www.chess.com/game/live/123')).toBe(true)
    expect(isChesscomUrl('https://chess.com/game/daily/9')).toBe(true)
  })

  it('rejects look-alike hosts (share links can carry any URL)', () => {
    expect(isChesscomUrl('https://evil.example/chess.com')).toBe(false)
    expect(isChesscomUrl('https://chess.com.evil.example/game')).toBe(false)
    expect(isChesscomUrl('https://notchess.com/game')).toBe(false)
    expect(isChesscomUrl('not a url')).toBe(false)
  })
})

describe('fetchGamesSince', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads each month from the one `since` is in to now’s, skipping one with no games', async () => {
    const fetch = vi.fn(async (url: string) => (url.endsWith('/2026/11') ? new Response('', { status: 404 }) : Response.json({ games: [] })))
    vi.stubGlobal('fetch', fetch)
    await fetchGamesSince('Bijoy_V9', Date.UTC(2026, 9, 28), Date.UTC(2026, 10, 2))
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['https://api.chess.com/pub/player/bijoy_v9/games/2026/11', 'https://api.chess.com/pub/player/bijoy_v9/games/2026/10'])
  })

  it('passes other errors on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(fetchGamesSince('x', Date.now())).rejects.toThrow('503')
  })
})
