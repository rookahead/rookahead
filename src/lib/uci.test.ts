import { describe, expect, it } from 'vitest'
import { parseBestMove, parseInfo } from './uci'

describe('parseInfo', () => {
  it('parses a full multipv line with wdl (real Stockfish 19 output)', () => {
    const line =
      'info depth 12 seldepth 17 multipv 1 score cp 31 wdl 60 935 5 nodes 117813 nps 770019 hashfull 32 time 153 pv d2d4 e5d4 f3d4 g8f6'
    expect(parseInfo(line)).toEqual({
      depth: 12,
      seldepth: 17,
      multipv: 1,
      score: { type: 'cp', value: 31 },
      wdl: [60, 935, 5],
      nodes: 117813,
      nps: 770019,
      time: 153,
      pv: ['d2d4', 'e5d4', 'f3d4', 'g8f6'],
    })
  })

  it('parses mate scores and defaults multipv to 1', () => {
    const info = parseInfo('info depth 10 seldepth 2 score mate -3 nodes 10 pv a1a8')
    expect(info?.score).toEqual({ type: 'mate', value: -3 })
    expect(info?.multipv).toBe(1)
  })

  it('flags aspiration-window bounds', () => {
    expect(parseInfo('info depth 20 multipv 1 score cp 45 lowerbound nodes 1 pv e2e4')?.bound).toBe('lower')
    expect(parseInfo('info depth 20 multipv 1 score cp 45 upperbound nodes 1 pv e2e4')?.bound).toBe('upper')
  })

  it('ignores lines without a PV or that are strings', () => {
    expect(parseInfo('info depth 0 score mate 0')).toBeNull()
    expect(parseInfo('info string NNUE evaluation using nn-61e7af4bb97d.nnue')).toBeNull()
    expect(parseInfo('info currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })
})

describe('parseBestMove', () => {
  it('extracts the move, null for (none), undefined for other lines', () => {
    expect(parseBestMove('bestmove d2d4 ponder e5d4')).toBe('d2d4')
    expect(parseBestMove('bestmove (none)')).toBeNull()
    expect(parseBestMove('readyok')).toBeUndefined()
  })
})
