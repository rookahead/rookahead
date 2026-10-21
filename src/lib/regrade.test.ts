import { describe, expect, it } from 'vitest'
import type { PositionEval } from '../hooks/useAnalysis'
import { classifyGame, RULES_VERSION } from './classify'
import { isStale, regrade, reviewLines } from './regrade'
import type { CachedReview } from './reviewCache'
import { decodeShare, encodeShare, toSharedGame } from './share'
import { addLine, createTree, mainline, ROOT_ID } from './tree'

describe('regrade', () => {
  // 1.Rd4 exd4: a rook given up for a pawn, level afterwards. Legendary under today's rules.
  const { tree } = addLine(createTree('6k1/8/8/4p3/8/8/8/3R2K1 w - - 0 1'), ROOT_ID, ['d1d4'])
  const line = mainline(tree)
  const evals: Record<string, PositionEval> = {
    [line[0].fen]: { score: { type: 'cp', value: 100 }, bestMove: 'd1d5', pv: ['d1d5', 'g8f7'], depth: 16, second: { type: 'cp', value: 90 } },
    [line[1].fen]: { score: { type: 'cp', value: 95 }, bestMove: 'e5d4', pv: ['e5d4'], depth: 16 },
  }

  /** A review saved under older rules, which called the move Solid. */
  async function oldReview(lines = true): Promise<CachedReview> {
    const report = classifyGame(line, evals)
    report.moves[line[1].id] = { ...report.moves[line[1].id], cls: 'good' }
    const token = await encodeShare(toSharedGame(line, {}, 'white', { evals, report, depth: 16 }))
    return { token, white: '', black: '', accuracy: report.accuracy, brilliant: { white: 0, black: 0 }, at: 1, rules: RULES_VERSION - 1, lines: lines ? reviewLines(line, evals) : undefined }
  }

  it("grades a review saved under older rules again from what it saved, as a fresh review would", async () => {
    const old = await oldReview()
    expect(isStale(old)).toBe(true)
    const done = await regrade(old, () => false)
    expect(done).not.toBeNull()
    expect(isStale(done!.review)).toBe(false)
    expect(done!.review.brilliant.white).toBe(1)
    const shared = await decodeShare(done!.review.token)
    expect('error' in shared ? null : shared.review?.classes).toEqual([classifyGame(line, evals).moves[line[1].id].cls])
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('needs the engine again for a review saved before reviews kept their lines', async () => {
    expect(await regrade(await oldReview(false), () => false)).toBeNull()
  })
})
