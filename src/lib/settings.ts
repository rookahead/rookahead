import { useCallback, useState } from 'react'
import { FULL_ENGINE_AVAILABLE, type EngineStrength } from '../engine/Engine'
import { markChanged, STORE_KEYS, useStoreVersion } from './syncBus'

/** 'black' is dark on a true black page, for AMOLED screens. */
export type Appearance = 'dark' | 'black' | 'light' | 'system'

/** The app's colour: its accent, and a tint to match in the backgrounds (index.css, :root[data-palette]). */
export type Palette = 'sky' | 'gold' | 'indigo' | 'coral' | 'forest' | 'ivory'

export const PALETTES: { id: Palette; label: string; swatch: string }[] = [
  { id: 'gold', label: 'Gold', swatch: '#f2b33d' },
  { id: 'sky', label: 'Sky', swatch: '#38bdf8' },
  { id: 'indigo', label: 'Indigo', swatch: '#818cf8' },
  { id: 'coral', label: 'Coral', swatch: '#ff7a59' },
  { id: 'forest', label: 'Forest', swatch: '#34d399' },
  { id: 'ivory', label: 'Ivory', swatch: '#ededed' },
]

/** 'theme' takes its squares from your colour theme. */
export type BoardTheme = 'theme' | 'graphite' | 'iris' | 'green' | 'brown' | 'blue' | 'slate'

export type Animation = 'none' | 'fast' | 'normal' | 'slow'

/** How long a piece takes to slide to its square, per animation setting. */
export const ANIMATION_MS: Record<Animation, number> = { none: 0, fast: 120, normal: 240, slow: 400 }

export interface Settings {
  /** Interface colour scheme; 'system' follows the OS. */
  appearance: Appearance
  palette: Palette
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
  /** Engine threads; 0 picks for you (two thirds of the cores, see autoThreads). */
  threads: number
  /** A reviewed move's classification badge on its square. */
  classOnBoard: boolean
  /** The board shakes for a Legendary move. */
  moveEffects: boolean
  /** Moves written with piece figurines (♞f3) or letters (Nf3). */
  notation: 'figurine' | 'letter'
  highlightLastMove: boolean
  /** Dots on the squares a picked-up piece can go to. */
  showLegalMoves: boolean
  animation: Animation
  /** How far the settings have come with the theme changes (see load); missing on settings from before them. */
  themes?: number
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: 'dark',
  palette: 'gold',
  engine: 'lite',
  lines: 3,
  liveDepth: 30,
  reviewDepth: 16,
  showArrows: true,
  boardTheme: 'theme',
  coordinates: true,
  autoReview: true,
  chesscomUser: '',
  lichessUser: '',
  soundVolume: 0.7,
  threads: 0,
  classOnBoard: true,
  moveEffects: true,
  notation: 'figurine',
  highlightLastMove: true,
  showLegalMoves: true,
  animation: 'normal',
}

const KEY = STORE_KEYS.settings
/** Where the settings' theme changes are up to (Settings.themes). */
const THEMES_VERSION = 2

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
      if (!PALETTES.some((p) => p.id === s.palette)) s.palette = DEFAULT_SETTINGS.palette
      const was = s.themes ?? 0
      // 1, the tonal themes: before them Sky was everyone's colour unless they changed it, and Dim was the soft dark.
      if (was < 1) {
        if (s.palette === 'sky') s.palette = 'gold'
        if ((s.appearance as string) === 'dim') s.appearance = 'dark'
      }
      // 2, the Theme board: Graphite was everyone's board unless they changed it.
      if (was < 2 && s.boardTheme === 'graphite') s.boardTheme = 'theme'
      s.themes = THEMES_VERSION
      return s
    }
  } catch {
    // Storage unavailable or corrupt — fall back to defaults.
  }
  return DEFAULT_SETTINGS
}

/** How the app looks on this device: its theme, colour and board. */
const LOOK = ['appearance', 'palette', 'boardTheme', 'themes'] as const

/** This device's look, to keep through a log out (account.ts): your games go, your colours stay. */
export function deviceLook(storage: Storage = localStorage): Partial<Settings> {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? '{}') as Partial<Settings>
    return Object.fromEntries(LOOK.filter((k) => saved[k] !== undefined).map((k) => [k, saved[k]]))
  } catch {
    return {}
  }
}

/**
 * Puts the look back after the account's settings are cleared. Not marked as a change: signing in to an
 * account that has settings, its own look wins (sync.ts); a new account starts from this one.
 */
export function restoreLook(look: Partial<Settings>, storage: Storage = localStorage): void {
  if (!Object.keys(look).length) return
  try {
    storage.setItem(KEY, JSON.stringify(look))
  } catch {
    // No room: the defaults it is.
  }
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
