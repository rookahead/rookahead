// Reviewing many games at once, on desktop: which ones, how long it'll take, and the run itself. The run lives here, not on a
// page, so it carries on while you move around the app. Each game is saved as it finishes, so closing the page
// loses only the game in progress. Searches are the review's own (useAnalysis.ts), so the verdicts are the same.
import { useSyncExternalStore } from 'react'
import { extraReviewEngines, reviewEngine, searchGame, type ReviewState } from '../hooks/useAnalysis'
import type { EngineStrength } from '../engine/Engine'
import { classifyGame } from './classify'
import type { MyGame } from './myGames'
import { loadOpeningBook } from './openings'
import { finishedReview } from './regrade'
import { loadReviews, saveReview, type CachedReview } from './reviewCache'
import { mainline, treeFromPgn } from './tree'

// ── Which games ──

export type BatchRange = 'today' | 'week' | 'month' | 'all'

/** The most games one run takes. A longer range still shows how many it holds. */
export const MAX_BATCH = 50

/** Games with moves to review and no saved review, newest first. */
export const unreviewed = (games: MyGame[], reviews: Record<string, CachedReview>) => games.filter((g) => g.moves > 0 && !reviews[g.key])

function rangeStart(range: BatchRange, now: Date): number {
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (range === 'all') return 0
  return now.getTime() - (range === 'week' ? 7 : 30) * 86400000
}

export interface GamesInRange {
  /** What a run would review: the newest, up to the limit. */
  todo: MyGame[]
  /** Every game in the range still to review, past the limit too. */
  waiting: number
  /** Games in the range that already have a review. */
  reviewed: number
}

export function gamesInRange(games: MyGame[], reviews: Record<string, CachedReview>, range: BatchRange, now = new Date()): GamesInRange {
  const inRange = games.filter((g) => g.endedAt >= rangeStart(range, now))
  const waiting = unreviewed(inRange, reviews)
  return { todo: waiting.slice(0, MAX_BATCH), waiting: waiting.length, reviewed: inRange.filter((g) => reviews[g.key]).length }
}

// ── How long ──

const SPEED_KEY = 'rookahead.reviewSpeed.v1'

/** One engine's seconds per position on a laptop, double-checks included, at the default strength and depth. */
const BASE_SECONDS = 1.8
const FULL_SLOWER = 2.5
const DEPTH_SCALE: Record<number, number> = { 12: 0.3, 16: 1, 20: 4 }

export interface SpeedSetup {
  strength: EngineStrength
  depth: number
  engines: number
}

const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

