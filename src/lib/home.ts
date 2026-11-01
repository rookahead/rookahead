// Numbers for the home page.
import { clockLabel } from './clock'
import type { PlayedGame } from './games'
import { levelInfo } from './levels'

/** Full moves in a PGN (as players count them): the last move number in the movetext. */
export function movesInPgn(pgn: string): number {
  const movetext = pgn
    .replace(/^\[.*\]\s*$/gm, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\([^)]*\)/g, '')
  let last = 0
  for (const m of movetext.matchAll(/(\d+)\.+/g)) last = Math.max(last, Number(m[1]))
  return last
}

/** The letter in a user's avatar. */
export const avatarLetter = (username: string) => (username.trim()[0] ?? '?').toUpperCase()

/** "Oct 17" (this year) or "Oct 17, 2025". */
export function formatDay(epochSeconds: number, now = new Date()): string {
  const d = new Date(epochSeconds * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
}

const RESULT_LABEL: Record<PlayedGame['result'], string> = { win: 'Won', loss: 'Lost', draw: 'Draw' }

/** The text of one row in "My recent games". */
export function playedRow(game: PlayedGame, now = new Date()) {
  const moves = movesInPgn(game.pgn)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  return {
    opponent: `Rookahead · Level ${game.level}`,
    rating: String(levelInfo(game.level).rating),
    detail: `${game.color === 'white' ? 'White' : 'Black'} · ${clockLabel(game.clock)} · ${plural(moves, 'move')} · ${formatDay(game.endedAt / 1000, now)}`,
    assists: [game.takebacks && plural(game.takebacks, 'takeback'), game.hints && plural(game.hints, 'hint')].filter(Boolean).join(' · '),
    result: RESULT_LABEL[game.result],
  }
}

/** "Good morning, bijoy" by the hour (0–23); a guest gets no name. Late at night it teases a little. */
export function greeting(hour: number, name?: string | null): string {
  const who = name ? `, ${name}` : ''
  if (hour < 5) return name ? `Up late, ${name}?` : 'Up late?'
  if (hour < 12) return `Good morning${who}`
  if (hour < 17) return `Good afternoon${who}`
  return `Good evening${who}`
}

/** Games the win count needs before it says anything. */
const NUDGE_MIN_GAMES = 5
/** Rating points worth mentioning. */
const NUDGE_MIN_POINTS = 10

export interface NudgeInput {
  mistakes: number
  /** The puzzle streak, and whether today already counts. */
  streak: number
  solvedToday: boolean
  /** Legendary moves in the last 7 days. */
  legendary: number
  /** How far your rating has climbed, when it has: the points, the time control and the span. */
  ratingUp: { points: number; time: string; over: string } | null
  /** Accuracy change over the last 10 reviewed games. */
  trend: number | null
  /** Your latest games, and how many of them you won. */
  won: number
  played: number
  hasGames: boolean
}

/** The one line under the greeting: how you're doing. What to do next is the buttons' job; only a streak about to end comes first. */
export function nudge({ mistakes, streak, solvedToday, legendary, ratingUp, trend, won, played, hasGames }: NudgeInput): string {
  if (streak > 0 && !solvedToday) return `Solve today's puzzle to keep your ${streak}-day streak.`
  if (legendary > 0) return `${legendary} Legendary ${legendary === 1 ? 'move' : 'moves'} this week.`
  if (ratingUp && ratingUp.points >= NUDGE_MIN_POINTS) return `Up ${ratingUp.points} points in ${ratingUp.time} ${ratingUp.over}.`
  if (trend != null && trend >= 0.5) return `Your accuracy is up ${trend.toFixed(1)} over your last 10 games.`
  if (played >= NUDGE_MIN_GAMES && won * 2 >= played) return `You won ${won} of your last ${played} games.`
  if (mistakes > 0) return mistakes === 1 ? 'A mistake from your games is waiting as a puzzle.' : `${mistakes} mistakes from your games are waiting as puzzles.`
  return hasGames ? 'Pick a game and see where it turned.' : 'Load a game and see where it turned.'
}
