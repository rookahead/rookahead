import { describe, expect, it } from 'vitest'
import type { AnalysisResult, AnalyzeRequest, StockfishEngine } from '../engine/Engine'
import { mainline, treeFromPgn } from '../lib/tree'
import { depthOfReview, searchGame, type PositionEval } from './useAnalysis'

const at = (depth: number, pv = ['e2e4']): PositionEval => ({ score: { type: 'cp', value: 0 }, bestMove: pv[0] ?? null, pv, depth })

describe('depthOfReview', () => {
  it('is the depth most positions reached, not one cut short by the node cap', () => {
    expect(depthOfReview({ a: at(16), b: at(16), c: at(14), d: at(16) })).toBe(16)
  })

  it('ignores game-over positions, which have no search behind them', () => {
    expect(depthOfReview({ a: at(12), b: at(20, []), c: at(20, []) })).toBe(12)
  })

  it('ignores a depth no review runs at: saved reviews could carry the cloud’s for every position', () => {
    expect(depthOfReview({ a: at(75), b: at(75) })).toBeNull()
    expect(depthOfReview({ a: at(55, ['e2e4']), b: at(16), c: at(16) })).toBe(16)
  })

  it('is null with nothing reviewed', () => {
    expect(depthOfReview({})).toBeNull()
  })
})

describe('searchGame', () => {
  const line = mainline(treeFromPgn('1. e4 e5').tree)
  const result = (fen: string, depth: number, cutShort?: boolean): AnalysisResult => ({
    fen,
    depth,
    bestMove: 'e2e4',
    cutShort,
    lines: [{ multipv: 1, depth, score: { type: 'cp', value: depth }, pv: ['e2e4'] }],
  })
  const engine = (analyze: (r: AnalyzeRequest) => AnalysisResult) => ({ ready: Promise.resolve(), analyze: async (r: AnalyzeRequest) => analyze(r) }) as unknown as StockfishEngine
  const options = { depth: 16, cloud: false, signal: new AbortController().signal, live: () => true }

  it('searches again when the watchdog cut a search short: a shallow result would change the verdict', async () => {
    const asked = new Map<string, number>()
    const evals = await searchGame(
      line,
      [
        engine(({ fen }) => {
          asked.set(fen, (asked.get(fen) ?? 0) + 1)
          return asked.get(fen) === 1 ? result(fen, 7, true) : result(fen, 16)
        }),
      ],
      options,
      () => {},
    )
    expect(Object.values(evals!).map((e) => e.depth)).toEqual(line.map(() => 16))
  })

  it('leaves a position out rather than keep a search that never finished', async () => {
    const evals = await searchGame(line, [engine(({ fen }) => result(fen, 7, true))], options, () => {})
    expect(Object.keys(evals!)).toEqual([])
  })
})
