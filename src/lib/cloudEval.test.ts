import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_POSITION } from 'chess.js'
import { cloudEval, standardMoves } from './cloudEval'

const answer = (pvs: { moves: string; cp?: number }[]) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ depth: 40, pvs })))
const signal = new AbortController().signal

afterEach(() => vi.unstubAllGlobals())

describe('cloudEval', () => {
  const ITALIAN = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'

  it('writes castling as the king’s own move, as the engine does: Lichess writes it as king takes rook', async () => {
    answer([
      { moves: 'e1h1 g8f6 d2d3 e8h8 c2c3', cp: 20 },
      { moves: 'd2d3 g8f6 e1h1', cp: 10 },
    ])
    const entry = await cloudEval(ITALIAN, signal)
    expect(entry).toMatchObject({ bestMove: 'e1g1', pv: ['e1g1', 'g8f6', 'd2d3', 'e8g8', 'c2c3'], secondMove: 'd2d3', depth: 40, cloud: true })
  })

  it('takes the second line’s first move the same way', async () => {
    answer([
      { moves: 'd2d3 g8f6', cp: 20 },
      { moves: 'e1h1 g8f6', cp: 10 },
    ])
    expect(await cloudEval(ITALIAN, signal)).toMatchObject({ secondMove: 'e1g1' })
  })

  it('leaves a rook that really moves from e1 to h1 alone', async () => {
    answer([{ moves: 'e1h1 g8h8', cp: 20 }])
    expect(await cloudEval('6k1/5ppp/8/8/8/8/5PPK/4R3 w - - 0 1', signal)).toMatchObject({ bestMove: 'e1h1' })
  })

  it('keeps what it could read of a line that goes wrong', async () => {
    answer([{ moves: 'd2d3 g8f6 a1a8', cp: 20 }])
    expect(await cloudEval(ITALIAN, signal)).toMatchObject({ pv: ['d2d3', 'g8f6'] })
  })
})

describe('standardMoves', () => {
  it('reads the king taking its rook as castling', () => {
    expect(standardMoves(DEFAULT_POSITION, 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1h1')).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1'])
  })

  it('leaves a queen going e8 to h8 alone (it once became Qg8 in an online game)', () => {
    const fen = '4Q3/8/7k/8/8/8/8/4K3 w - - 0 1'
    expect(standardMoves(fen, 'e8h8')).toEqual(['e8h8'])
  })
})
