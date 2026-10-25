import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PositionEval } from '../hooks/useAnalysis'
import { backUp, type DeepLine } from './backup'
import { classifyGame } from './classify'
import { cloudOpening } from './cloudEval'
import { addLine, createTree, mainline, ROOT_ID, treeFromPgn, type MoveNode } from './tree'
import type { Score } from './uci'
import kasparov from './fixtures/backup-kasparov-topalov.json'
import kasparovCloud from './fixtures/backup-kasparov-topalov-cloud.json'
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
function recorded(fx: { pgn: string; evals: unknown; deep?: unknown }) {
  const line = mainline(treeFromPgn(fx.pgn).tree)
  return { line, evals: fx.evals as Record<string, PositionEval>, deep: (fx.deep ?? {}) as Record<string, DeepLine[]> }
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
    const deep = {
      [line[3].fen]: [
        { move: 'd7d6', score: cp(30), pv: ['d7d6'] },
        { move: 'b8c6', score: cp(550), pv: ['b8c6'] },
      ],
    }
    const { evals: backed, need } = backUp(line, evals, deep)
    expect(need).toEqual([])
    const report = classifyGame(line, backed)
    expect(report.moves[line[4].id]).toMatchObject({ cls: 'blunder', bestMove: 'd7d6' })
    expect(report.moves[line[3].id].cls).toBe('best')
    // Worth the game's +6 less the gap that one search saw between the two moves (+5.5 against +0.3).
    expect(backed[line[3].fen]).toMatchObject({ bestMove: 'd7d6', score: cp(49) })
  })

  it('blames only by the smallest gap any search that ranks both moves sees', () => {
    // The review's own search has 2…Nc6 nearly as good as 2…d6; a deeper one thinks it loses 5 pawns more.
    const { line, evals } = game(UCIS, [
      { score: cp(20), bestMove: 'e2e4' },
      { score: cp(20), bestMove: 'e7e5' },
      { score: cp(20), bestMove: 'g1f3' },
      { score: cp(20), bestMove: 'd7d6', second: cp(35), secondMove: 'b8c6' },
      { score: cp(600) },
    ])
    const deep = {
      [line[3].fen]: [
        { move: 'd7d6', score: cp(30), pv: ['d7d6'] },
        { move: 'b8c6', score: cp(550), pv: ['b8c6'] },
      ],
    }
    const report = classifyGame(line, backUp(line, evals, deep).evals)
    expect(report.moves[line[4].id]).toMatchObject({ cls: 'excellent', bestMove: 'd7d6' })
  })

  it('takes a cloud eval as it is: it’s deeper than any search we would add', () => {
    const { line, evals } = game(UCIS, [
      { score: cp(20), bestMove: 'e2e4', cloud: true },
      { score: cp(20), bestMove: 'e7e5', cloud: true },
      { score: cp(20), bestMove: 'g1f3', cloud: true },
      { score: cp(20), bestMove: 'd7d6', cloud: true },
      { score: cp(600) },
    ])
    const { evals: backed, need } = backUp(line, evals, {})
    expect(need).toEqual([])
    expect(classifyGame(line, backed).moves[line[4].id]).toMatchObject({ cls: 'blunder', bestMove: 'd7d6' })
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
  const verdicts = (fx: { pgn: string; evals: unknown; deep?: unknown }) => {
    const { line, evals, deep } = recorded(fx)
    const backed = backUp(line, evals, deep)
    const report = classifyGame(line, backed.evals)
    return { need: backed.need, cls: (san: string, ply: number) => report.moves[at(line, san, ply).id].cls }
  }

  describe('from our own engine (depth 16, then 20)', () => {
    const { need, cls } = verdicts(kasparov)

    it('settles with the recorded deeper searches', () => {
      expect(need).toEqual([])
    })

    it('no longer blames 36…Rd2, which was Best on a bogus 0.00', () => {
      expect(['best', 'excellent']).toContain(cls('Rd2', 72))
    })

    it('stops calling forced moves in a lost position Clutch', () => {
      expect(cls('Kxc3', 66)).toBe('best')
      expect(cls('Kd2', 68)).toBe('best')
      expect(cls('Kd1', 70)).toBe('best')
    })
  })

  describe('from the Lichess cloud (depth 28 to 75)', () => {
    const { need, cls } = verdicts(kasparovCloud)

    it('trusts the cloud: nothing to search deeper', () => {
      expect(need).toEqual([])
    })

    it('finds the real error, 24…cxd4, keeps 36…Rd2 Best and 31…Kxa3 a small slip', () => {
      expect(cls('cxd4', 48)).toBe('blunder')
      expect(cls('Rd2', 72)).toBe('best')
      // 31…Kxa3 gave up only what the cloud itself sees between it and 31…Rd1+ (+3.04 against +2.47).
      expect(['good', 'inaccuracy']).toContain(cls('Kxa3', 62))
    })

    it('calls 39.Qxh8 Best, not Clutch: 39.Qc2 would still keep White well ahead', () => {
      expect(cls('Qxh8', 77)).toBe('best')
    })

    it('marks the famous sacrifices Legendary', () => {
      for (const [san, ply] of [['Rxd4', 47], ['Re7+', 49], ['Qxd4+', 51], ['Rxb7', 59], ['Bf1', 71]] as const) expect(cls(san, ply)).toBe('brilliant')
    })
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

describe('the opening from the Lichess cloud', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stops asking at the first position the cloud doesn’t have', async () => {
    const { line } = game(UCIS, [])
    const fetch = vi.fn(async (url: string) => {
      const fen = decodeURIComponent(url.split('fen=')[1])
      if (fen === line[2].fen) return new Response('', { status: 404 })
      return Response.json({ depth: 40, pvs: [{ moves: 'e2e4 e7e5', cp: 18 }, { moves: 'd2d4 d7d5', cp: 15 }] })
    })
    vi.stubGlobal('fetch', fetch)
    const found = await cloudOpening(line.map((n) => n.fen), new AbortController().signal)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(Object.keys(found)).toEqual([line[0].fen, line[1].fen])
    expect(found[line[0].fen]).toMatchObject({ score: cp(18), bestMove: 'e2e4', second: cp(15), depth: 40, cloud: true })
  })

  it('skips shallow cloud evals and stops when Lichess says no', async () => {
    const { line } = game(UCIS, [])
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ depth: 12, pvs: [{ moves: 'e2e4', cp: 30 }] })))
    expect(await cloudOpening(line.map((n) => n.fen), new AbortController().signal)).toEqual({})
    const refused = vi.fn(async () => new Response('', { status: 429 }))
    vi.stubGlobal('fetch', refused)
    expect(await cloudOpening(line.map((n) => n.fen), new AbortController().signal)).toEqual({})
    // And it doesn't ask again for a while.
    expect(await cloudOpening(line.map((n) => n.fen), new AbortController().signal)).toEqual({})
    expect(refused).toHaveBeenCalledTimes(1)
  })
})
