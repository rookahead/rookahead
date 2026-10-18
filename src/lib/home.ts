// Numbers for the home page.
import type { Session } from './session'

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

/** The game open on the board (from the saved session), for the home page's "Continue" card. */
export function currentGame(session: Session | null): { title: string; moves: number; reviewed: boolean } | null {
  if (!session) return null
  const moves = movesInPgn(session.pgn)
  if (!moves) return null
  const tag = (name: string) => /^\[(\w+) "(.*)"\]$/m.exec(session.pgn.split('\n').find((l) => l.startsWith(`[${name} `)) ?? '')?.[2]
  const white = tag('White')
  const black = tag('Black')
  const named = (n?: string) => n && n !== '?'
  return {
    title: named(white) || named(black) ? `${named(white) ? white : 'White'} vs ${named(black) ? black : 'Black'}` : 'Your analysis board',
    moves,
    reviewed: Object.keys(session.evals ?? {}).length > 0,
  }
}

/** The letter in a user's avatar. */
export const avatarLetter = (username: string) => (username.trim()[0] ?? '?').toUpperCase()

/** "Oct 17" (this year) or "Oct 17, 2025". */
export function formatDay(epochSeconds: number, now = new Date()): string {
  const d = new Date(epochSeconds * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
}
