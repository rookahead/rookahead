import { describe, expect, it } from 'vitest'
import { makeBook, newOpeningAt } from './openings'
import type { MoveNode } from './tree'

// Positions along the Caro-Kann, the way the Lichess list names them: the same name more than once.
const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const C6 = 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const D4 = 'rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2'
const D5 = 'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3'
const E5 = 'rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3'
const key = (fen: string) => fen.split(' ').slice(0, 3).join(' ')
const book = makeBook({
  names: ['B00 King’s Pawn Game', 'B10 Caro-Kann Defense', 'B12 Caro-Kann Defense: Advance Variation'],
  positions: { [key(E4)]: 0, [key(C6)]: 1, [key(D4)]: 1, [key(D5)]: 1, [key(E5)]: 2 },
})
const path = (...fens: string[]) => fens.map((fen) => ({ fen }) as MoveNode)

describe('the opening a move reaches', () => {
  it('is named the first time', () => {
    expect(newOpeningAt(book, path(E4, C6))).toBe('Caro-Kann Defense')
  })
  it('isn’t named again while the line keeps the same name', () => {
    expect(newOpeningAt(book, path(E4, C6, D4))).toBeUndefined()
    expect(newOpeningAt(book, path(E4, C6, D4, D5))).toBeUndefined()
  })
  it('is named again when it narrows to a variation', () => {
    expect(newOpeningAt(book, path(E4, C6, D4, D5, E5))).toBe('Caro-Kann Defense: Advance Variation')
  })
})
