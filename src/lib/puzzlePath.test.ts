import { describe, expect, it } from 'vitest'
import { chapterAt, chapterNeed, puzzlePath, xpFromHistory } from './puzzlePath'

describe('puzzlePath', () => {
  it('starts at the first chapter, with four ahead', () => {
    const { stops, current } = puzzlePath(0)
    expect(current).toBe(0)
    expect(stops.map((s) => s.state)).toEqual(['current', 'ahead', 'ahead', 'ahead', 'ahead'])
  })

  it('moves on a chapter once its XP is earned', () => {
    expect(puzzlePath(99).current).toBe(0)
    const { stops, current } = puzzlePath(100)
    expect(current).toBe(1)
    expect(stops[0].state).toBe('done')
  })
})

describe('chapters by XP', () => {
  it('takes 100 XP for the first chapter, 25 more each after', () => {
    expect([0, 1, 2].map(chapterNeed)).toEqual([100, 125, 150])
  })

  it('says the chapter, the XP in it, and what it takes', () => {
    expect(chapterAt(0)).toEqual({ index: 0, into: 0, need: 100 })
    expect(chapterAt(160)).toEqual({ index: 1, into: 60, need: 125 })
    expect(chapterAt(225)).toEqual({ index: 2, into: 0, need: 150 })
  })

  it('gives progress from before XP a fair start', () => {
    expect(xpFromHistory(10, 15)).toBe(90)
  })
})
