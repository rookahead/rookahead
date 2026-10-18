import { describe, expect, it } from 'vitest'
import { clearLiveGame, DEFAULT_SETUP, loadLiveGame, loadSetup, saveLiveGame, saveSetup, type LiveGame } from './playStore'

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

const live: LiveGame = {
  id: 'g1',
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  color: 'white',
  setup: { level: 4, color: 'random', clock: '600+5' },
  moves: ['e2e4'],
  clock: { white: 590000, black: 600000, running: 'black', since: null, increment: 5000 },
  takebacks: 1,
  hints: 0,
  outcome: null,
  startedAt: 1,
  saved: false,
}

describe('play store', () => {
  it('remembers the last setup, with a default', () => {
    const s = memoryStorage()
    expect(loadSetup(s)).toEqual(DEFAULT_SETUP)
    saveSetup({ level: 6, color: 'black', clock: 'none' }, s)
    expect(loadSetup(s)).toEqual({ level: 6, color: 'black', clock: 'none' })
  })

  it('keeps the game in progress until cleared', () => {
    const s = memoryStorage()
    expect(loadLiveGame(s)).toBeNull()
    saveLiveGame(live, s)
    expect(loadLiveGame(s)).toEqual(live)
    clearLiveGame(s)
    expect(loadLiveGame(s)).toBeNull()
  })

  it('never brings back a finished game: Play opens on a fresh setup', () => {
    const s = memoryStorage()
    saveLiveGame({ ...live, outcome: { result: '0-1', reason: 'resignation' }, saved: true }, s)
    expect(loadLiveGame(s)).toBeNull()
  })

  it('ignores corrupt data', () => {
    const s = memoryStorage()
    s.setItem('rookahead.play.v1', '{bad')
    s.setItem('rookahead.playSetup.v1', '{"level":"x"}')
    expect(loadLiveGame(s)).toBeNull()
    expect(loadSetup(s)).toEqual(DEFAULT_SETUP)
  })
})
