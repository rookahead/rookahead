// The game in progress against the computer (so a refresh continues it) and the last setup.
import { isClockSetting, type ClockSetting, type ClockState } from './clock'
import type { Color } from './evaluation'
import type { Outcome } from './playGame'

export interface PlaySetup {
  level: number
  color: Color | 'random'
  clock: ClockSetting
}

export interface LiveGame {
  id: string
  startFen: string
  /** Your colour. */
  color: Color
  setup: PlaySetup
  /** UCI moves from the start. */
  moves: string[]
  clock: ClockState | null
  takebacks: number
  hints: number
  outcome: Outcome | null
  startedAt: number
  /** Already written to the games list. */
  saved: boolean
}

export const DEFAULT_SETUP: PlaySetup = { level: 3, color: 'random', clock: 'none' }

const GAME_KEY = 'rookahead.play.v1'
const SETUP_KEY = 'rookahead.playSetup.v1'
const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

function read(key: string, storage?: Storage): unknown {
  try {
    return JSON.parse(storage?.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

function write(key: string, value: unknown, storage?: Storage) {
  try {
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: not remembered.
  }
}

export function loadSetup(storage = defaultStorage()): PlaySetup {
  const s = read(SETUP_KEY, storage) as Partial<PlaySetup> | null
  const valid = s && Number.isInteger(s.level) && s.level! >= 1 && s.level! <= 8 && ['white', 'black', 'random'].includes(s.color as string) && isClockSetting(s.clock)
  return valid ? (s as PlaySetup) : DEFAULT_SETUP
}

export const saveSetup = (setup: PlaySetup, storage = defaultStorage()) => write(SETUP_KEY, setup, storage)

/** The game in progress, if any. A finished game is already in the games list, so it never comes back. */
export function loadLiveGame(storage = defaultStorage()): LiveGame | null {
  const g = read(GAME_KEY, storage) as LiveGame | null
  return g && typeof g.id === 'string' && Array.isArray(g.moves) && !g.outcome ? g : null
}

export const saveLiveGame = (game: LiveGame, storage = defaultStorage()) => write(GAME_KEY, game, storage)
export const clearLiveGame = (storage = defaultStorage()) => write(GAME_KEY, null, storage)
