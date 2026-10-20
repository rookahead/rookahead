import { describe, expect, it } from 'vitest'
import type { EngineLine } from '../engine/Engine'
import { bookMove, candidates, decide, isComplete, losses, pickLapse, sample, type BotStyle } from './botMove'

const line = (uci: string, cp: number): EngineLine => ({ multipv: 1, depth: 8, score: { type: 'cp', value: cp }, pv: [uci] })
/** A fixed sequence of "random" numbers. */
const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}
const style: BotStyle = { lapse: 0.2, blunderShare: 0.5, noise: 4 }

// Mover's win%: best 60, fine 57, mistake 45, blunder 10.
const moves = [
  { uci: 'e2e4', win: 60, cp: 40 },
  { uci: 'd2d4', win: 57, cp: 30 },
  { uci: 'f2f3', win: 45, cp: -50 },
  { uci: 'd1h5', win: 10, cp: -500 },
]

describe('candidates', () => {
  it('scores each move from the mover’s side', () => {
    const lines = [line('e2e4', 0), line('a2a3', -1000)]
    expect(candidates(lines, 'white').map((m) => Math.round(m.win))).toEqual([50, 2])
    expect(candidates(lines, 'black').map((m) => Math.round(m.win))).toEqual([50, 98])
    expect(candidates(lines, 'black').map((m) => m.cp)).toEqual([-0, 1000])
  })

  it('values a quicker mate above a slower one, and both above any material', () => {
    const mate = (uci: string, value: number): EngineLine => ({ multipv: 1, depth: 8, score: { type: 'mate', value }, pv: [uci] })
    const [m1, m3, rook, mated] = candidates([mate('h5f7', 1), mate('d1h5', 3), line('a1a8', 900), mate('g1h1', -2)], 'white')
    expect(m1.cp).toBeGreaterThan(m3.cp)
    expect(m3.cp).toBeGreaterThan(rook.cp)
    expect(mated.cp).toBeLessThan(-9000)
  })
})

describe('underpromotions', () => {
  it('are dropped unless they beat the queen', () => {
    // b8=N wins more (a fork); c8=B only ties with c8=Q.
    const lines = [line('b7b8q', 300), line('b7b8r', 300), line('b7b8n', 400), line('c7c8q', 500), line('c7c8b', 500)]
    expect(candidates(lines, 'white').map((m) => m.uci)).toEqual(['b7b8q', 'b7b8n', 'c7c8q'])
  })
})

describe('isComplete', () => {
  const at = (uci: string, depth: number): EngineLine => ({ ...line(uci, 0), depth })
  it('needs every legal move scored at the same depth', () => {
    expect(isComplete([at('e2e4', 9), at('d2d4', 9)], 2)).toBe(true)
    expect(isComplete([at('e2e4', 10), at('d2d4', 9)], 2)).toBe(false)
    expect(isComplete([at('e2e4', 9)], 2)).toBe(false)
  })
})

describe('losses', () => {
  it('counts win% lost, or material once the game is decided', () => {
    expect(losses(moves)).toEqual([0, 3, 15, 50])
    // +15 and +8 are both "won" by win%, but dropping seven pawns still costs.
    const won = [
      { uci: 'a', win: 97.5, cp: 1500 },
      { uci: 'b', win: 97.5, cp: 800 },
    ]
    expect(losses(won)[1]).toBeCloseTo(700 / 15)
  })
})

describe('sample', () => {
  it('favours better moves, more sharply with less noise', () => {
    const two = [
      { uci: 'a', win: 60, cp: 0 },
      { uci: 'b', win: 55, cp: 0 },
    ]
    // Weights 1 and e^(-5/noise): the cut-off between them moves with the noise.
    expect(sample(two, 5, () => 0.7)).toBe('a')
    expect(sample(two, 5, () => 0.75)).toBe('b')
    expect(sample(two, 1, () => 0.99)).toBe('a')
  })
})

describe('decide', () => {
  it('plays only sound moves when it doesn’t lapse', () => {
    for (const r of [0.3, 0.5, 0.99]) {
      const step = decide(moves, style, seq(0.9, r))
      expect('move' in step && ['e2e4', 'd2d4'].includes(step.move)).toBe(true)
    }
  })

  it('on a lapse, offers the blunders or the mistakes', () => {
    expect(decide(moves, style, seq(0.1, 0.2))).toEqual({ lapse: [moves[3]] })
    expect(decide(moves, style, seq(0.1, 0.8))).toEqual({ lapse: [moves[2]] })
  })

  it('falls back to the other kind, or to a sound move when nothing loses', () => {
    expect(decide(moves.slice(0, 3), style, seq(0.1, 0.2))).toEqual({ lapse: [moves[2]] })
    const step = decide(moves.slice(0, 2), style, seq(0.1, 0.2, 0))
    expect(step).toEqual({ move: 'e2e4' })
  })
})

describe('pickLapse', () => {
  it('picks the bad move that looks best one move deep', () => {
    const pool = [
      { uci: 'd1h5', win: 10, cp: -600 },
      { uci: 'c3d5', win: 12, cp: -550 },
    ]
    // At a glance the knight jump looks great (the refutation is two moves deep); the queen hangs.
    const glance = [
      { uci: 'd1h5', win: 20, cp: -400 },
      { uci: 'c3d5', win: 65, cp: 150 },
    ]
    expect(pickLapse(pool, glance, style, () => 0.99)).toBe('c3d5')
  })

  it('gives up on a lapse whose every bad move is plainly bad, for a strong style', () => {
    const pool = [{ uci: 'd1h5', win: 10, cp: -600 }]
    const glance = [
      { uci: 'e2e4', win: 55, cp: 50 },
      { uci: 'd1h5', win: 20, cp: -400 },
    ]
    expect(pickLapse(pool, glance, { ...style, sight: 10 })).toBeNull()
    expect(pickLapse(pool, glance, style)).toBe('d1h5')
  })
})

describe('bookMove', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const book = new Set(['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'])
  const isBook = (fen: string) => book.has(fen)

  it('plays a move that stays in the book', () => {
    expect(bookMove(moves, start, isBook, () => 0.5)).toBe('e2e4')
  })

  it('gives up once nothing is in the book', () => {
    expect(bookMove([{ uci: 'a2a3', win: 50, cp: 0 }], start, isBook)).toBeNull()
  })
})

describe('bookMove soundness', () => {
  it('skips a book move the engine thinks is bad', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const isBook = () => true
    const moves = [
      { uci: 'e2e4', win: 55, cp: 30 },
      { uci: 'g2g4', win: 40, cp: -120 },
    ]
    for (const r of [0, 0.5, 0.99]) expect(bookMove(moves, start, isBook, () => r)).toBe('e2e4')
  })
})
