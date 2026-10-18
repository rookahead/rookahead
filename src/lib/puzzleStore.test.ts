import { describe, expect, it } from 'vitest'
import { dayStreak, loadProgress, recordDay, recordRated, recordSprint, saveProgress, startRated, SEEN_LIMIT } from './puzzleStore'

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

const LINE = 'XPBtt r3r1k1/pp3p1R/2nb1p2/8/4B1N1/4P3/PP3P2/2K5_b_-_-_0_25 d6e5,g4h6,g8f8,h7f7 1500 mate,mateIn2'

describe('puzzle progress', () => {
  it('starts at 1500 and survives bad data', () => {
    const s = memoryStorage()
    expect(loadProgress(s).rating).toBe(1500)
    s.setItem('rookahead.puzzles.v1', '{nope')
    expect(loadProgress(s)).toMatchObject({ rating: 1500, played: 0, seen: [], mistakesSolved: [] })
    s.setItem('rookahead.puzzles.v1', JSON.stringify({ rating: 'high', seen: 'x' }))
    expect(loadProgress(s)).toMatchObject({ rating: 1500, seen: [] })
  })

  it('saves and loads', () => {
    const s = memoryStorage()
    const p = recordRated(startRated(loadProgress(s), LINE), true)
    saveProgress(p, s)
    expect(loadProgress(s)).toMatchObject({ rating: 1530, played: 1, solved: 1, streak: 1, seen: ['XPBtt'] })
  })

  it('failed puzzle is only counted once', () => {
    const failed = recordRated(startRated(loadProgress(memoryStorage()), LINE), false)
    expect(failed).toMatchObject({ rating: 1470, played: 1, solved: 0, current: { line: LINE, result: 'failed', delta: -30 } })
    expect(recordRated(failed, true)).toEqual(failed)
  })

  it('a fail resets the streak', () => {
    let p = loadProgress(memoryStorage())
    p = recordRated(startRated(p, LINE), true)
    p = recordRated(startRated(p, LINE.replace('XPBtt', 'other')), true)
    expect(p.streak).toBe(2)
    p = recordRated(startRated(p, LINE.replace('XPBtt', 'third')), false)
    expect(p.streak).toBe(0)
  })

  it(`remembers the last ${SEEN_LIMIT} puzzles seen`, () => {
    let p = loadProgress(memoryStorage())
    for (let i = 0; i < SEEN_LIMIT + 5; i++) p = startRated(p, LINE.replace('XPBtt', `p${i}`))
    expect(p.seen).toHaveLength(SEEN_LIMIT)
    expect(p.seen.at(-1)).toBe(`p${SEEN_LIMIT + 4}`)
  })
})

describe('streaks', () => {
  const fresh = () => loadProgress(memoryStorage())

  it('counts days in a row with a solve', () => {
    let p = recordDay(fresh(), 10)
    expect(p.days).toEqual({ last: 10, count: 1, best: 1 })
    p = recordDay(p, 10)
    expect(p.days).toEqual({ last: 10, count: 1, best: 1 })
    p = recordDay(recordDay(p, 11), 12)
    expect(p.days).toEqual({ last: 12, count: 3, best: 3 })
    p = recordDay(p, 15)
    expect(p.days).toEqual({ last: 15, count: 1, best: 3 })
  })

  it('shows a day streak until a whole day is missed', () => {
    const p = recordDay(recordDay(fresh(), 10), 11)
    expect(dayStreak(p, 11)).toBe(2)
    expect(dayStreak(p, 12)).toBe(2)
    expect(dayStreak(p, 13)).toBe(0)
    expect(dayStreak(fresh(), 13)).toBe(0)
  })

  it('a rated solve counts for the day and the best run', () => {
    const p = recordRated(startRated(fresh(), LINE), true, 20)
    expect(p.days?.last).toBe(20)
    expect(p.bestStreak).toBe(1)
    expect(recordRated(startRated(fresh(), LINE), false, 20).days).toBeUndefined()
  })

  it('keeps the best sprint per mode', () => {
    let r = recordSprint(fresh(), '3min', 12, 5)
    expect(r.newBest).toBe(true)
    expect(r.progress.sprintBest['3min']).toBe(12)
    expect(r.progress.days?.last).toBe(5)
    r = recordSprint(r.progress, '3min', 9, 5)
    expect(r.newBest).toBe(false)
    expect(r.progress.sprintBest['3min']).toBe(12)
    expect(recordSprint(fresh(), 'survival', 0, 5)).toMatchObject({ newBest: false, progress: { days: undefined } })
  })

  it('reads prefs with defaults', () => {
    const s = memoryStorage()
    expect(loadProgress(s).prefs).toEqual({ autoNext: false, difficulty: 'normal' })
    s.setItem('rookahead.puzzles.v1', JSON.stringify({ prefs: { autoNext: true, difficulty: 'bogus' } }))
    expect(loadProgress(s).prefs).toEqual({ autoNext: true, difficulty: 'normal' })
  })
})
