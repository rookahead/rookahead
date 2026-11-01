import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  about,
  batchState,
  gamesInRange,
  holdBatch,
  MAX_BATCH,
  positionsOf,
  recordSpeed,
  resetBatch,
  secondsPerPosition,
  startBatch,
  stopBatch,
  unreviewed,
  type Reviewer,
} from './batchReview'
import type { MyGame } from './myGames'
import { loadReviews, type CachedReview } from './reviewCache'

const NOW = new Date(2026, 10, 15, 12, 0)
const DAY = 86400000

const game = (key: string, ago: number, moves = 30): MyGame => ({
  key,
  source: 'chesscom',
  pgn: '',
  white: { name: 'a' },
  black: { name: 'b' },
  color: 'white',
  result: 'win',
  time: '10 min',
  moves,
  endedAt: NOW.getTime() - ago,
})

const review = (brilliant = 0): CachedReview => ({
  token: 't',
  white: 'a',
  black: 'b',
  accuracy: { white: 90, black: 80 },
  brilliant: { white: brilliant, black: 0 },
  at: 1,
})

describe('gamesInRange', () => {
  const games = [game('a', DAY / 24), game('b', 2 * DAY), game('c', 20 * DAY), game('d', 60 * DAY)]

  it('counts the games to review in each range, newest first', () => {
    expect(gamesInRange(games, {}, 'today', NOW).todo.map((g) => g.key)).toEqual(['a'])
    expect(gamesInRange(games, {}, 'week', NOW).todo.map((g) => g.key)).toEqual(['a', 'b'])
    expect(gamesInRange(games, {}, 'month', NOW).todo.map((g) => g.key)).toEqual(['a', 'b', 'c'])
    expect(gamesInRange(games, {}, 'all', NOW).todo.map((g) => g.key)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('today starts at midnight, however few hours ago that was', () => {
    const early = new Date(2026, 10, 15, 0, 30)
    const lastNight = { ...game('x', 0), endedAt: early.getTime() - 3600000 }
    expect(gamesInRange([lastNight], {}, 'today', early).todo).toEqual([])
  })

  it('skips reviewed games and says how many', () => {
    const range = gamesInRange(games, { a: review(), c: review() }, 'month', NOW)
    expect(range.todo.map((g) => g.key)).toEqual(['b'])
    expect(range.reviewed).toBe(2)
  })

  it('takes the newest games up to the limit, and says how many there are', () => {
    const many = Array.from({ length: MAX_BATCH + 7 }, (_, i) => game(`g${i}`, i * 1000))
    const range = gamesInRange(many, {}, 'all', NOW)
    expect(range.todo).toHaveLength(MAX_BATCH)
    expect(range.todo[0].key).toBe('g0')
    expect(range.waiting).toBe(MAX_BATCH + 7)
  })
})

describe('unreviewed', () => {
  it('leaves out games with no moves to review', () => {
    expect(unreviewed([game('a', 0, 0), game('b', 0)], {}).map((g) => g.key)).toEqual(['b'])
  })
})

describe('about', () => {
  it.each([
    [20, 'Under a minute'],
    [59, 'Under a minute'],
    [60, 'About 1 minute'],
    [7 * 60 + 10, 'About 7 minutes'],
    [59 * 60, 'About 59 minutes'],
    [60 * 60, 'About 1 hour'],
    [130 * 60, 'About 2 hours 10 minutes'],
    [2 * 3600 + 58 * 60, 'About 3 hours'],
    [3 * 3600 + 4 * 60, 'About 3 hours'],
  ])('%i seconds reads as %s', (seconds, text) => {
    expect(about(seconds)).toBe(text)
  })
})

describe('positionsOf', () => {
  it('counts both sides of every move and the start', () => {
    expect(positionsOf(game('a', 0, 30))).toBe(61)
  })
})

describe('review speed', () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage
  const set = { strength: 'lite', depth: 16, engines: 3 } as const

  beforeEach(() => store.clear())

  it('starts from a rough figure: more engines are faster, more depth is slower', () => {
    const base = secondsPerPosition(set, storage)
    expect(secondsPerPosition({ ...set, engines: 1 }, storage)).toBeGreaterThan(base)
    expect(secondsPerPosition({ ...set, depth: 20 }, storage)).toBeGreaterThan(base)
    expect(secondsPerPosition({ ...set, depth: 12 }, storage)).toBeLessThan(base)
  })

  it('then uses what this device really took, kept per strength and depth', () => {
    recordSpeed(set, 2, storage)
    expect(secondsPerPosition(set, storage)).toBe(2)
    expect(secondsPerPosition({ ...set, depth: 20 }, storage)).not.toBe(2)
  })

  it('smooths later readings', () => {
    recordSpeed(set, 2, storage)
    recordSpeed(set, 4, storage)
    expect(secondsPerPosition(set, storage)).toBe(3)
  })
})

describe('the run', () => {
  const store = new Map<string, string>()
  const settings = { strength: 'lite', depth: 16, cloud: false } as const

  /** A reviewer that finishes each game when told to. */
  function manual() {
    const waiting: ((entry: CachedReview | null) => void)[] = []
    const reviewed: string[] = []
    const reviewer: Reviewer = {
      engines: 3,
      review: (g) =>
        new Promise((resolve) => {
          reviewed.push(g.key)
          waiting.push(resolve)
        }),
      close: vi.fn(),
    }
    const finish = async (entry: CachedReview | null = review()) => {
      waiting.shift()!(entry)
      await new Promise((tick) => setTimeout(tick))
    }
    return { reviewer, reviewed, finish }
  }

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    resetBatch()
  })

  afterEach(() => {
    stopBatch()
    vi.unstubAllGlobals()
  })

  it('reviews one game at a time, newest first, saving each as it finishes', async () => {
    const { reviewer, reviewed, finish } = manual()
    void startBatch([game('a', 0), game('b', 1)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    expect(reviewed).toEqual(['a'])
    expect(batchState()).toMatchObject({ status: 'running', total: 2, done: 0 })

    await finish(review(2))
    expect(Object.keys(loadReviews())).toEqual(['a'])
    expect(batchState()).toMatchObject({ status: 'running', done: 1, legendary: 2 })
    expect(reviewed).toEqual(['a', 'b'])

    await finish(review(1))
    expect(Object.keys(loadReviews()).sort()).toEqual(['a', 'b'])
    expect(batchState()).toMatchObject({ status: 'done', done: 2, legendary: 3 })
    expect(reviewer.close).toHaveBeenCalled()
  })

  it('skips a game reviewed by hand meanwhile', async () => {
    const { reviewer, reviewed, finish } = manual()
    void startBatch([game('a', 0), game('b', 1), game('c', 2)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    localStorage.setItem('rookahead.reviews.v1', JSON.stringify({ b: review() }))
    await finish()
    expect(reviewed).toEqual(['a', 'c'])
  })

  it('stopping keeps the finished games and shuts the engines down', async () => {
    const { reviewer, finish } = manual()
    void startBatch([game('a', 0), game('b', 1)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    await finish()
    stopBatch()
    await finish()
    expect(Object.keys(loadReviews())).toEqual(['a'])
    expect(batchState().status).toBe('idle')
    expect(reviewer.close).toHaveBeenCalled()
  })

  it('carries on past a game that fails, and counts it', async () => {
    const { reviewer, reviewed, finish } = manual()
    void startBatch([game('a', 0), game('b', 1)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    await finish(null)
    expect(reviewed).toEqual(['a', 'b'])
    await finish()
    expect(batchState()).toMatchObject({ status: 'done', done: 2, failed: 1 })
  })

  it('gives up when the engine keeps failing', async () => {
    const { reviewer, reviewed, finish } = manual()
    void startBatch([game('a', 0), game('b', 1), game('c', 2), game('d', 3), game('e', 4)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    await finish(null)
    await finish(null)
    await finish(null)
    expect(reviewed).toHaveLength(3)
    expect(batchState()).toMatchObject({ status: 'done', failed: 3 })
  })

  it('moves the bar by positions, and the estimate down with it', async () => {
    let share: ((s: number) => void) | undefined
    const reviewer: Reviewer = {
      engines: 3,
      review: (_, run) => {
        share = run.onShare
        return new Promise(() => {})
      },
      close: () => {},
    }
    void startBatch([game('a', 0, 30), game('b', 1, 30)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    const before = batchState().secondsLeft
    share!(0.5)
    expect(batchState().share).toBeCloseTo(0.25)
    expect(batchState().secondsLeft).toBeCloseTo(before * 0.75)
  })

  it('a hold pauses the searches until it lifts, whichever page asked', async () => {
    let gate: (() => Promise<void> | undefined) | undefined
    const reviewer: Reviewer = {
      engines: 3,
      review: (_, run) => {
        gate = run.hold
        return new Promise(() => {})
      },
      close: () => {},
    }
    void startBatch([game('a', 0)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    expect(gate!()).toBeUndefined()

    holdBatch('page', true)
    holdBatch('review', true)
    expect(batchState().held).toBe(true)
    const waited = vi.fn()
    void gate!()!.then(waited)
    holdBatch('page', false)
    await new Promise((tick) => setTimeout(tick))
    expect(waited).not.toHaveBeenCalled()
    holdBatch('review', false)
    await new Promise((tick) => setTimeout(tick))
    expect(waited).toHaveBeenCalled()
    expect(batchState().held).toBe(false)
  })

  it('a stop lets a held search go, so it can finish stopping', async () => {
    let gate: (() => Promise<void> | undefined) | undefined
    const reviewer: Reviewer = {
      engines: 3,
      review: (_, run) => {
        gate = run.hold
        return new Promise(() => {})
      },
      close: () => {},
    }
    void startBatch([game('a', 0)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    holdBatch('page', true)
    const waited = vi.fn()
    void gate!()!.then(waited)
    stopBatch()
    await new Promise((tick) => setTimeout(tick))
    expect(waited).toHaveBeenCalled()
    holdBatch('page', false)
  })

  it('ignores a second start while one is running', async () => {
    const { reviewer, reviewed } = manual()
    void startBatch([game('a', 0)], settings, () => reviewer)
    void startBatch([game('z', 0)], settings, () => reviewer)
    await new Promise((tick) => setTimeout(tick))
    expect(reviewed).toEqual(['a'])
  })
})
