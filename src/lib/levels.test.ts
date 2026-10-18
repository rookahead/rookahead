import { describe, expect, it } from 'vitest'
import { LEVELS, levelInfo, searchLimits } from './levels'

describe('levels', () => {
  it('has eight levels of rising strength', () => {
    expect(LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(LEVELS.map((l) => l.rating)).toEqual([400, 700, 1000, 1300, 1600, 1900, 2200, 2600])
  })

  it('climbs Stockfish skill level, calibrated so each level beats the one below', () => {
    expect(LEVELS.map((l) => l.strength.skill)).toEqual([0, 2, 4, 6, 9, 12, 16, 20])
    expect(LEVELS.every((l) => l.strength.elo === undefined)).toBe(true)
    expect(levelInfo(1)).toMatchObject({ depth: 1 })
    expect(levelInfo(4)).toMatchObject({ depth: 5 })
    expect(levelInfo(5)).toMatchObject({ movetime: 400 })
    expect(levelInfo(8)).toMatchObject({ movetime: 900 })
  })

  it('falls back to the nearest level', () => {
    expect(levelInfo(0).level).toBe(1)
    expect(levelInfo(12).level).toBe(8)
  })

  it('searches at the level’s own limits without a clock, or with plenty of time', () => {
    expect(searchLimits(levelInfo(3), null)).toEqual({ depth: 3, movetime: undefined })
    expect(searchLimits(levelInfo(8), 600000)).toEqual({ depth: undefined, movetime: 900 })
  })

  it('thinks for at most 3% of its clock, so it can’t lose on time in bullet', () => {
    expect(searchLimits(levelInfo(8), 10000)).toEqual({ depth: undefined, movetime: 300 })
    expect(searchLimits(levelInfo(4), 2000)).toEqual({ depth: 5, movetime: 60 })
    expect(searchLimits(levelInfo(8), 500)).toEqual({ depth: undefined, movetime: 50 })
  })
})
