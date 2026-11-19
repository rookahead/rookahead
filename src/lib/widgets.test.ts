import { describe, expect, it } from 'vitest'
import { cleanWidgets, DEFAULT_WIDGETS, MAX_WIDGETS, targetOf } from './widgets'
import { tally, tallyToday } from './dailyTally'

describe('cleanWidgets', () => {
  it('falls back to the default row when nothing is saved', () => {
    expect(cleanWidgets(undefined)).toEqual(DEFAULT_WIDGETS)
    expect(cleanWidgets('nonsense')).toEqual(DEFAULT_WIDGETS)
  })

  it('keeps an empty row empty', () => {
    expect(cleanWidgets([])).toEqual([])
  })

  it('drops unknown and repeated widgets and keeps the order', () => {
    expect(cleanWidgets([{ id: 'rating' }, { id: 'bogus' }, { id: 'daily' }, { id: 'rating' }])).toEqual([{ id: 'rating' }, { id: 'daily' }])
  })

  it('keeps targets inside their range, and only on goals', () => {
    expect(cleanWidgets([{ id: 'reviews', target: 99 }, { id: 'puzzles', target: 0 }, { id: 'mistakes' }, { id: 'accuracy', target: 4 }])).toEqual([
      { id: 'reviews', target: 10 },
      { id: 'puzzles', target: 1 },
      { id: 'mistakes', target: 3 },
      { id: 'accuracy' },
    ])
  })

  it('holds two rows at most', () => {
    const all = ['daily', 'reviews', 'mistakes', 'played', 'puzzles', 'accuracy', 'rating', 'legendary', 'phase', 'puzzleRating'].map((id) => ({ id }))
    expect(cleanWidgets([...all, ...all])).toHaveLength(MAX_WIDGETS)
  })

  it('gives a goal without a saved target its default', () => {
    expect(targetOf({ id: 'puzzles' })).toBe(5)
    expect(targetOf({ id: 'reviews', target: 2 })).toBe(2)
  })
})

describe('tally', () => {
  const store = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage
  }

  it('counts today and starts again tomorrow', () => {
    const s = store()
    const today = new Date(2026, 10, 19, 10)
    tally('review', s, today)
    tally('review', s, today)
    tally('puzzle', s, today)
    expect(tallyToday('review', s, today)).toBe(2)
    expect(tallyToday('puzzle', s, today)).toBe(1)
    expect(tallyToday('review', s, new Date(2026, 10, 20, 9))).toBe(0)
  })
})
