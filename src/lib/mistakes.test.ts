import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import type { MoveClass } from './classify'
import { acceptable, mistakesFromGame } from './mistakes'
import type { CachedReview } from './reviewCache'
import type { SharedGame } from './share'
import type { Score } from './uci'

const cp = (value: number): Score => ({ type: 'cp', value })
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6?? 4. Qxf7#: Black blunders on move 3 (best was g6). */
function scholars(orientation: 'white' | 'black', classes: MoveClass[] = ['book', 'book', 'good', 'good', 'good', 'blunder', 'best']): SharedGame {
  const chess = new Chess()
  const moves = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'].map((san) => chess.move(san).lan)
  return {
    startFen: START,
    moves,
    headers: { White: 'You', Black: 'Rookahead Level 2' },
    orientation,
    review: {
      depth: 16,
      scores: [cp(30), cp(30), cp(30), cp(10), cp(20), cp(-20), { type: 'mate', value: 1 }, { type: 'mate', value: 0, mated: 'black' }],
      bestMoves: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g7g6', 'h5f7'],
      classes,
    },
  }
}

const entry: CachedReview = { token: 't', white: 'You', black: 'Rookahead Level 2', accuracy: { white: 90, black: 40 }, brilliant: { white: 0, black: 0 }, at: Date.UTC(2026, 9, 18) }

describe('mistakesFromGame', () => {
  it('uses the orientation side', () => {
    expect(mistakesFromGame('k', entry, scholars('white'))).toEqual([])
    const [m, ...rest] = mistakesFromGame('k', entry, scholars('black'))
    expect(rest).toEqual([])
    expect(m).toMatchObject({
      id: 'k#5',
      gameKey: 'k',
      ply: 6,
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
      played: 'g8f6',
      playedSan: 'Nf6',
      best: 'g7g6',
      bestSan: 'g6',
      bestScore: cp(-20),
      playedScore: { type: 'mate', value: 1 },
      cls: 'blunder',
      color: 'black',
      opponent: 'You',
    })
  })

  it('skips moves without a best move, and good moves', () => {
    const g = scholars('black')
    g.review!.bestMoves[5] = null
    expect(mistakesFromGame('k', entry, g)).toEqual([])
    expect(mistakesFromGame('k', entry, scholars('black', ['book', 'book', 'good', 'good', 'good', 'inaccuracy', 'best']))).toEqual([])
  })

  it('skips games without a review', () => {
    const g = scholars('black')
    delete g.review
    expect(mistakesFromGame('k', entry, g)).toEqual([])
  })
})

describe('acceptable', () => {
  it('takes moves that would have been Good or better', () => {
    expect(acceptable(cp(0), cp(0), 'white')).toBe(true)
    expect(acceptable(cp(0), cp(-20), 'white')).toBe(true)
    expect(acceptable(cp(0), cp(-60), 'white')).toBe(false)
    expect(acceptable(cp(0), cp(20), 'black')).toBe(true)
    expect(acceptable(cp(0), cp(60), 'black')).toBe(false)
    expect(acceptable({ type: 'mate', value: 3 }, cp(900), 'white')).toBe(true)
    expect(acceptable({ type: 'mate', value: 3 }, cp(100), 'white')).toBe(false)
  })
})
