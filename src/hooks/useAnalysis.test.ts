import { describe, expect, it } from 'vitest'
import { depthOfReview, type PositionEval } from './useAnalysis'

const at = (depth: number, pv = ['e2e4']): PositionEval => ({ score: { type: 'cp', value: 0 }, bestMove: pv[0] ?? null, pv, depth })

describe('depthOfReview', () => {
  it('is the depth most positions reached, not one cut short by the node cap', () => {
    expect(depthOfReview({ a: at(16), b: at(16), c: at(14), d: at(16) })).toBe(16)
  })

  it('ignores game-over positions, which have no search behind them', () => {
    expect(depthOfReview({ a: at(12), b: at(20, []), c: at(20, []) })).toBe(12)
  })

  it('is null with nothing reviewed', () => {
    expect(depthOfReview({})).toBeNull()
  })
})
