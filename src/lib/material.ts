import type { Color } from './evaluation'

export type Role = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen'

const START: Record<Role, number> = { pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1 }
const LETTER: Record<string, Role> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' }
export const ROLE_VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 }

export interface MaterialState {
  /** Opponent pieces each side has captured, cheapest first. */
  captured: Record<Color, Role[]>
  /** Material lead in pawns for each side (0 for the side behind). */
  advantage: Record<Color, number>
}

/**
 * Captured pieces inferred from what's missing on the board. Promotions are
 * handled by never counting more than the starting number as "captured".
 */
export function materialState(fen: string): MaterialState {
  const counts: Record<Color, Record<Role, number>> = {
    white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
    black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0 },
  }
  let score = 0
  for (const ch of fen.split(' ')[0]) {
    const role = LETTER[ch.toLowerCase()]
    if (!role) continue
    const color: Color = ch === ch.toUpperCase() ? 'white' : 'black'
    counts[color][role]++
    score += (color === 'white' ? 1 : -1) * ROLE_VALUE[role]
  }
  const missing = (color: Color) =>
    (Object.keys(START) as Role[]).flatMap((role) => Array<Role>(Math.max(0, START[role] - counts[color][role])).fill(role))
  return {
    // White's trophies are the black pieces that are gone, and vice versa.
    captured: { white: missing('black'), black: missing('white') },
    advantage: { white: Math.max(0, score), black: Math.max(0, -score) },
  }
}
