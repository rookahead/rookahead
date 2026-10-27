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
import centerGame from './fixtures/backup-melonlord-center-game.json'

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
    // That search had 2…Nc6 at +5.5, about what the game showed (+6): its +0.3 for 2…d6 stands.
    expect(backed[line[3].fen]).toMatchObject({ bestMove: 'd7d6', score: cp(30) })
  })

  it('blames only by the smallest gap any search that ranks both moves sees, when none saw the move as the game did', () => {
    // The review's own search has 2…Nc6 nearly as good as 2…d6; a deeper one thinks it loses 1.7 pawns more,
    // but the game showed 2…Nc6 at +6: neither saw what was coming, so neither can vouch for 2…d6.
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
        { move: 'b8c6', score: cp(200), pv: ['b8c6'] },
      ],
    }
    const report = classifyGame(line, backUp(line, evals, deep).evals)
    expect(report.moves[line[4].id]).toMatchObject({ cls: 'excellent', bestMove: 'd7d6' })
  })

  it('takes the word of a deeper search that saw the move played as the game did', () => {
    // The review's own search has 2…Nc6 nearly as good as 2…d6; a deeper one sees it lose 5 pawns more,
    // and the game bears it out (+6).
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
    expect(report.moves[line[4].id]).toMatchObject({ cls: 'blunder', bestMove: 'd7d6' })
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

describe('a game that ends in checkmate', () => {
  const mate = (value: number): Score => ({ type: 'mate', value })
  const mated = (side: 'white' | 'black'): Score => ({ type: 'mate', value: 0, mated: side })

  it('blames the move that allows mate in one, and counts the mate a move away', () => {
    // 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nd7 5.Qe2 Ngf6?? 6.Nd6#, the cloud's evals from 5.Qe2 on.
    const ucis = ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'b8d7', 'd1e2', 'g8f6', 'e4d6']
    const { line, evals } = game(ucis, [
      ...ucis.slice(0, 9).map((uci) => ({ score: cp(30), bestMove: uci })),
      { score: cp(18), bestMove: 'd7f6', second: cp(42), secondMove: 'd8c7', cloud: true },
      { score: mate(1), bestMove: 'e4d6', second: cp(47), secondMove: 'g1f3', cloud: true },
      { score: mated('black') },
    ])
    const backed = backUp(line, evals, {}).evals
    expect(backed[line[10].fen].score).toEqual(mate(1))
    const report = classifyGame(line, backed)
    expect(report.moves[line[10].id].cls).toBe('blunder')
    // The only move that doesn't give the game away, and it mates.
    expect(report.moves[line[11].id].cls).toBe('great')
  })

  it('blames the move that allows mate in two, and the mate is Clutch', () => {
    // Légal's mate: 5…Bxd1?? 6.Bxf7+ Ke7 7.Nd5#, where 5…dxe5 is −2.3.
    const ucis = ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'f1c4', 'c8g4', 'b1c3', 'g7g6', 'f3e5', 'g4d1', 'c4f7', 'e8e7', 'c3d5']
    const { line, evals } = game(ucis, [
      ...ucis.slice(0, 9).map((uci) => ({ score: cp(30), bestMove: uci })),
      { score: cp(-225), bestMove: 'd6e5', second: mate(2), secondMove: 'g4d1' },
      { score: mate(2), bestMove: 'c4f7' },
      { score: mate(1), bestMove: 'e8e7' },
      { score: mate(1), bestMove: 'c3d5', second: cp(-467), secondMove: 'e5d3' },
      { score: mated('black') },
    ])
    const backed = backUp(line, evals, {}).evals
    expect(line.slice(10).map((n) => backed[n.fen].score)).toEqual([mate(2), mate(1), mate(1), mated('black')])
    const report = classifyGame(line, backed)
    expect(line.slice(10).map((n) => report.moves[n.id].cls)).toEqual(['blunder', 'best', 'forced', 'great'])
  })

  it('grades a review saved with the old back-up, mate scores before the mate, the same', () => {
    const ucis = ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'b8d7', 'd1e2', 'g8f6', 'e4d6']
    const { line, evals } = game(ucis, [
      ...ucis.slice(0, 9).map((uci) => ({ score: cp(30), bestMove: uci })),
      { score: cp(18), bestMove: 'd7f6' },
      { score: mated('black'), bestMove: 'e4d6' },
      { score: mated('black') },
    ])
    const report = classifyGame(line, evals)
    expect(report.moves[line[10].id].cls).toBe('blunder')
    expect(report.moves[line[11].id].cls).toBe('best')
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

    it('calls 27.b4+ Clutch: 27.Re6 keeps an edge, but falls from +6.0 to +0.9', () => {
      expect(cls('b4+', 53)).toBe('great')
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

  it('blames 15…Qg2+, whose punishment 16.Qe2 White missed (Lite engine, depth 16, then 20)', () => {
    // 15…Bf1 holds (0.00 at depth 24); after 15…Qg2+, 16.Qe2 is +2.2. White played 16.Ne2, which the game
    // showed was even worse than the searches thought, but that says nothing about 16.Qe2.
    const { line, evals, deep } = recorded(centerGame)
    const backed = backUp(line, evals, deep)
    expect(backed.need).toEqual([])
    const report = classifyGame(line, backed.evals)
    expect(report.moves[at(line, 'Qg2+', 30).id]).toMatchObject({ cls: 'mistake', bestMove: 'h3f1' })
    expect(report.moves[at(line, 'Ne2', 31).id].cls).toBe('blunder')
    expect(report.moves[at(line, 'Nxg3', 22).id].cls).toBe('brilliant')
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
