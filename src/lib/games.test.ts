import { describe, expect, it } from 'vitest'
import { loadGames, saveGame, type PlayedGame } from './games'

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

const game = (id: string, endedAt: number): PlayedGame => ({ id, pgn: '*', result: 'win', reason: 'checkmate', color: 'white', level: 3, clock: 'none', takebacks: 0, hints: 0, endedAt })

describe('games store', () => {
  it('lists games newest first', () => {
    const s = memoryStorage()
    saveGame(game('a', 1), s)
    saveGame(game('b', 2), s)
    expect(loadGames(s).map((g) => g.id)).toEqual(['b', 'a'])
  })

  it('keeps the newest 200', () => {
    const s = memoryStorage()
    for (let i = 0; i < 205; i++) saveGame(game(`g${i}`, i), s)
    const all = loadGames(s)
    expect(all).toHaveLength(200)
    expect(all.at(-1)!.id).toBe('g5')
  })

  it('replaces a game saved twice', () => {
    const s = memoryStorage()
    saveGame(game('a', 1), s)
    saveGame({ ...game('a', 1), hints: 2 }, s)
    expect(loadGames(s)).toEqual([{ ...game('a', 1), hints: 2 }])
  })

  it('survives corrupt or broken storage', () => {
    const s = memoryStorage()
    s.setItem('rookahead.games.v1', '{nope')
    expect(loadGames(s)).toEqual([])
    const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } } as unknown as Storage
    expect(loadGames(broken)).toEqual([])
    expect(() => saveGame(game('a', 1), broken)).not.toThrow()
  })
})
