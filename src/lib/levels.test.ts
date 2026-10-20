import { describe, expect, it } from 'vitest'
import { LEVELS, levelInfo, searchLimits } from './levels'

describe('levels', () => {
  it('has eight levels of rising strength', () => {
    expect(LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(LEVELS.map((l) => l.rating)).toEqual([400, 700, 1000, 1300, 1600, 1900, 2200, 2600])
  })

  it('lapses less (or less visibly), plays tighter and searches deeper as the level rises', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const [a, b] = [LEVELS[i - 1].style, LEVELS[i].style]
      expect(b.lapse < a.lapse || (b.sight ?? Infinity) < (a.sight ?? Infinity)).toBe(true)
      expect(LEVELS[i].style.noise).toBeLessThanOrEqual(LEVELS[i - 1].style.noise)
      expect(LEVELS[i].depth).toBeGreaterThanOrEqual(LEVELS[i - 1].depth)
    }
  })

  it('falls back to the nearest level', () => {
    expect(levelInfo(0).level).toBe(1)
    expect(levelInfo(12).level).toBe(8)
  })

  it('searches to the level’s depth, for at most 3 seconds without a clock', () => {
    expect(searchLimits(levelInfo(3), null)).toEqual({ depth: levelInfo(3).depth, movetime: 3000 })
    expect(searchLimits(levelInfo(8), 600000)).toEqual({ depth: levelInfo(8).depth, movetime: 3000 })
  })

  it('thinks for at most 3% of its clock, so it can’t lose on time in bullet', () => {
    expect(searchLimits(levelInfo(8), 10000).movetime).toBe(300)
    expect(searchLimits(levelInfo(4), 2000).movetime).toBe(60)
    expect(searchLimits(levelInfo(8), 500).movetime).toBe(50)
  })
})
