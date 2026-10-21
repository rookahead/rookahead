import { describe, expect, it } from 'vitest'
import type { MoveClass } from './classify'
import { legendaryMoves, sinceFor } from './legendary'
import type { SharedGame } from './share'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** A game as a review saves it, with every move graded `best` except the ones given. */
function game(moves: string[], legendary: Record<number, MoveClass> = {}, startFen = START): SharedGame {
  return {
    startFen,
    moves,
    headers: {},
    orientation: 'white',
    review: { depth: 16, scores: [], bestMoves: [], classes: moves.map((_, i) => legendary[i] ?? 'best') },
  }
}

// The Greek gift: 7. Bxh7+ is White's 13th move of the game (index 12).
const GREEK = ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'e4e5', 'f6d7', 'g1f3', 'f8e7', 'f1d3', 'e8g8', 'd3h7', 'g8h7']

describe('legendaryMoves', () => {
  it('finds your Legendary moves, with the move as written and the position after it', () => {
    const [m] = legendaryMoves(game(GREEK, { 12: 'brilliant' }), 'white')
    expect(m).toMatchObject({ ply: 13, label: '7. Bxh7+', from: 'd3', to: 'h7', kind: 'bishop' })
    expect(m.fen.split(' ')[0]).toBe('rnbq1rk1/pppnbppB/4p3/3pP3/3P4/2N2N2/PPP2PPP/R1BQK2R')
  })

  it("leaves out your opponent's", () => {
    expect(legendaryMoves(game(GREEK, { 13: 'brilliant' }), 'white')).toEqual([])
    expect(legendaryMoves(game(GREEK, { 13: 'brilliant' }), 'black')[0]).toMatchObject({ label: '7… Kxh7', kind: 'king' })
  })

  it('tells an underpromotion from a pawn move', () => {
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 50'
    expect(legendaryMoves(game(['a7a8n'], { 0: 'brilliant' }, fen), 'white')[0]).toMatchObject({ kind: 'underpromotion', label: '50. a8=N' })
    expect(legendaryMoves(game(['a7a8q'], { 0: 'brilliant' }, fen), 'white')[0].kind).toBe('pawn')
  })

  it('finds nothing in a game without a review', () => {
    expect(legendaryMoves({ ...game(GREEK), review: undefined }, 'white')).toEqual([])
  })
})

describe('sinceFor', () => {
  const now = Date.UTC(2026, 9, 21)
  it('turns a period into the earliest time it covers', () => {
    expect(sinceFor('7d', now)).toBe(now - 7 * 86400000)
    expect(sinceFor('90d', now)).toBe(now - 90 * 86400000)
    expect(sinceFor('all', now)).toBe(-Infinity)
  })
})
