import { describe, expect, it } from 'vitest'
import type { PlayedGame } from './games'
import type { PuzzleProgress } from './puzzleStore'
import type { CachedReview } from './reviewCache'
import { DEFAULT_SETTINGS } from './settings'
import { mergeGames, mergePuzzles, mergeReviews, mergeSettings, mergeStore } from './syncMerge'

const game = (id: string, endedAt: number) => ({ id, endedAt, pgn: '' }) as PlayedGame
const review = (at: number, token = 't'): CachedReview => ({ token, white: 'A', black: 'B', accuracy: { white: 1, black: 2 }, brilliant: { white: 0, black: 0 }, at })
const progress = (p: Partial<PuzzleProgress>): PuzzleProgress => ({
  rating: 1500,
  played: 0,
  solved: 0,
  streak: 0,
  bestStreak: 0,
  sprintBest: {},
  prefs: { autoNext: false, difficulty: 'normal' },
  seen: [],
  mistakesSolved: [],
  ...p,
})

describe('mergeGames', () => {
  it('unions by id, newest first', () => {
    const merged = mergeGames([game('a', 3), game('b', 1)], [game('c', 2), game('a', 3)])
    expect(merged.map((g) => g.id)).toEqual(['a', 'c', 'b'])
  })

  it('keeps 200', () => {
    const many = Array.from({ length: 150 }, (_, i) => game(`l${i}`, i))
    const more = Array.from({ length: 150 }, (_, i) => game(`r${i}`, 1000 + i))
    expect(mergeGames(many, more)).toHaveLength(200)
    expect(mergeGames(many, more)[0].id).toBe('r149')
  })

  it('treats missing sides as empty', () => {
    expect(mergeGames(null, [game('a', 1)]).map((g) => g.id)).toEqual(['a'])
  })
})

describe('mergeReviews', () => {
  it('unions by key and keeps the newer entry', () => {
    const merged = mergeReviews({ x: review(1, 'old'), y: review(5) }, { x: review(2, 'new'), z: review(3) })
    expect(Object.keys(merged).sort()).toEqual(['x', 'y', 'z'])
    expect(merged.x.token).toBe('new')
  })

  it('keeps the 300 newest', () => {
    const local = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`l${i}`, review(i)]))
    const remote = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`r${i}`, review(1000 + i)]))
    const merged = mergeReviews(local, remote)
    expect(Object.keys(merged)).toHaveLength(300)
    expect(merged.r0).toBeDefined()
    expect(merged.l0).toBeUndefined()
  })
})

describe('mergePuzzles', () => {
  it('takes the rating from the side with more puzzles played', () => {
    const local = progress({ rating: 1400, played: 10, solved: 5, streak: 1, prefs: { autoNext: true, difficulty: 'easier' } })
    const remote = progress({ rating: 1700, played: 30, solved: 20, streak: 4 })
    const m = mergePuzzles(local, remote)
    expect([m.rating, m.played, m.solved, m.streak]).toEqual([1700, 30, 20, 4])
    expect(m.prefs).toEqual(remote.prefs)
  })

  it('keeps local on a tie', () => {
    expect(mergePuzzles(progress({ rating: 1600, played: 3 }), progress({ rating: 1450, played: 3 })).rating).toBe(1600)
  })

  it('takes the best of the bests and unions the ids', () => {
    const local = progress({ bestStreak: 9, sprintBest: { '3min': 12 }, seen: ['a', 'b'], mistakesSolved: ['m1'] })
    const remote = progress({ bestStreak: 4, sprintBest: { '3min': 15, survival: 7 }, seen: ['b', 'c'], mistakesSolved: ['m2'] })
    const m = mergePuzzles(local, remote)
    expect(m.bestStreak).toBe(9)
    expect(m.sprintBest).toEqual({ '3min': 15, survival: 7 })
    expect(m.seen).toEqual(['b', 'c', 'a'])
    expect(m.mistakesSolved.sort()).toEqual(['m1', 'm2'])
  })

  it('keeps the later day streak, and the higher count on the same day', () => {
    expect(mergePuzzles(progress({ days: { last: 10, count: 2, best: 8 } }), progress({ days: { last: 12, count: 1, best: 3 } })).days).toEqual({ last: 12, count: 1, best: 8 })
    expect(mergePuzzles(progress({ days: { last: 12, count: 5, best: 5 } }), progress({ days: { last: 12, count: 2, best: 6 } })).days).toEqual({ last: 12, count: 5, best: 6 })
    expect(mergePuzzles(progress({}), progress({ days: { last: 1, count: 1, best: 1 } })).days).toEqual({ last: 1, count: 1, best: 1 })
  })

  it('unions the recent days with a solve', () => {
    const m = mergePuzzles(progress({ days: { last: 12, count: 2, best: 2, recent: [11, 12] } }), progress({ days: { last: 9, count: 1, best: 3, recent: [5, 9] } }))
    expect(m.days).toEqual({ last: 12, count: 2, best: 3, recent: [5, 9, 11, 12] })
  })

  it("keeps today's mistake count from the later day, or the higher count", () => {
    expect(mergePuzzles(progress({ today: { day: 4, mistakes: 3 } }), progress({ today: { day: 5, mistakes: 1 } })).today).toEqual({ day: 5, mistakes: 1 })
    expect(mergePuzzles(progress({ today: { day: 5, mistakes: 1 } }), progress({ today: { day: 5, mistakes: 2 } })).today).toEqual({ day: 5, mistakes: 2 })
    expect(mergePuzzles(progress({}), progress({ today: { day: 5, mistakes: 2 } })).today).toEqual({ day: 5, mistakes: 2 })
  })

  it('keeps the later daily result and the local puzzle on the board', () => {
    const local = progress({ daily: { day: 5, result: 'failed' }, current: { line: 'local' } })
    const remote = progress({ played: 50, daily: { day: 6, result: 'solved' }, current: { line: 'remote' } })
    const m = mergePuzzles(local, remote)
    expect(m.daily).toEqual({ day: 6, result: 'solved' })
    expect(m.current).toEqual({ line: 'local' })
  })
})

describe('mergeSettings', () => {
  it('lets the more recent side win but keeps the local engine', () => {
    const local = { ...DEFAULT_SETTINGS, boardTheme: 'green' as const, engine: 'full' as const }
    const remote = { ...DEFAULT_SETTINGS, boardTheme: 'brown' as const, engine: 'lite' as const }
    expect(mergeSettings(local, remote, 200, 100)).toMatchObject({ boardTheme: 'green', engine: 'full' })
    expect(mergeSettings(local, remote, 100, 200)).toMatchObject({ boardTheme: 'brown', engine: 'full' })
  })
})

describe('mergeStore', () => {
  it('passes the other side through when one is missing', () => {
    expect(mergeStore('settings', null, { appearance: 'light' }, 0, 0)).toEqual({ appearance: 'light' })
    expect(mergeStore('puzzles', { rating: 1 }, null, 0, 0)).toEqual({ rating: 1 })
  })
})
