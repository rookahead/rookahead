import { describe, expect, it } from 'vitest'
import { acceptsDraw, outcomeOf, playPgn, takebackPlies } from './playGame'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('outcomeOf', () => {
  it('is null while the game goes on', () => {
    expect(outcomeOf(START, ['e2e4', 'e7e5'])).toBeNull()
  })

  it('spots checkmate for the right side', () => {
    expect(outcomeOf(START, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])).toEqual({ result: '0-1', reason: 'checkmate' })
  })

  it('spots stalemate and insufficient material', () => {
    expect(outcomeOf('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', ['f7e7'])).toBeNull()
    expect(outcomeOf('7k/8/5QK1/8/8/8/8/8 w - - 0 1', ['f6f7'])).toEqual({ result: '1/2-1/2', reason: 'stalemate' })
    expect(outcomeOf('7k/8/6K1/8/8/8/8/6q1 w - - 0 1', ['g6h6', 'g1g5', 'h6g5'])).toEqual({ result: '1/2-1/2', reason: 'insufficient material' })
  })

  it('spots threefold repetition', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']
    expect(outcomeOf(START, shuffle)).toEqual({ result: '1/2-1/2', reason: 'threefold repetition' })
  })

  it('handles promotions in UCI', () => {
    expect(outcomeOf('8/P6k/8/8/8/8/8/K7 w - - 0 1', ['a7a8q'])).toBeNull()
  })
})

describe('takebackPlies', () => {
  it('takes back your move, or your move and the reply', () => {
    expect(takebackPlies(0, 'white', 'white')).toBe(0)
    expect(takebackPlies(1, 'white', 'white')).toBe(1) // you moved, the computer hasn't yet
    expect(takebackPlies(2, 'white', 'white')).toBe(2) // your move and its reply
    expect(takebackPlies(1, 'black', 'white')).toBe(0) // only the computer has moved
    expect(takebackPlies(2, 'black', 'white')).toBe(1)
    expect(takebackPlies(3, 'black', 'white')).toBe(2)
  })
})

describe('acceptsDraw', () => {
  it('takes a draw when the computer isn’t better, not in the opening', () => {
    expect(acceptsDraw(50, 20, 8)).toBe(true)
    expect(acceptsDraw(20, 40, 8)).toBe(true) // losing: gladly
    expect(acceptsDraw(50, 19, 1)).toBe(false) // too early
  })

  it('declines when better, the stronger the level the sooner', () => {
    expect(acceptsDraw(54, 40, 8)).toBe(false)
    expect(acceptsDraw(54, 40, 1)).toBe(true)
    expect(acceptsDraw(62, 40, 1)).toBe(false)
    expect(acceptsDraw(100, 40, 1)).toBe(false) // mating
  })
})

describe('playPgn', () => {
  it('records the players, clock and result', () => {
    const pgn = playPgn(['e2e4', 'e7e5', 'g1f3'], { color: 'black', level: 4, clock: '600+5', outcome: { result: '1-0', reason: 'resignation' }, date: new Date('2026-10-18T10:00:00Z') })
    expect(pgn).toContain('[White "Rookahead Level 4"]')
    expect(pgn).toContain('[Black "You"]')
    expect(pgn).toContain('[Date "2026.10.18"]')
    expect(pgn).toContain('[TimeControl "600+5"]')
    expect(pgn).toContain('[Termination "Rookahead Level 4 won by resignation"]')
    expect(pgn).toMatch(/1\. e4 e5 2\. Nf3 1-0\s*$/)
  })

  it('marks an unfinished or untimed game', () => {
    const pgn = playPgn([], { color: 'white', level: 1, clock: 'none', outcome: null, date: new Date('2026-10-18T10:00:00Z') })
    expect(pgn).toContain('[TimeControl "-"]')
    expect(pgn).toContain('[Result "*"]')
  })
})
