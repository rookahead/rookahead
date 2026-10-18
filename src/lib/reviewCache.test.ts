import { describe, expect, it } from 'vitest'
import { gameKey, loadReviews, saveReview, type CachedReview } from './reviewCache'
import { addLine, createTree, mainline, ROOT_ID } from './tree'

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

const entry = (at: number): CachedReview => ({
  token: '1.abc',
  white: 'A',
  black: 'B',
  accuracy: { white: 90, black: 80 },
  brilliant: { white: 1, black: 0 },
  at,
})

describe('review cache', () => {
  it('saves and loads entries', () => {
    const s = memoryStorage()
    saveReview('k1', entry(1), s)
    expect(loadReviews(s)).toEqual({ k1: entry(1) })
  })

  it('keeps at most 300 entries, dropping the oldest', () => {
    const s = memoryStorage()
    for (let i = 0; i < 301; i++) saveReview(`k${i}`, entry(1000 + i), s)
    const all = loadReviews(s)
    expect(Object.keys(all)).toHaveLength(300)
    expect(all.k0).toBeUndefined()
    expect(all.k300).toBeDefined()
  })

  it('treats corrupt storage as empty', () => {
    const s = memoryStorage()
    s.setItem('rookahead.reviews.v1', '{oops')
    expect(loadReviews(s)).toEqual({})
    saveReview('k', entry(1), s)
    expect(Object.keys(loadReviews(s))).toEqual(['k'])
  })

  it('never throws when storage does', () => {
    const broken = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') } } as unknown as Storage
    expect(loadReviews(broken)).toEqual({})
    expect(() => saveReview('k', entry(1), broken)).not.toThrow()
  })
})

describe('gameKey', () => {
  const line = mainline(addLine(createTree(), ROOT_ID, ['e2e4', 'e7e5']).tree)

  it('uses the Chess.com game link', () => {
    expect(gameKey({ Link: 'https://www.chess.com/game/live/123' }, line)).toBe('https://www.chess.com/game/live/123')
  })

  it('hashes the moves otherwise, the same for the same moves', () => {
    const k = gameKey({ Link: 'https://evil.example/x' }, line)
    expect(k).toMatch(/^pgn:[0-9a-f]{8}$/)
    expect(gameKey({}, mainline(addLine(createTree(), ROOT_ID, ['e2e4', 'e7e5']).tree))).toBe(k)
    expect(gameKey({}, mainline(addLine(createTree(), ROOT_ID, ['d2d4']).tree))).not.toBe(k)
  })
})
