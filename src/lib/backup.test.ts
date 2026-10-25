import { describe, expect, it } from 'vitest'
import type { PositionEval } from '../hooks/useAnalysis'
import { backUp, type DeepLine } from './backup'
import { classifyGame } from './classify'
import { addLine, createTree, mainline, ROOT_ID, treeFromPgn, type MoveNode } from './tree'
import type { Score } from './uci'
import kasparov from './fixtures/backup-kasparov-topalov.json'
import melonlord from './fixtures/backup-melonlord.json'

const cp = (value: number): Score => ({ type: 'cp', value })

function game(ucis: string[], entries: (Partial<PositionEval> & { score: Score })[]) {
  const { tree } = addLine(createTree(), ROOT_ID, ucis)
  const line = mainline(tree)
  const evals: Record<string, PositionEval> = {}
  line.forEach((node, i) => (evals[node.fen] = { bestMove: null, pv: [], depth: 16, ...entries[i] }))
  return { line, evals }
}

/** A recorded review: the depth-16 evals, and the deeper searches the back-up asked for (depth 20). */
function recorded(fx: { pgn: string; evals: unknown; deep: unknown }) {
  const line = mainline(treeFromPgn(fx.pgn).tree)
  return { line, evals: fx.evals as Record<string, PositionEval>, deep: fx.deep as Record<string, DeepLine[]> }
}

const at = (line: MoveNode[], san: string, ply: number) => line.find((n) => n.san === san && n.ply === ply)!

// 1.e4 e5 2.Nf3 Nc6, where only the position after 2…Nc6 shows what the earlier searches missed.
const UCIS = ['e2e4', 'e7e5', 'g1f3', 'b8c6']

describe('backing up the evals', () => {
  it('never blames the engine’s own move for a jump that comes after it', () => {
    const { line, evals } = game(UCIS, [
      { score: cp(20), bestMove: 'e2e4' },
      { score: cp(20), bestMove: 'e7e5' },
      { score: cp(20), bestMove: 'g1f3' },
      { score: cp(20), bestMove: 'b8c6' },
      { score: cp(600) },
    ])
    const { evals: backed, need } = backUp(line, evals, {})
    // The position before 2…Nc6 is the first to disagree with what came after.
    expect(need[0]).toBe(line[3].fen)
    const report = classifyGame(line, backed)
    expect(line.slice(1).map((n) => report.moves[n.id].cls)).toEqual(['best', 'best', 'best', 'best'])
    // Every position is worth what the game went on to show.
    expect(line.map((n) => backed[n.fen].score)).toEqual(Array(5).fill(cp(600)))
  })

  it('blames the move where a deeper look finds something better', () => {
    const { line, evals } = game(UCIS, [
      { score: cp(20), bestMove: 'e2e4' },
      { score: cp(20), bestMove: 'e7e5' },
      { score: cp(20), bestMove: 'g1f3' },
      { score: cp(20), bestMove: 'd7d6' },
      { score: cp(600) },
    ])
    const deep = { [line[3].fen]: [{ move: 'd7d6', score: cp(30), pv: ['d7d6'] }] }
    const { evals: backed, need } = backUp(line, evals, deep)
    expect(need).toEqual([])
    const report = classifyGame(line, backed)
    expect(report.moves[line[4].id]).toMatchObject({ cls: 'blunder', bestMove: 'd7d6' })
    expect(report.moves[line[3].id].cls).toBe('best')
    expect(backed[line[3].fen].score).toEqual(cp(30))
  })

  it('needs no deeper look where the searches agree, and changes no verdict', () => {
    const { line, evals } = game(UCIS, [
      { score: cp(20), bestMove: 'e2e4' },
      { score: cp(25), bestMove: 'e7e5' },
      { score: cp(30), bestMove: 'g1f3' },
      { score: cp(20), bestMove: 'b8c6' },
      { score: cp(25) },
    ])
    const { evals: backed, need } = backUp(line, evals, {})
    expect(need).toEqual([])
    const classes = (e: Record<string, PositionEval>) => Object.values(classifyGame(line, e).moves).map((m) => m.cls)
    expect(classes(backed)).toEqual(classes(evals))
  })
})

describe('Kasparov–Topalov, Wijk aan Zee 1999', () => {
  const { line, evals, deep } = recorded(kasparov)
  const backed = backUp(line, evals, deep)
  const report = classifyGame(line, backed.evals)
  const cls = (san: string, ply: number) => report.moves[at(line, san, ply).id].cls

  it('settles with the recorded deeper searches', () => {
    expect(backed.need).toEqual([])
  })

  it('puts the error where it was made: 24…cxd4, not 36…Rd2', () => {
    // At depth 16 the eval only creeps up after 24…cxd4 (an inaccuracy), and 36…Rd2 was Best on a bogus 0.00.
    expect(classifyGame(line, evals).moves[at(line, 'cxd4', 48).id].cls).toBe('inaccuracy')
    expect(cls('cxd4', 48)).toBe('mistake')
    expect(['best', 'excellent']).toContain(cls('Rd2', 72))
  })

  it('stops calling forced moves in a lost position Clutch', () => {
    expect(cls('Kxc3', 66)).toBe('best')
    expect(cls('Kd2', 68)).toBe('best')
    expect(cls('Kd1', 70)).toBe('best')
  })
})

describe('an ordinary game', () => {
  it('keeps its real blunder and barely moves', () => {
    const { line, evals, deep } = recorded(melonlord)
    const backed = backUp(line, evals, deep)
    expect(backed.need).toEqual([])
    const before = classifyGame(line, evals)
    const after = classifyGame(line, backed.evals)
    expect(after.moves[at(line, 'Rab8', 40).id].cls).toBe('blunder')
    expect(Math.abs(after.accuracy.white! - before.accuracy.white!)).toBeLessThan(1)
    expect(Math.abs(after.accuracy.black! - before.accuracy.black!)).toBeLessThan(2)
  })
})
