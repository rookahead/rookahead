import { describe, expect, it } from 'vitest'
import { changeWidget, cleanWidgets, DEFAULT_WIDGETS, moveWidget, swapWidget, targetOf, WIDGET_COUNT, type HomeWidget } from './widgets'
import { tally, tallyToday } from './dailyTally'

describe('cleanWidgets', () => {
  it('falls back to the default row when nothing is saved', () => {
    expect(cleanWidgets(undefined)).toEqual(DEFAULT_WIDGETS)
    expect(cleanWidgets('nonsense')).toEqual(DEFAULT_WIDGETS)
  })

  it('fills a short row from the default row, so there are always five', () => {
    expect(cleanWidgets([])).toEqual(DEFAULT_WIDGETS)
    expect(cleanWidgets([{ id: 'played' }, { id: 'daily' }])).toEqual([{ id: 'played', target: 1 }, { id: 'daily' }, { id: 'reviews', target: 1 }, { id: 'mistakes', target: 3 }, { id: 'rating' }])
  })

  it('drops widgets that were retired, filling their places', () => {
    expect(cleanWidgets([{ id: 'accuracy' }, { id: 'legendary' }, { id: 'rating' }]).map((w) => w.id)).toEqual(['rating', 'reviews', 'mistakes', 'daily', 'phase'])
  })

  it("keeps the rating's speed when it's a real one", () => {
    expect(cleanWidgets([{ id: 'rating', speed: 'blitz' }])[0]).toEqual({ id: 'rating', speed: 'blitz' })
    expect(cleanWidgets([{ id: 'rating', speed: 'turbo' }])[0]).toEqual({ id: 'rating' })
  })

  it('drops unknown and repeated widgets and keeps the order', () => {
    expect(cleanWidgets([{ id: 'rating' }, { id: 'bogus' }, { id: 'daily' }, { id: 'rating' }]).slice(0, 2)).toEqual([{ id: 'rating' }, { id: 'daily' }])
  })

  it('keeps targets inside their range, and only on goals', () => {
    expect(cleanWidgets([{ id: 'reviews', target: 99 }, { id: 'played', target: 0 }, { id: 'mistakes' }, { id: 'phase', target: 4 }, { id: 'rating' }])).toEqual([
      { id: 'reviews', target: 10 },
      { id: 'played', target: 1 },
      { id: 'mistakes', target: 3 },
      { id: 'phase' },
      { id: 'rating' },
    ])
  })

  it('keeps the first five of a longer row', () => {
    const all = ['daily', 'reviews', 'mistakes', 'played', 'rating', 'phase'].map((id) => ({ id }))
    expect(cleanWidgets(all).map((w) => w.id)).toEqual(['daily', 'reviews', 'mistakes', 'played', 'rating'])
    expect(WIDGET_COUNT).toBe(5)
  })
})

describe('swapWidget', () => {
  it('puts the new widget in the old one’s place, a goal at its default target', () => {
    expect(swapWidget(DEFAULT_WIDGETS, 'phase', 'played')[4]).toEqual({ id: 'played', target: 1 })
    expect(swapWidget(DEFAULT_WIDGETS, 'mistakes', 'played').map((w) => w.id)).toEqual(['reviews', 'played', 'rating', 'daily', 'phase'])
  })

  it('changes one widget: a target, or the speed', () => {
    expect(changeWidget(DEFAULT_WIDGETS, 'rating', { speed: 'rapid' })[2]).toEqual({ id: 'rating', speed: 'rapid' })
    expect(changeWidget(DEFAULT_WIDGETS, 'reviews', { target: 4 })[0]).toEqual({ id: 'reviews', target: 4 })
  })

  it('gives a goal without a saved target its default', () => {
    expect(targetOf({ id: 'mistakes' })).toBe(3)
    expect(targetOf({ id: 'reviews', target: 2 })).toBe(2)
  })
})

describe('moveWidget', () => {
  const ids = (row: { id: string }[]) => row.map((w) => w.id)
  const ROW: HomeWidget[] = [{ id: 'daily' }, { id: 'reviews', target: 1 }, { id: 'mistakes', target: 3 }, { id: 'rating' }, { id: 'phase' }]

  it('moves a widget right, the ones it passes closing up', () => {
    expect(ids(moveWidget(ROW, 0, 3))).toEqual(['reviews', 'mistakes', 'rating', 'daily', 'phase'])
  })

  it('moves a widget left, keeping its settings', () => {
    const row = moveWidget(ROW, 2, 0)
    expect(ids(row)).toEqual(['mistakes', 'daily', 'reviews', 'rating', 'phase'])
    expect(row[0]).toEqual({ id: 'mistakes', target: 3 })
  })

  it('leaves the row as it was when dropped where it started', () => {
    expect(moveWidget(ROW, 1, 1)).toEqual(ROW)
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
