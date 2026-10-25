// The game open in Analysis, saved so a refresh (or a game picked on the home page) lands in it.
import type { PositionEval } from '../hooks/useAnalysis'
import type { MoveClass } from './classify'
import type { Color } from './evaluation'

export const SESSION_KEY = 'rookahead.session.v1'

export interface Session {
  pgn: string
  orientation: Color
  currentPly: number
  evals: Record<string, PositionEval>
  /** A shared review's verdicts, in main-line order: they override the classifier's. */
  classes?: (MoveClass | null)[]
  /** Start a review on arrival (a game picked on the home page). Cleared once read. */
  review?: boolean
  /** Open on the engine rather than the review (a position loaded on another page). Cleared once read. */
  engine?: boolean
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
