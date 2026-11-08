// The game open in Analysis, saved so a refresh (or a game picked on the home page) lands in it.
import type { PositionEval } from '../hooks/useAnalysis'
import type { MoveClass } from './classify'
import type { Color } from './evaluation'

export const SESSION_KEY = 'rookahead.session.v1'

export interface Session {
  pgn: string
  orientation: Color
  /** A game the player only watched (pasted as "Neither"): the coach names the sides. */
  watching?: boolean
  currentPly: number
  evals: Record<string, PositionEval>
  /** A shared review's verdicts, in main-line order: they override the classifier's. */
  classes?: (MoveClass | null)[]
  /** Start a review on arrival (a game picked on the home page). Cleared once read. */
  review?: boolean
  /** Open on the engine rather than the review (a position loaded on another page). Cleared once read. */
  engine?: boolean
  /** When the game was last worked on (ms): Game review reopens it only while it's recent. */
  seenAt?: number
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function writeSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage full or unavailable — not fatal.
  }
}

/** How long a game counts as the one you were just on, for Game review from the menu. */
export const RECENT_MS = 30 * 60 * 1000

/** The saved game has moves and was worked on in the last half hour: Game review reopens it. */
export const recentGame = (now = Date.now()): boolean => isRecent(readSession(), now)

export function isRecent(s: Session | null, now: number): boolean {
  if (!s?.seenAt || now - s.seenAt >= RECENT_MS) return false
  // Any move in the movetext (after the headers).
  return /\d+\.\s*[a-hKQRBNO]/.test(s.pgn.replace(/\[[^\]]*\]/g, ''))
}