function readSpeeds(storage?: Storage): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(SPEED_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

const speedId = ({ strength, depth }: SpeedSetup) => `${strength}:${depth}`

/** Seconds a position takes here: what this device really took if it has run a batch, else a rough figure. */
export function secondsPerPosition(setup: SpeedSetup, storage = defaultStorage()): number {
  const known = readSpeeds(storage)[speedId(setup)]
  if (known) return known
  const { strength, depth, engines } = setup
  return (BASE_SECONDS * (DEPTH_SCALE[depth] ?? 1) * (strength === 'full' ? FULL_SLOWER : 1)) / engines
}

/** Remembers how long a game took here (per device, so it isn't synced), evening out one odd game. */
export function recordSpeed(setup: SpeedSetup, seconds: number, storage = defaultStorage()): void {
  const speeds = readSpeeds(storage)
  const before = speeds[speedId(setup)]
  try {
    storage?.setItem(SPEED_KEY, JSON.stringify({ ...speeds, [speedId(setup)]: before ? (before + seconds) / 2 : seconds }))
  } catch {
    // Not remembered: the estimate stays rough.
  }
}

/** How many positions a review searches: both sides' moves, and the start. */
export const positionsOf = (game: MyGame) => game.moves * 2 + 1

/** "Under a minute", "About 7 minutes", "About 2 hours 10 minutes": as precise as an estimate deserves. */
export function about(seconds: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (seconds < 60) return 'Under a minute'
  if (seconds < 3600) return `About ${plural(Math.round(seconds / 60), 'minute')}`
  const hours = Math.floor(seconds / 3600)
  const tens = Math.round((seconds - hours * 3600) / 600) * 10
  if (tens === 60) return `About ${plural(hours + 1, 'hour')}`
  return tens === 0 || hours >= 3 ? `About ${plural(hours, 'hour')}` : `About ${plural(hours, 'hour')} ${plural(tens, 'minute')}`
}

/** How many engines a run on this device uses. */
export const batchEngines = () => 1 + extraReviewEngines()

// ── The run ──

export interface BatchSettings {
  strength: EngineStrength
  depth: number
  cloud: boolean
}

export interface BatchState {
  status: 'idle' | 'running' | 'done'
  total: number
  /** Games finished with, reviewed or not. */
  done: number
  /** Those that couldn't be reviewed. */
  failed: number
  /** Your Legendary moves in the games reviewed so far. */
  legendary: number
  /** How far the run has got, 0 to 1. */
  share: number
  secondsLeft: number
  /** Waiting for a page or a review that needs the device. */
  held: boolean
}

const IDLE: BatchState = { status: 'idle', total: 0, done: 0, failed: 0, legendary: 0, share: 0, secondsLeft: 0, held: false }

/** Games failing in a row before the run gives up: by then it's the engine, not the games. */
const FAILS_TO_STOP = 3

/** What the run needs from whatever reviews a game. */
export interface Reviewer {
  engines: number
  review: (game: MyGame, run: { signal: AbortSignal; hold: () => Promise<void> | undefined; onShare: (share: number) => void }) => Promise<CachedReview | null>
  close: () => void
}

/**
 * Reviews games with its own engines, as many as a review of one game would use, kept until the run ends. They're
 * the threaded build, unlike a single review's helpers (for phones): on desktop it's the faster one, and its search
 * doesn't lean on timers, which browsers slow down on a page in the background. Where it can't load, it falls back.
 */
function engineReviewer({ strength, depth, cloud }: BatchSettings): Reviewer {
  const engines = Array.from({ length: batchEngines() }, () => reviewEngine(strength, { singleThreaded: false }))
  return {
    engines: engines.length,
    async review(game, { signal, hold, onShare }) {
      const { tree, headers } = treeFromPgn(game.pgn)
      const line = mainline(tree)
      if (line.length < 2) return null
      let state: ReviewState = { status: 'running', progress: 0, total: line.length, evals: {} }
      const live = () => !signal.aborted
      const evals = await searchGame(line, engines, { depth, cloud, signal, live, hold }, (change) => {
        state = change(state)
        onShare(state.share ?? 0)
      })
      if (!evals || line.some((n) => !evals[n.fen])) return null
      const book = await loadOpeningBook().catch(() => null)
      return finishedReview(line, headers, game.color, evals, classifyGame(line, evals, book?.isBook), depth)
    },
    close: () => engines.forEach((e) => e.terminate()),
  }
}

let state = IDLE
let current: AbortController | null = null
const holds = new Set<string>()
let waiters: (() => void)[] = []
const listeners = new Set<() => void>()

function publish(next: BatchState) {
  state = next
  listeners.forEach((fn) => fn())
}

function release() {
  waiters.forEach((go) => go())
  waiters = []
}

export const batchState = () => state

/** Asks the run to wait, or lets it go on. It goes on once no `reason` is holding it. */
export function holdBatch(reason: string, on: boolean): void {
  if (on) holds.add(reason)
  else holds.delete(reason)
  if (!holds.size) release()
  if (state.status === 'running' && state.held !== holds.size > 0) publish({ ...state, held: holds.size > 0 })
}

const held = () => (holds.size ? new Promise<void>((go) => waiters.push(go)) : undefined)

/** Is `reason` holding the run (e.g. 'review': a game review is running on the review page)? */
export const heldBy = (reason: string): boolean => holds.has(reason)

/** Stops the run. Finished games stay saved; the one in progress is dropped. */
export function stopBatch(): void {
  current?.abort()
  current = null
  release()
  publish(IDLE)
}

/** Back to the plain card, once the summary of a finished run has been read. */
export const resetBatch = () => {
  if (state.status !== 'running') publish(IDLE)
}

/** Keeps the screen on through a long run: once the computer sleeps, the review stops with it. */
function keepAwake(signal: AbortSignal) {
  let lock: { release: () => Promise<void> } | undefined
  const ask = () => {
    if (document.visibilityState !== 'visible') return
    void navigator.wakeLock?.request('screen').then(
      (l) => {
        if (signal.aborted) void l.release()
        else lock = l
      },
      () => {}, // Not allowed or not supported: the screen just follows its own timeout.
    )
  }
  ask()
  document.addEventListener('visibilitychange', ask)
  return () => {
    document.removeEventListener('visibilitychange', ask)
    void lock?.release()
  }
}

/** Reviews `games` in order, one at a time. A second start while one is running does nothing. */
export async function startBatch(games: MyGame[], settings: BatchSettings, makeReviewer: (settings: BatchSettings) => Reviewer = engineReviewer): Promise<void> {
  if (state.status === 'running' || !games.length) return
  const ctrl = new AbortController()
  current = ctrl
  const reviewer = makeReviewer(settings)
  const setup: SpeedSetup = { ...settings, engines: reviewer.engines }
  const positions = games.map(positionsOf)
  const all = positions.reduce((sum, n) => sum + n, 0)
  let seconds = secondsPerPosition(setup)
  /** Positions in games already finished with. */
  let passed = 0
  publish({ ...IDLE, status: 'running', total: games.length, secondsLeft: all * seconds, held: holds.size > 0 })
  const sleep = typeof document === 'undefined' ? null : keepAwake(ctrl.signal)

  // A game timed while held, or hidden (the computer may sleep), says nothing about this device's speed.
  let steady = true
  const unsteady = () => void (steady = false)
  const hidden = () => document.visibilityState === 'hidden' && unsteady()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', hidden)

  const progress = (share: number, i: number) => {
    const reached = passed + share * positions[i]
    if (current === ctrl) publish({ ...state, share: reached / all, secondsLeft: (all - reached) * seconds })
  }

  try {
    let fails = 0
    for (const [i, game] of games.entries()) {
      if (ctrl.signal.aborted) return
      let entry: CachedReview | null = null
      const reviewedMeanwhile = !!loadReviews()[game.key]
      if (!reviewedMeanwhile) {
        steady = holds.size === 0
        const began = performance.now()
        const hold = () => {
          const wait = held()
          if (wait) unsteady()
          return wait
        }
        entry = await reviewer.review(game, { signal: ctrl.signal, hold, onShare: (share) => progress(share, i) }).catch(() => null)
        if (ctrl.signal.aborted) return
        if (entry) {
          saveReview(game.key, entry)
          if (steady) {
            recordSpeed(setup, (performance.now() - began) / 1000 / positions[i])
            seconds = secondsPerPosition(setup)
          }
        }
      }
      passed += positions[i]
      const failed = !entry && !reviewedMeanwhile
      fails = failed ? fails + 1 : 0
      publish({
        ...state,
        done: i + 1,
        failed: state.failed + (failed ? 1 : 0),
        legendary: state.legendary + (entry?.brilliant[game.color] ?? 0),
        share: passed / all,
        secondsLeft: (all - passed) * seconds,
      })
      if (fails >= FAILS_TO_STOP) break
    }
    if (current === ctrl) {
      current = null
      publish({ ...state, status: 'done', secondsLeft: 0 })
    }
  } finally {
    sleep?.()
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', hidden)
    reviewer.close()
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/** The run as it goes. Updates with every position, so only what draws it should use this. */
export const useBatchReview = () => useSyncExternalStore(subscribe, batchState)

/** Whether there's a run to show, running or just finished. */
export const useBatchActive = () => useSyncExternalStore(subscribe, () => state.status !== 'idle')
