import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloudEval } from './cloudEval'

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
