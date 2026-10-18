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
}

// "Load a game" on the home page: Analysis opens its Load dialog when it next mounts.
let loadRequested = false
export const requestLoadDialog = () => {
  loadRequested = true
}
export const loadDialogRequested = () => loadRequested
export const clearLoadRequest = () => {
  loadRequested = false
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
