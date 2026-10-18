import { useCallback, useState } from 'react'
import { FULL_ENGINE_AVAILABLE, type EngineStrength } from '../engine/Engine'
import { markChanged, STORE_KEYS, useStoreVersion } from './syncBus'

export type Appearance = 'dark' | 'light' | 'system'

export type BoardTheme = 'graphite' | 'iris' | 'green' | 'brown' | 'blue' | 'slate'

export interface Settings {
  /** Interface colour scheme; 'system' follows the OS. */
  appearance: Appearance
  engine: EngineStrength
  /** Number of engine lines shown in live analysis. */
  lines: number
  /** Live analysis stops at this depth (it's always resumable by going deeper). */
  liveDepth: number
  /** Depth used for each position during a full-game review. */
  reviewDepth: number
  showArrows: boolean
  boardTheme: BoardTheme
  coordinates: boolean
  /** Start a review automatically after loading a game. */
  autoReview: boolean
  chesscomUser: string
  lichessUser: string
  /** Move sounds, 0 (off) to 1. */
  soundVolume: number
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: 'dark',
  engine: 'lite',
  lines: 3,
  liveDepth: 30,
  reviewDepth: 16,
  showArrows: true,
  boardTheme: 'graphite',
  coordinates: true,
  autoReview: true,
  chesscomUser: '',
  lichessUser: '',
  soundVolume: 0.7,
}

const KEY = STORE_KEYS.settings
/** v1 defaulted to the full engine; its other settings carry over, the engine choice doesn't. */
const OLD_KEY = 'rookahead.settings.v1'
const REVIEW_DEPTHS = [12, 16, 20]

function load(): Settings {
  try {
    const old = localStorage.getItem(OLD_KEY)
    if (old && !localStorage.getItem(KEY)) {
      const { engine: _engine, ...rest } = JSON.parse(old) as Partial<Settings>
      localStorage.setItem(KEY, JSON.stringify(rest))
      localStorage.removeItem(OLD_KEY)
    }
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s: Settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      // Snap values saved by older versions to the options offered now.
      if (!REVIEW_DEPTHS.includes(s.reviewDepth)) s.reviewDepth = DEFAULT_SETTINGS.reviewDepth
      if (!FULL_ENGINE_AVAILABLE) s.engine = 'lite'
      return s
    }
  } catch {
    // Storage unavailable or corrupt — fall back to defaults.
  }
  return DEFAULT_SETTINGS
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)
  // A sync pass brought the account's settings: show them.
  const version = useStoreVersion('settings')
  const [loadedVersion, setLoadedVersion] = useState(version)
  if (version !== loadedVersion) {
    setLoadedVersion(version)
    setSettings(load())
  }
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
        markChanged('settings')
      } catch {
        // Not fatal: settings just won't persist.
      }
      return next
    })
  }, [])
  return [settings, update] as const
}
