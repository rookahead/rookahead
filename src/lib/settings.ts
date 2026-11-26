import { useCallback, useState } from 'react'
import { FULL_ENGINE_AVAILABLE, type EngineStrength } from '../engine/Engine'
import { markChanged, STORE_KEYS, useStoreVersion } from './syncBus'
import type { HomeWidget } from './widgets'

export type Appearance = 'dark' | 'light' | 'system'

/** The app's colour: its accent, and a tint to match in the backgrounds (index.css, :root[data-palette]). */
export type Palette = 'sky' | 'gold' | 'indigo' | 'coral' | 'forest' | 'mint' | 'klein' | 'cobalt' | 'lime' | 'ivory'

/** The colours offered: Cobalt alone for now (DESIGN.md). The others' tones stay in index.css, to come back once
 * each is tested again; a colour saved before then reads as Cobalt. */
export const PALETTES: { id: Palette; label: string; swatch: string }[] = [{ id: 'cobalt', label: 'Cobalt', swatch: '#2f4bd1' }]

/** 'theme' takes its squares from your colour theme. */
export type BoardTheme = 'theme' | 'graphite' | 'iris' | 'green' | 'brown' | 'blue' | 'slate'

export type Animation = 'none' | 'fast' | 'normal' | 'slow'

/** How long a piece takes to slide to its square, per animation setting. */
export const ANIMATION_MS: Record<Animation, number> = { none: 0, fast: 120, normal: 240, slow: 400 }

export type LastMoveColor = 'board' | 'yellow' | 'purple' | 'blue' | 'green' | 'pink' | 'custom'

/** The last move's tint on its two squares; null: the board's own. See-through, so the squares show under it. */
export const LAST_MOVE_COLORS: Record<LastMoveColor, { label: string; color: string | null }> = {
  board: { label: 'The board’s', color: null },
  yellow: { label: 'Yellow', color: 'rgba(255, 255, 51, 0.42)' },
  purple: { label: 'Purple', color: 'rgba(100, 69, 252, 0.49)' },
  blue: { label: 'Blue', color: 'rgba(40, 140, 255, 0.45)' },
  green: { label: 'Green', color: 'rgba(60, 190, 80, 0.45)' },
  pink: { label: 'Pink', color: 'rgba(236, 72, 153, 0.45)' },
  // Your own, from the colour picker: `lastMoveCustom`.
  custom: { label: 'Your own', color: null },
}

/** A colour from the picker (#rrggbb) at an opacity (0–1), as the tint the board draws. */
export function tintOf(hex: string, opacity: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(opacity * 100) / 100})`
}

/** A tint at another strength (0–1): its colour, with that opacity. */
export const withStrength = (tint: string, strength: number) => tintOf(tintParts(tint).hex, strength)

/** The picker's colour and opacity back out of a tint. */
export function tintParts(tint: string): { hex: string; opacity: number } {
  const [r = 100, g = 69, b = 252, a = 0.5] = (tint.match(/[\d.]+/g) ?? []).map(Number)
  return { hex: `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`, opacity: a }
}

export interface Settings {
  /** Interface colour scheme; 'system' follows the OS. */
  appearance: Appearance
  palette: Palette
  engine: EngineStrength
  /** Number of engine lines shown in live analysis. */
  lines: number
  /** Engine lines on a phone's Analyze board: a plain board with the engine, so one line unless you ask for more. */
  boardLines: number
  /** Live analysis stops at this depth (it's always resumable by going deeper). */
  liveDepth: number
  /** Depth used for each position during a full-game review. */
  reviewDepth: number
  showArrows: boolean
  boardTheme: BoardTheme
  coordinates: boolean
  /** Start a review automatically after loading a game. */
  autoReview: boolean
  /** Reviews take the opening's evals from Lichess's cloud where it has them (cloudEval.ts). */
  cloudEvals: boolean
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
  /** The last move's squares: the board's own tint, or a colour of your choosing (LAST_MOVE_COLORS). */
  lastMoveColor: LastMoveColor
  /** Your own last-move colour (rgba), when lastMoveColor is 'custom'. */
  lastMoveCustom: string
  /** How strongly the last-move colour covers its squares (0–1); null: each colour's own. */
  lastMoveStrength: number | null
  /** Dots on the squares a picked-up piece can go to. */
  showLegalMoves: boolean
  /** Playing the computer: queue your next move on its turn (Board's premove). */
  premoves: boolean
  /** Playing the computer: promotions go straight to a queen (hold Alt to choose). */
  autoQueen: boolean
  animation: Animation
  /** How far the settings have come with the theme changes (see load); missing on settings from before them. */
  themes?: number
  /** Home's widget row, in your order (widgets.ts); missing until you change it, which means the default row. */
  homeWidgets?: HomeWidget[]
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: 'dark',
  palette: 'cobalt',
  engine: 'lite',
  lines: 3,
  boardLines: 1,
  liveDepth: 30,
  reviewDepth: 16,
  showArrows: true,
  boardTheme: 'theme',
  coordinates: true,
  autoReview: true,
  cloudEvals: true,
  chesscomUser: '',
  lichessUser: '',
  soundVolume: 0.7,
  threads: 0,
  classOnBoard: true,
  moveEffects: true,
  notation: 'figurine',
  highlightLastMove: true,
  lastMoveColor: 'board',
  lastMoveCustom: 'rgba(100, 69, 252, 0.49)',
  lastMoveStrength: null,
  showLegalMoves: true,
  premoves: true,
  autoQueen: false,
  animation: 'normal',
}

const KEY = STORE_KEYS.settings
/** Where the settings' theme changes are up to (Settings.themes). */
const THEMES_VERSION = 3

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
      if (!(s.lastMoveColor in LAST_MOVE_COLORS)) s.lastMoveColor = DEFAULT_SETTINGS.lastMoveColor
      if (s.lastMoveStrength != null && !(s.lastMoveStrength >= 0.1 && s.lastMoveStrength <= 1)) s.lastMoveStrength = null
      const was = s.themes ?? 0
      // 1, the tonal themes: Dim folded into Dark.
      if (was < 1 && (s.appearance as string) === 'dim') s.appearance = 'dark'
      // AMOLED is gone: one dark theme, on the near-black page.
      if ((s.appearance as string) === 'black') s.appearance = 'dark'
      // 2, the Theme board: Graphite was everyone's board unless they changed it.
      if (was < 2 && s.boardTheme === 'graphite') s.boardTheme = 'theme'
      // 3, Sky the default again: Gold was everyone's colour for a day, as the default, not a choice.
      if (was < 3 && s.palette === 'gold') s.palette = 'sky'
      // A colour no longer offered: the one that is.
      if (!PALETTES.some((p) => p.id === s.palette)) s.palette = DEFAULT_SETTINGS.palette
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
