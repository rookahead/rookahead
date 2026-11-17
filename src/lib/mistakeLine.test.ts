import { describe, expect, it } from 'vitest'
import { forcing, lineGoal, lineSan, mateFor, onlyMove, planFrom, tacticEnd } from './mistakeLine'

const SCHOLAR = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'
// Nc7+ forks the king on e8 and the rook on a8.
const FORK = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1'
const FORK_LINE = ['b5c7', 'e8d7', 'c7a8']

describe('mateFor', () => {
  it('reads a mate for the side asked about, White POV', () => {
    expect(mateFor({ type: 'mate', value: 3 }, 'white')).toBe(3)
    expect(mateFor({ type: 'mate', value: -2 }, 'black')).toBe(2)
    expect(mateFor({ type: 'mate', value: -2 }, 'white')).toBeNull()
    expect(mateFor({ type: 'cp', value: 900 }, 'white')).toBeNull()
  })
})

describe('tacticEnd', () => {
  it('ends on the move that wins the piece and keeps it', () => {
    expect(tacticEnd(FORK, 'white', FORK_LINE)).toMatchObject({ end: 2, gain: 5 })
  })

  it('finds nothing when the material comes straight back', () => {
    // Nxe5 wins a pawn and Black takes nothing back, but a pawn isn't a tactic; a trade isn't either.
    expect(tacticEnd('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', 'white', ['f3e5']).end).toBe(-1)
    expect(tacticEnd('4k3/8/3n4/4p3/8/5N2/8/4K3 w - - 0 1', 'white', ['f3e5', 'd6e4']).end).toBe(-1)
  })
})

describe('planFrom', () => {
  it('plays a missed mate out to the mate', () => {
    const plan = planFrom(SCHOLAR, 'white', { score: { type: 'mate', value: 1 }, pv: ['h5f7'] }, 'h5f7', { type: 'mate', value: 1 })
    expect(plan).toMatchObject({ kind: 'mate', mateIn: 1, moves: ['h5f7'] })
    expect(lineGoal(plan, 'd3')).toBe('You missed a mate in one. Find it.')
  })

  it('cuts a mate line at your mating move', () => {
    const pv = ['a1a2', 'b1b2', 'a2a3', 'b2b3', 'a3a4', 'b3b4']
    expect(planFrom(SCHOLAR, 'white', { score: { type: 'mate', value: 2 }, pv }, 'x', { type: 'cp', value: 0 }).moves).toEqual(pv.slice(0, 3))
  })

  it('plays a tactic out to the piece it wins', () => {
    const plan = planFrom(FORK, 'white', { score: { type: 'cp', value: 600 }, pv: [...FORK_LINE, 'd7c7'] }, 'b5c7', { type: 'cp', value: 600 })
    expect(plan).toMatchObject({ kind: 'tactic', moves: FORK_LINE, wins: 'a rook' })
    expect(lineGoal(plan, 'Kd2')).toBe('You missed a way to win a rook. Find it.')
  })

  it('makes a quiet move, or a piece taken at once, a few good moves in a row', () => {
    const pv = ['e1d2', 'e8d7', 'd2e3', 'd7e6', 'e3f4', 'e6f6', 'f4g5']
    const quiet = planFrom(FORK, 'white', { score: { type: 'cp', value: 40 }, pv }, 'x', { type: 'cp', value: 0 })
    expect(quiet).toMatchObject({ kind: 'line', moves: pv })
    expect(lineGoal(quiet, 'Kf2')).toBe('Find a better move than Kf2.')
    const hanging = '4k3/8/8/8/8/8/1r6/RK6 w - - 0 1'
    expect(planFrom(hanging, 'white', { score: { type: 'cp', value: 500 }, pv: ['b1b2', 'e8d7'] }, 'x', { type: 'cp', value: 0 }).kind).toBe('line')
  })

  it('falls back to one move when the engine has nothing', () => {
    expect(lineGoal(planFrom(FORK, 'white', null, 'e1d2', { type: 'cp', value: 0 }), 'Kf2')).toBe('Find a better move than Kf2.')
  })

  it('plays a mate the other side has, or one too long to play, as good moves in a row', () => {
    expect(planFrom(SCHOLAR, 'white', { score: { type: 'mate', value: -3 }, pv: ['h5f7'] }, 'x', { type: 'cp', value: 0 }).kind).toBe('line')
    expect(planFrom(SCHOLAR, 'white', { score: { type: 'mate', value: 12 }, pv: ['h5f7'] }, 'x', { type: 'cp', value: 0 }).kind).toBe('line')
  })
})

describe('lineSan', () => {
  it('numbers a line, starting with Black when it is Black to move', () => {
    expect(lineSan(FORK, FORK_LINE)).toBe('1. Nc7+ Kd7 2. Nxa8')
    expect(lineSan('r3k3/8/8/8/8/8/8/4K3 b - - 0 7', ['e8d7', 'e1d2'])).toBe('7… Kd7 8. Kd2')
  })
})

describe('onlyMove', () => {
  it('goes on while the next best is far behind, for either side', () => {
    expect(onlyMove({ type: 'cp', value: 600 }, { type: 'cp', value: 0 }, 'white')).toBe(true)
    expect(onlyMove({ type: 'cp', value: 600 }, { type: 'cp', value: 560 }, 'white')).toBe(false)
    expect(onlyMove({ type: 'cp', value: -600 }, { type: 'cp', value: -50 }, 'black')).toBe(true)
    expect(onlyMove({ type: 'cp', value: 0 }, undefined, 'black')).toBe(true)
  })
})

describe('forcing', () => {
  // The queen ending from a real game: the checks chase the king, then the b-pawn runs.
  const QUEENS = 'k7/2KP4/p3q3/8/1p2PB2/6P1/8/8 b - - 1 65'
  it('counts checks, captures, promotions and far-advanced pawn pushes', () => {
    expect(forcing(QUEENS, 'e6c4')).toBe(true)
    expect(forcing(QUEENS, 'e6e4')).toBe(true)
    expect(forcing(QUEENS, 'b4b3')).toBe(true)
    expect(forcing(QUEENS, 'a6a5')).toBe(false)
    expect(forcing(QUEENS, 'e6e8')).toBe(false)
  })
})
