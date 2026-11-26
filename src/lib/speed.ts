// A game's speed (bullet, blitz, rapid, ...) from its time label, the way the site it was played on sorts it.
import type { GameSource } from './myGames'

export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'untimed'

export const SPEED_LABEL: Record<Speed, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  daily: 'Daily',
  untimed: 'Untimed',
}

/**
 * "3 | 2", "10 min", "30s", "5+3", "1 day", "Unlimited" → its speed. Both sites go by the starting time plus 40 moves'
 * increment; Chess.com calls anything from 10 minutes rapid, Lichess (and games here) keep classical from 25.
 */
export function speedOf(time: string, source: GameSource): Speed {
  if (/day/i.test(time)) return 'daily'
  const m = /^([\d.]+)\s*(s|min)?\s*(?:[|+]\s*(\d+))?/.exec(time.trim())
  if (!m) return 'untimed'
  const base = m[2] === 's' ? Number(m[1]) : Number(m[1]) * 60
  const total = base + 40 * Number(m[3] ?? 0)
  if (source === 'chesscom') return total < 180 ? 'bullet' : total < 600 ? 'blitz' : 'rapid'
  return total < 179 ? 'bullet' : total < 479 ? 'blitz' : total < 1499 ? 'rapid' : 'classical'
}
