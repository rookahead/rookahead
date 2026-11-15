// Lichess puzzles: reading the shard lines, solving by Lichess's rules, the puzzle rating.
// Data format: docs/superpowers/specs/2026-10-18-puzzles-design.md.
import { Chess, type Square } from 'chess.js'
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

/** Whole UTC days since 2026-01-01: the daily puzzle's number (the same puzzle everywhere at once). */
export const dayNumber = (date: Date) => Math.floor((date.getTime() - DAY_ZERO) / 86_400_000)

/** Whole days since 2026-01-01 on your own calendar, turning over at your midnight: the puzzle streak's days. */
export const localDayNumber = (date: Date) => Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - DAY_ZERO) / 86_400_000)

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/**
 * What to look for, said before you move: the mate and its length, or the piece the solution wins outright
 * (what it gives up on the way counted against it). It says what there is to win, never how.
 */
export function puzzleGoal(p: Puzzle): string {
  const mate = p.themes.map((t) => /^mateIn(\d)$/.exec(t)?.[1]).find(Boolean)
  if (mate) return mate === '1' ? 'Find the checkmate.' : `Find the checkmate in ${mate}.`
  if (p.themes.includes('mate')) return 'Find the checkmate.'
  let gained = 0
  let top: keyof typeof PIECE_VALUES | null = null
  try {
    const chess = new Chess(p.fen)
    p.moves.forEach((m, i) => {
      const move = chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] })
      // The opponent's first move sets the puzzle up: it's on the board before you look.
      if (i === 0) return
      const yours = i % 2 === 1
      const worth = (move.captured ? PIECE_VALUES[move.captured] : 0) + (move.promotion ? PIECE_VALUES[move.promotion] - 1 : 0)
      gained += yours ? worth : -worth
      if (yours && move.captured && (!top || PIECE_VALUES[move.captured] > PIECE_VALUES[top])) top = move.captured
    })
  } catch {
    gained = 0
  }
  if (top && gained >= PIECE_VALUES[top]) return `Find the move that wins ${top === 'q' ? 'the queen' : `a ${PIECE_NAMES[top]}`}.`
  if (gained > 0) return 'Find the move that wins material.'
  return `Find the best move for ${playerColor(p) === 'white' ? 'White' : 'Black'}.`
}

/** A puzzle's idea in a line, by theme: the first that fits. */
const IDEAS: [theme: string, line: string][] = [
  ['smotheredMate', 'A smothered mate.'],
  ['backRankMate', 'A back-rank mate.'],
  ['mate', 'Checkmate.'],
  ['pin', 'The pin did the work.'],
  ['skewer', 'A skewer: the piece behind fell.'],
  ['discoveredAttack', 'A discovered attack.'],
  ['doubleCheck', 'A double check.'],
  ['deflection', 'The defender was pulled away.'],
  ['attraction', 'The piece was lured onto the wrong square.'],
  ['capturingDefender', 'The defender was removed.'],
  ['trappedPiece', 'The piece had nowhere to go.'],
  ['hangingPiece', 'A loose piece, picked up.'],
  ['promotion', 'The pawn made it.'],
  ['zugzwang', 'Zugzwang: every move loses.'],
  ['intermezzo', 'An in-between move.'],
  ['quietMove', 'A quiet move, and it holds.'],
  ['sacrifice', 'The sacrifice paid off.'],
]

/** What the idea was, said once it's solved. */
export function solvedLine(p: Puzzle): string {
  if (p.themes.includes('fork') && !p.themes.includes('mate')) {
    try {
      const piece = positionAfter(p, [p.moves[0]]).get(p.moves[1].slice(0, 2) as Square)?.type
      if (piece) return `A ${PIECE_NAMES[piece]} fork.`
    } catch {
      // An unreadable line: the plain wording below.
    }
  }
  return IDEAS.find(([theme]) => p.themes.includes(theme))?.[1] ?? 'Nicely found.'
}

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
