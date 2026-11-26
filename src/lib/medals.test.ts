import { describe, expect, it } from 'vitest'
import type { GameReport, MoveClass } from './classify'
import type { MyGame } from './myGames'
import { backToBack, endsInRepetition, gameMedals, reviewMedals } from './medals'
import type { CachedReview } from './reviewCache'
import { mainline, treeFromPgn } from './tree'

// Knights out and back twice: the start position comes round a third time.
const SHUFFLE = '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2'

const lineOf = (pgn: string) => mainline(treeFromPgn(pgn).tree)

/** A report that grades the given plies (1 = White's first move) and calls the rest Solid. */
function reportOf(pgn: string, graded: Record<number, MoveClass>): { line: ReturnType<typeof lineOf>; report: GameReport } {
  const line = lineOf(pgn)
  const moves: GameReport['moves'] = {}
  line.slice(1).forEach((n, i) => {
    moves[n.id] = { cls: graded[i + 1] ?? 'good', color: i % 2 ? 'black' : 'white', nodeId: n.id } as GameReport['moves'][string]
  })
  const count = (c: 'white' | 'black') => ({ brilliant: Object.values(moves).filter((m) => m.color === c && m.cls === 'brilliant').length }) as GameReport['counts']['white']
  return { line, report: { moves, accuracy: { white: null, black: null }, counts: { white: count('white'), black: count('black') } } }
}

const game = (pgn: string, result: MyGame['result'], termination?: string): MyGame => ({
  key: pgn,
  source: 'chesscom',
  pgn: `${termination ? `[Termination "${termination}"]\n\n` : ''}${pgn}`,
  white: { name: 'a' },
  black: { name: 'b' },
  color: 'white',
  result,
  time: '10 min',
  moves: 8,
  endedAt: 0,
})

describe('medals', () => {
  it('sees a game end on a position for the third time', () => {
    expect(endsInRepetition(lineOf(SHUFFLE).map((n) => n.fen))).toBe(true)
    expect(endsInRepetition(lineOf('1. Nf3 Nf6 2. Ng1 Ng8 1/2-1/2').map((n) => n.fen))).toBe(false)
  })

  it('gives a drawn game that ended in a repetition its medal, read from the moves', () => {
    expect(gameMedals(game(SHUFFLE, 'draw'))).toEqual(['repetition'])
    expect(gameMedals(game('1. e4 e5 2. Nf3 Nc6 1/2-1/2', 'draw', 'Game drawn by agreement'))).toEqual([])
  })

  it('takes the site’s word for a repetition', () => {
    expect(gameMedals(game('1. e4 e5 1/2-1/2', 'draw', 'Game drawn by repetition'))).toEqual(['repetition'])
  })

  it('counts two Legendary moves in a row by one side, not one each', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *'
    const inARow = reportOf(pgn, { 3: 'brilliant', 5: 'brilliant' })
    expect(backToBack(inARow.line, inARow.report, 'white')).toBe(true)
    expect(backToBack(inARow.line, inARow.report, 'black')).toBe(false)
    const apart = reportOf(pgn, { 1: 'brilliant', 5: 'brilliant' })
    expect(backToBack(apart.line, apart.report, 'white')).toBe(false)
    const eachSide = reportOf(pgn, { 3: 'brilliant', 4: 'brilliant' })
    expect(backToBack(eachSide.line, eachSide.report, 'white')).toBe(false)
  })

  it('lists a review’s medals for each side, the rarest first', () => {
    const { line, report } = reportOf(SHUFFLE, { 1: 'brilliant', 3: 'brilliant' })
    expect(reviewMedals(line, report, true)).toEqual({ white: ['backToBack', 'legendary', 'repetition'], black: ['repetition'] })
    expect(reviewMedals(line, report, false)).toEqual({ white: ['backToBack', 'legendary'], black: [] })
  })

  it('marks a game that ended in checkmate, won or lost, but never in a review', () => {
    const mate = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'
    expect(gameMedals(game(mate, 'win', 'tester won by checkmate'))).toEqual(['checkmate'])
    expect(gameMedals({ ...game(mate, 'loss', 'Normal'), color: 'black' })).toEqual(['checkmate'])
    expect(gameMedals(game('1. e4 e5 2. Qh5 Nc6 1-0', 'win', 'tester won by resignation'))).toEqual([])
    const { line, report } = reportOf(mate.replace(' 1-0', ''), {})
    expect(reviewMedals(line, report, false)).toEqual({ white: [], black: [] })
  })

  it('reads Back to back and Legendary from the saved review, one Legendary medal however many', () => {
    const review = { backToBack: { white: true, black: false }, brilliant: { white: 3, black: 0 } } as CachedReview
    expect(gameMedals(game('1. e4 e5 1-0', 'win'), review)).toEqual(['backToBack', 'legendary'])
    expect(gameMedals(game('1. e4 e5 1-0', 'win'), { ...review, backToBack: { white: false, black: false }, brilliant: { white: 0, black: 2 } })).toEqual([])
  })
})
