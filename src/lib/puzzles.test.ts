import { describe, expect, it } from 'vitest'
import { dailyIndex, DIFFICULTY, newRating, parsePuzzleLine, pickBand, playerColor, revealSolution, sprintRating, startSolve, themeLabels, tryMove, type Puzzle } from './puzzles'

const MATE_IN_2 = 'XPBtt r3r1k1/pp3p1R/2nb1p2/8/4B1N1/4P3/PP3P2/2K5_b_-_-_0_25 d6e5,g4h6,g8f8,h7f7 1559 mate,mateIn2,middlegame,short'
const puzzle = (line: string) => parsePuzzleLine(line) as Puzzle

describe('parsePuzzleLine', () => {
  it('reads a shard line', () => {
    expect(puzzle(MATE_IN_2)).toEqual({
      id: 'XPBtt',
      fen: 'r3r1k1/pp3p1R/2nb1p2/8/4B1N1/4P3/PP3P2/2K5 b - - 0 25',
      moves: ['d6e5', 'g4h6', 'g8f8', 'h7f7'],
      rating: 1559,
      themes: ['mate', 'mateIn2', 'middlegame', 'short'],
    })
  })

  it('rejects junk', () => {
    expect(parsePuzzleLine('')).toBeNull()
    expect(parsePuzzleLine('abc def')).toBeNull()
    expect(parsePuzzleLine('id not_a_fen e2e4,e7e5 1500 fork')).toBeNull()
    expect(parsePuzzleLine('id 8/8/8/8/8/8/8/K6k_w_-_-_0_1 e2e4 notanumber fork')).toBeNull()
  })
})

describe('solving', () => {
  it('plays the opponent move first and the player is the side after it', () => {
    const p = puzzle(MATE_IN_2)
    expect(startSolve(p).played).toEqual(['d6e5'])
    expect(playerColor(p)).toBe('white')
  })

  it('solves move by move, with the replies', () => {
    const p = puzzle(MATE_IN_2)
    const first = tryMove(p, startSolve(p), 'g4h6')
    expect(first.result).toBe('correct')
    expect(first.reply).toBe('g8f8')
    expect(first.state.played).toEqual(['d6e5', 'g4h6', 'g8f8'])
    const last = tryMove(p, first.state, 'h7f7')
    expect(last.result).toBe('solved')
    expect(last.state.solved).toBe(true)
    expect(last.state.failed).toBe(false)
  })

  it('a wrong move fails the puzzle but leaves the board as it was', () => {
    const p = puzzle(MATE_IN_2)
    const wrong = tryMove(p, startSolve(p), 'e4h7')
    expect(wrong.result).toBe('wrong')
    expect(wrong.state.played).toEqual(['d6e5'])
    expect(wrong.state.failed).toBe(true)
    const retry = tryMove(p, wrong.state, 'g4h6')
    expect(retry.result).toBe('correct')
    expect(retry.state.failed).toBe(true)
  })

  it('accepts another mate on the last move', () => {
    const p = puzzle('ALT 6k1/6pp/8/8/8/8/8/RR4K1_b_-_-_0_1 g8h8,a1a8 900 mate,mateIn1')
    expect(tryMove(p, startSolve(p), 'b1b8').result).toBe('solved')
    expect(tryMove(p, startSolve(p), 'b1b7').result).toBe('wrong')
  })

  it('promotion must match', () => {
    const p = puzzle('PRO k7/4P3/8/8/8/8/8/K7_b_-_-_0_1 a8b7,e7e8q 900 promotion')
    expect(tryMove(p, startSolve(p), 'e7e8n').result).toBe('wrong')
    expect(tryMove(p, startSolve(p), 'e7e8q').result).toBe('solved')
  })

  it('reveals the rest of the solution', () => {
    const p = puzzle(MATE_IN_2)
    const shown = revealSolution(p, tryMove(p, startSolve(p), 'g4h6').state)
    expect(shown.played).toEqual(p.moves)
    expect(shown.revealed).toBe(true)
    expect(shown.solved).toBe(false)
  })
})

describe('newRating', () => {
  it('moves fast at first, then settles', () => {
    expect(newRating(1500, 1500, true, 0)).toBe(1530)
    expect(newRating(1500, 1500, false, 0)).toBe(1470)
    expect(newRating(1500, 1500, true, 10)).toBe(1516)
    expect(newRating(1500, 1500, true, 50)).toBe(1508)
  })

  it('wins less against an easier puzzle', () => {
    expect(newRating(1500, 1100, true, 50)).toBeLessThan(1503)
    expect(newRating(1500, 1100, false, 50)).toBeLessThan(1487)
  })
})

describe('pickBand', () => {
  const bands = [400, 500, 600, 2800]
  it('picks a band around the rating', () => {
    expect(pickBand(550, bands, () => 0.5)).toBe(500)
    expect(pickBand(550, bands, () => 1)).toBe(600)
    expect(pickBand(550, bands, () => 0)).toBe(400)
  })

  it('clamps to the bands that exist', () => {
    expect(pickBand(100, bands, () => 0.5)).toBe(400)
    expect(pickBand(3200, bands, () => 0.5)).toBe(2800)
    expect(pickBand(1500, bands, () => 0.5)).toBe(600)
  })
})

describe('dailyIndex', () => {
  it('counts UTC days from 2026-01-01 and wraps', () => {
    expect(dailyIndex(new Date(Date.UTC(2026, 0, 1, 23, 59)), 1000)).toBe(0)
    expect(dailyIndex(new Date(Date.UTC(2026, 0, 2)), 1000)).toBe(1)
    expect(dailyIndex(new Date(Date.UTC(2026, 0, 3)), 2)).toBe(0)
    expect(dailyIndex(new Date(Date.UTC(2025, 11, 31)), 1000)).toBe(999)
  })
})

describe('themeLabels', () => {
  it('names the tactics and leaves out bookkeeping themes', () => {
    expect(themeLabels(['crushing', 'fork', 'middlegame', 'short', 'mateIn2', 'backRankMate'])).toEqual(['Fork', 'Middlegame', 'Mate in 2', 'Back rank mate'])
  })
})

describe('sprintRating', () => {
  it('starts easy and climbs to a cap', () => {
    expect(sprintRating(0)).toBe(600)
    expect(sprintRating(10)).toBe(1200)
    expect(sprintRating(100)).toBe(2800)
  })
})

describe('DIFFICULTY', () => {
  it('shifts the pick around your rating', () => {
    expect(DIFFICULTY.easiest.offset).toBe(-600)
    expect(DIFFICULTY.normal.offset).toBe(0)
    expect(DIFFICULTY.hardest.offset).toBe(600)
  })
})
