import { describe, expect, it } from 'vitest'
import { openingFromEcoUrl, formatTimeControl } from './chesscom'
import {
  addLine,
  addMove,
  createTree,
  deleteNode,
  isMainline,
  mainline,
  mainlineToPgn,
  pathTo,
  promoteVariation,
  pvToSan,
  ROOT_ID,
  treeFromPgn,
} from './tree'

const CHESSCOM_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[White "alice"]
[Black "bob"]
[Result "0-1"]
[WhiteElo "1500"]
[BlackElo "1520"]
[TimeControl "180"]
[ECOUrl "https://www.chess.com/openings/Sicilian-Defense-Kan-Modern-Variation...9.Nc3-Bg7"]

1. e4 {[%clk 0:03:00]} 1... c5 {[%clk 0:02:59.6]} 2. Nf3 {[%clk 0:02:59.4]} 2... e6 {[%clk 0:02:58]} 3. d4 {[%clk 0:02:57.5]} 3... cxd4 {[%clk 0:02:57]} 0-1`

describe('tree basics', () => {
  it('adds moves, reuses duplicates and rejects illegal moves', () => {
    const t0 = createTree()
    const a = addMove(t0, ROOT_ID, 'e4')!
    expect(a.nodeId).toBe('e2e4')
    expect(a.tree.nodes[a.nodeId].san).toBe('e4')
    expect(a.tree.nodes[a.nodeId].ply).toBe(1)
    expect(addMove(a.tree, ROOT_ID, { from: 'e2', to: 'e4' })!.tree).toBe(a.tree)
    expect(addMove(a.tree, ROOT_ID, 'e5')).toBeNull()
  })

  it('tracks main line vs variations, and can promote/delete', () => {
    let t = addLine(createTree(), ROOT_ID, ['e2e4', 'e7e5', 'g1f3']).tree
    const v = addLine(t, 'e2e4', ['c7c5', 'g1f3'])
    t = v.tree
    expect(mainline(t).map((n) => n.san ?? '·')).toEqual(['·', 'e4', 'e5', 'Nf3'])
    expect(isMainline(t, v.nodeId)).toBe(false)
    expect(pathTo(t, v.nodeId).map((n) => n.san ?? '·')).toEqual(['·', 'e4', 'c5', 'Nf3'])

    const promoted = promoteVariation(t, v.nodeId)
    expect(mainline(promoted).map((n) => n.san ?? '·')).toEqual(['·', 'e4', 'c5', 'Nf3'])
    expect(isMainline(promoted, v.nodeId)).toBe(true)

    const deleted = deleteNode(t, 'e2e4.c7c5')
    expect(deleted.nodes['e2e4.c7c5']).toBeUndefined()
    expect(deleted.nodes['e2e4.c7c5.g1f3']).toBeUndefined()
    expect(deleted.nodes['e2e4'].children).toEqual(['e2e4.e7e5'])
  })

  it('handles promotion moves in UCI', () => {
    const t = createTree('8/P7/8/8/8/8/8/k6K w - - 0 1')
    const r = addLine(t, ROOT_ID, ['a7a8q'])
    expect(r.tree.nodes[r.nodeId].san).toBe('a8=Q+')
  })

  it('derives ply from a FEN', () => {
    expect(createTree('8/8/8/8/8/8/8/k6K b - - 0 12').nodes[ROOT_ID].ply).toBe(23)
  })
})

describe('PGN import', () => {
  it('reads headers, moves and clocks from a Chess.com PGN', () => {
    const { tree, headers } = treeFromPgn(CHESSCOM_PGN)
    expect(headers.White).toBe('alice')
    expect(headers.Result).toBe('0-1')
    const line = mainline(tree)
    expect(line.map((n) => n.san ?? '·')).toEqual(['·', 'e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4'])
    expect(line[1].clock).toBe(180)
    expect(line[2].clock).toBeCloseTo(179.6)
    expect(line[6].clock).toBe(177)
  })

  it('round-trips through mainlineToPgn', () => {
    const { tree, headers } = treeFromPgn(CHESSCOM_PGN)
    const again = treeFromPgn(mainlineToPgn(tree, headers))
    expect(mainline(again.tree).map((n) => n.fen)).toEqual(mainline(tree).map((n) => n.fen))
    expect(again.headers.Black).toBe('bob')
  })

  it('supports PGNs that start from a FEN', () => {
    const pgn = `[SetUp "1"]\n[FEN "8/P7/8/8/8/8/8/k6K w - - 0 1"]\n\n1. a8=Q+ *`
    const { tree } = treeFromPgn(pgn)
    expect(mainline(tree)).toHaveLength(2)
    expect(tree.nodes[ROOT_ID].ply).toBe(0)
  })

  it('leaves out the tags chess.js fills in with question marks', () => {
    const { headers } = treeFromPgn(`[White "alice"]\n\n1. e4 *`)
    expect(headers).toEqual({ White: 'alice', Result: '*' })
  })

  it('throws on garbage', () => {
    expect(() => treeFromPgn('1. e4 e5 2. Ke3 Qh4')).toThrow()
  })
})

describe('helpers', () => {
  it('converts engine PVs to SAN', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    expect(pvToSan(fen, ['d2d4', 'e5d4', 'f3d4', 'zzzz', 'g8f6'])).toEqual(['d4', 'exd4', 'Nxd4'])
  })

  it('names openings from Chess.com ECO URLs', () => {
    expect(openingFromEcoUrl('https://www.chess.com/openings/Sicilian-Defense-Kan-Modern-Variation...9.Nc3-Bg7')).toBe(
      'Sicilian Defense Kan Modern Variation',
    )
    expect(openingFromEcoUrl('https://www.chess.com/openings/Italian-Game-Two-Knights-Defense-4.d3')).toBe('Italian Game Two Knights Defense')
    expect(openingFromEcoUrl(undefined)).toBeUndefined()
  })

  it('formats time controls', () => {
    expect(formatTimeControl('600')).toBe('10 min')
    expect(formatTimeControl('180+2')).toBe('3 | 2')
    expect(formatTimeControl('30')).toBe('30s')
    expect(formatTimeControl('1/86400')).toBe('1 day')
  })
})
