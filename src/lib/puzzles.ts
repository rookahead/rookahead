// Lichess puzzles: reading the shard lines, solving by Lichess's rules, the puzzle rating.
// Data format: docs/superpowers/specs/2026-10-18-puzzles-design.md.
import { Chess } from 'chess.js'
import type { Color } from './evaluation'

export interface Puzzle {
  id: string
  /** The position before the opponent's move that sets the puzzle up. */
  fen: string
  /** UCI. `moves[0]` is the opponent's; then the player's and the replies alternate. */
  moves: string[]
  rating: number
  themes: string[]
}

export interface SolveState {
  /** Moves on the board after the start FEN (the opponent's first move included). */
  played: string[]
  /** A wrong move was played at some point: the puzzle counts as failed whatever happens next. */
  failed: boolean
  solved: boolean
  /** The solution was shown. */
  revealed: boolean
}

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/

export function parsePuzzleLine(line: string): Puzzle | null {
  const [id, fen, moves, rating, themes = ''] = line.trim().split(' ')
  if (!id || !fen || !moves) return null
  const p: Puzzle = { id, fen: fen.replaceAll('_', ' '), moves: moves.split(','), rating: Number(rating), themes: themes ? themes.split(',') : [] }
  if (!Number.isFinite(p.rating) || p.moves.length < 2 || !p.moves.every((m) => UCI.test(m)) || p.fen.split(' ').length !== 6) return null
  return p
}

const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'black' : 'white')

/** The side the solver plays: whoever moves after the opponent's set-up move. */
export const playerColor = (p: Puzzle): Color => (turnOf(p.fen) === 'white' ? 'black' : 'white')

export const startSolve = (p: Puzzle): SolveState => ({ played: [p.moves[0]], failed: false, solved: false, revealed: false })

/** The position after a list of moves from the puzzle's start; throws on an illegal move. */
export function positionAfter(p: Puzzle, moves: string[]): Chess {
  const chess = new Chess(p.fen)
  for (const m of moves) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
  return chess
}

/**
 * The player's move. Right if it's the solution's move, or on the last move any checkmate.
 * A right move also plays the opponent's reply; a wrong one leaves the board as it was.
 */
export function tryMove(p: Puzzle, s: SolveState, uci: string): { state: SolveState; result: 'correct' | 'solved' | 'wrong'; reply?: string } {
  const at = s.played.length
  const expected = p.moves[at]
  const last = at === p.moves.length - 1
  let right = uci === expected
  if (!right && last) {
    try {
      right = positionAfter(p, [...s.played, uci]).isCheckmate()
    } catch {
      right = false
    }
  }
  if (!right) return { state: { ...s, failed: true }, result: 'wrong' }
  if (last) return { state: { ...s, played: [...s.played, uci], solved: true }, result: 'solved' }
  const reply = p.moves[at + 1]
  return { state: { ...s, played: [...s.played, uci, reply] }, result: 'correct', reply }
}

/** Plays the rest of the solution out. */
export const revealSolution = (p: Puzzle, s: SolveState): SolveState => ({ ...s, played: [...s.played, ...p.moves.slice(s.played.length)], revealed: true })

/** Elo against the puzzle's rating; moves fast for a new solver, then settles. */
export function newRating(rating: number, puzzleRating: number, won: boolean, played: number): number {
  const k = played < 10 ? 60 : played < 50 ? 32 : 16
  const expected = 1 / (1 + 10 ** ((puzzleRating - rating) / 400))
  return Math.round(rating + k * ((won ? 1 : 0) - expected))
}

/** A band near the rating (up to `spread` either way, so puzzles vary), snapped to the nearest band there is. */
export function pickBand(rating: number, bands: number[], rand: () => number = Math.random, spread = 150): number {
  const target = Math.floor((rating + (rand() * 2 - 1) * spread) / 100) * 100
  return bands.reduce((best, b) => (Math.abs(b - target) < Math.abs(best - target) ? b : best), bands[0])
}

const DAY_ZERO = Date.UTC(2026, 0, 1)

/** Whole UTC days since 2026-01-01: the daily puzzle's number. */
export const dayNumber = (date: Date) => Math.floor((date.getTime() - DAY_ZERO) / 86_400_000)

/** Which line of the daily list is today's. */
export function dailyIndex(date: Date, length: number): number {
  return ((dayNumber(date) % length) + length) % length
}

/** Lichess themes that describe the puzzle's length or goal rather than the idea: not shown. */
const HIDDEN_THEMES = new Set(['short', 'long', 'veryLong', 'oneMove', 'crushing', 'advantage', 'equality', 'master', 'masterVsMaster', 'superGM', 'mate'])
const THEME_NAMES: Record<string, string> = {
  attackingF2F7: 'Attacking f2/f7',
  xRayAttack: 'X-ray attack',
  enPassant: 'En passant',
  underPromotion: 'Underpromotion',
}

/** "mateIn2" → "Mate in 2", "discoveredAttack" → "Discovered attack". */
export function themeLabels(themes: string[]): string[] {
  return themes
    .filter((t) => !HIDDEN_THEMES.has(t))
    .map((t) => {
      if (THEME_NAMES[t]) return THEME_NAMES[t]
      const words = t.replace(/([A-Z])/g, ' $1').replace(/(\d+)/g, ' $1').toLowerCase().trim()
      return words[0].toUpperCase() + words.slice(1)
    })
}

export type Difficulty = 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest'

/** How far from your rating rated puzzles are picked. The rating maths doesn't change. */
export const DIFFICULTY: Record<Difficulty, { label: string; offset: number }> = {
  easiest: { label: 'Easiest', offset: -600 },
  easier: { label: 'Easier', offset: -300 },
  normal: { label: 'Normal', offset: 0 },
  harder: { label: 'Harder', offset: 300 },
  hardest: { label: 'Hardest', offset: 600 },
}

export type SprintMode = '3min' | '5min' | 'survival'

/** Puzzle Sprint: solve as many as you can; three wrong moves (or the clock) end the run. */
export const SPRINT_MODES: Record<SprintMode, { label: string; ms: number | null; blurb: string }> = {
  '3min': { label: '3 min', ms: 180_000, blurb: 'Three minutes on the clock' },
  '5min': { label: '5 min', ms: 300_000, blurb: 'Five minutes on the clock' },
  survival: { label: 'Survival', ms: null, blurb: 'No clock. Go until three mistakes' },
}

export const SPRINT_STRIKES = 3

/** The rating of a run's n-th puzzle (from 0): starts easy and climbs. */
export const sprintRating = (n: number) => Math.min(2800, 600 + 60 * n)
