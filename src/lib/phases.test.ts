import { describe, expect, it } from 'vitest'
import { phaseAccuracy, phaseMoves, weakestPhase } from './phases'
import type { SharedGame } from './share'
import type { Score } from './uci'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const cp = (value: number): Score => ({ type: 'cp', value })

function game(startFen: string, moves: string[], scores: Score[]): SharedGame {
  return { startFen, moves, headers: {}, orientation: 'white', review: { depth: 18, scores, bestMoves: moves.map(() => null), classes: moves.map(() => 'best') } }
}

// Knights out and back, again and again: 24 plies, nothing traded.
const SHUFFLE = Array.from({ length: 6 }, () => ['g1f3', 'g8f6', 'f3g1', 'f6g8']).flat()

describe('phaseMoves', () => {
  it('counts the first ten moves as the opening, then the middlegame', () => {
    const moves = phaseMoves(game(START, SHUFFLE, SHUFFLE.map(() => cp(0)).concat(cp(0))), 'white')
    expect(moves.opening).toHaveLength(10)
    expect(moves.middlegame).toHaveLength(2)
    expect(moves.endgame).toHaveLength(0)
    expect(moves.opening.every((a) => a === 100)).toBe(true)
  })

  it('counts a position with six or fewer pieces as the endgame, from the first move', () => {
    const fen = '4k3/8/8/8/8/8/4K3/R6R w - - 0 1'
    const moves = phaseMoves(game(fen, ['a1a2', 'e8d8', 'a2a1'], [cp(500), cp(500), cp(500), cp(500)]), 'white')
    expect(moves.endgame).toHaveLength(2)
    expect(moves.opening).toHaveLength(0)
  })

  it("scores each move from the mover's side", () => {
    // White's first move throws away a won position; Black's reply is fine.
    const moves = phaseMoves(game(START, ['e2e4', 'e7e5'], [cp(600), cp(-300), cp(-300)]), 'white')
    expect(moves.opening[0]).toBeLessThan(40)
    expect(phaseMoves(game(START, ['e2e4', 'e7e5'], [cp(600), cp(-300), cp(-300)]), 'black').opening).toEqual([100])
  })

  it('is empty for a game without its review', () => {
    expect(phaseMoves({ startFen: START, moves: ['e2e4'], headers: {}, orientation: 'white' }, 'white').opening).toEqual([])
  })
})

describe('phaseAccuracy', () => {
  it('lets a blunder weigh, and leaves out phases no game reached', () => {
    const steady = game(START, SHUFFLE.slice(0, 4), [cp(0), cp(0), cp(0), cp(0), cp(0)])
    const blunder = game(START, ['e2e4', 'e7e5'], [cp(600), cp(-300), cp(-300)])
    const acc = phaseAccuracy([
      { game: steady, color: 'white' },
      { game: blunder, color: 'white' },
    ])
    expect(acc.opening).not.toBeNull()
    expect(acc.opening!).toBeLessThan(80)
    expect(acc.middlegame).toBeNull()
    expect(acc.endgame).toBeNull()
  })
})

describe('weakestPhase', () => {
  // 24 plies of shuffling: an opening and a short middlegame, White's middlegame moves throwing away a pawn each.
  const slipping = () => game(START, SHUFFLE, SHUFFLE.map((_, i) => cp(i < 20 ? 0 : -100 * (i - 19))).concat(cp(-500)))

  it('waits for five reviewed games', () => {
    expect(weakestPhase(Array.from({ length: 4 }, () => ({ game: slipping(), color: 'white' as const })))).toBeNull()
  })

  it('names the phase that costs the most once there are enough games', () => {
    const weakest = weakestPhase(Array.from({ length: 5 }, () => ({ game: slipping(), color: 'white' as const })))
    expect(weakest?.phase).toBe('middlegame')
    expect(weakest!.accuracy).toBeLessThan(100)
  })

  it('leaves out a phase reached in fewer than three games', () => {
    const quiet = game(START, SHUFFLE.slice(0, 4), [cp(0), cp(0), cp(0), cp(0), cp(0)])
    const games = [slipping(), slipping(), quiet, quiet, quiet].map((g) => ({ game: g, color: 'white' as const }))
    // Only the opening is reached in three or more: nothing to compare it with.
    expect(weakestPhase(games)).toBeNull()
  })
})
