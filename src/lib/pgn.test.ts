import { describe, expect, it } from 'vitest'
import type { MoveClass } from './classify'
import { exportPgn, pgnFileName } from './pgn'
import { addLine, createTree, mainline, ROOT_ID, treeFromPgn } from './tree'

const OPERA = `[Event "Paris"]
[White "Morphy"]
[Black "Duke & Count"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`

describe('exportPgn', () => {
  const { tree, headers } = treeFromPgn(OPERA)
  const line = mainline(tree)
  const classes: Record<string, MoveClass> = { [line[19].id]: 'brilliant', [line[20].id]: 'mistake', [line[1].id]: 'book' }

  it('adds review marks as NAGs', () => {
    const pgn = exportPgn(line, headers, { classes, clocks: false })
    expect(pgn).toContain('10. Nxb5 $3 cxb5 $2 11. Bxb5+')
    // chess.js fills the seven-tag roster with "?" placeholders; the order is kept.
    expect(pgn).toMatch(/^\[Event "Paris"\]\n\[Site "\?"\]\n\[Date "\?{4}\.\?\?\.\?\?"\]\n\[Round "\?"\]\n\[White "Morphy"\]\n\[Black "Duke & Count"\]\n\[Result "1-0"\]\n\n1\. e4 e5 /)
    expect(pgn.trimEnd().endsWith('Rd8# 1-0')).toBe(true)
    for (const row of pgn.split('\n')) expect(row.length).toBeLessThanOrEqual(80)
  })

  it('leaves marks out without a review', () => {
    expect(exportPgn(line, headers, { classes: null, clocks: false })).not.toContain('$')
  })

  it('writes clocks, keeping tenths', () => {
    const clocked = treeFromPgn(`[White "A"]\n[Black "B"]\n\n1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:00:09.7]} 2. Nf3 {[%clk 1:00:00]} *`)
    const pgn = exportPgn(mainline(clocked.tree), clocked.headers, { classes: null, clocks: true })
    expect(pgn).toContain('1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:00:09.7]} 2. Nf3 {[%clk 1:00:00]} *')
    expect(exportPgn(mainline(clocked.tree), clocked.headers, { classes: null, clocks: false })).toContain('1. e4 e5 2. Nf3 *')
  })

  it('numbers a game that starts with Black to move', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const { tree: t } = addLine(createTree(fen), ROOT_ID, ['e7e5', 'g1f3'])
    const pgn = exportPgn(mainline(t), {}, { classes: null, clocks: false })
    expect(pgn).toContain('[SetUp "1"]\n[FEN "' + fen + '"]')
    expect(pgn).toContain('\n\n1... e5 2. Nf3 *')
  })
})

describe('pgnFileName', () => {
  it('names the file after the players and date', () => {
    expect(pgnFileName({ White: 'A b', Black: 'C/d', Date: '2026.10.16' })).toBe('A_b_vs_C_d_2026-10-16.pgn')
    expect(pgnFileName({ White: 'Hikaru', Black: 'Bortnyk' })).toBe('Hikaru_vs_Bortnyk.pgn')
    expect(pgnFileName({})).toBe('rookahead-game.pgn')
  })
})
