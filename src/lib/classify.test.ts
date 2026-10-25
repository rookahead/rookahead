/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { CLASS_INFO, classifyGame, gameAccuracy, isSacrifice, materialBalance, moveAccuracy, sacrifice, withClasses, type ReviewedPosition } from './classify'
import { moveDetail, moveHeadline } from './commentary'
import { materialState } from './material'
import { makeBook, openingOf } from './openings'
import { addLine, createTree, mainline, ROOT_ID } from './tree'
import type { Score } from './uci'

const cp = (value: number): Score => ({ type: 'cp', value })
const mate = (value: number): Score => ({ type: 'mate', value })

const ROOK_SAC = '6k1/8/8/4p3/8/8/8/3R2K1 w - - 0 1' // 1.Rd4 exd4
const EXCHANGE = '4k3/8/1n6/8/4P3/8/8/3RK3 w - - 0 1' // 1.Rd5 Nxd5 2.exd5: a rook for a knight
const EXCHANGE_AFTER = '4k3/8/1n6/3R4/4P3/8/8/4K3 b - - 1 1'
/** MelonLord-009 vs progranit, Chess.com 2026: the position after `plies` half-moves. */
/** MelonLord-009 vs UchihaItachi2374, Chess.com 2026: the position after `plies` half-moves. */
const itachiAfter = (plies: number) => {
  const chess = new Chess()
  const sans = 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nd4 c3 b5 Bf1 Nxd5 cxd4 Qxg5 Bxb5+ Kd8 O-O Nf4 Qf3 Rb8 dxe5 Rxb5 d4 Nh3+ Qxh3 Bxh3 Bxg5+ f6 gxh3 fxg5 Nc3 Rxb2 Ne4 h6 f4 gxf4 Rxf4 Rb4 Nc3 c5 Rd1 cxd4 Rdxd4+ Rxd4 Rxd4+ Ke8 Nd5 Bc5'.split(' ')
  for (const san of sans.slice(0, plies)) chess.move(san)
  return chess.fen()
}

/** Chingismukanov vs MelonLord-009, Chess.com 2026: the position after `plies` half-moves. */
const chingisAfter = (plies: number) => {
  const chess = new Chess()
  const sans = 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 Nc3 Bb4 Bd2 O-O Qe2 Bxc3 Bxc3 Nxe4'.split(' ')
  for (const san of sans.slice(0, plies)) chess.move(san)
  return chess.fen()
}

const melonAfter = (plies: number) => {
  const chess = new Chess()
  const sans = 'e4 e5 Nf3 d6 d4 exd4 Nxd4 Qe7 Nc3 c6 Be3 g6 f3 Bg7 Qd2 h6 O-O-O Nd7 Kb1 Ne5 Nb3 Bf8 f4 Ng4 Bd4 Rh7 h3 N4f6 e5 dxe5 fxe5 Nd5 Nxd5 cxd5 e6 Bxe6 Bb5+ Kd8 Bc5 Qf6 Bxf8 Ne7 Rhf1 Qh4 Rf4 Qh5 Bxe7+ Kxe7 Qb4+ Kd8 Qd6+ Kc8 Qc5+ Kb8 Qd6+ Kc8 Rc4+ dxc4 Qd8#'.split(' ')
  for (const san of sans.slice(0, plies)) chess.move(san)
  return chess.fen()
}

/** The Opera Game (Morphy, 1858) after 15…Nxd7, before 16.Qb8+. */
const MORPHY_BEFORE_QB8 = (() => {
  const chess = new Chess()
  for (const san of 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7'.split(' ')) chess.move(san)
  return chess.fen()
})()

/** Builds a main line and attaches a review entry to each position. */
function game(ucis: string[], entries: (Partial<ReviewedPosition> & { score: Score })[], startFen?: string) {
  const { tree } = addLine(createTree(startFen), ROOT_ID, ucis)
  const line = mainline(tree)
  expect(line).toHaveLength(ucis.length + 1)
  const evals: Record<string, ReviewedPosition> = {}
  line.forEach((node, i) => {
    const e = entries[i]
    if (e) evals[node.fen] = { bestMove: null, pv: [], ...e }
  })
  return { tree, line, evals }
}

describe('loss bands', () => {
  it('grades moves by expected points lost', () => {
    // 1.e4 (best) e5 (excellent) 2.Nf3 (good) Nc6 (inaccuracy) 3.Bc4 (mistake) Nf6 (blunder)
    const { line, evals } = game(
      ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'],
      [
        // White-POV scores, chosen so each move lands in the next band for its mover.
        { score: cp(30), bestMove: 'e2e4' },
        { score: cp(30), bestMove: 'c7c5' },
        { score: cp(50), bestMove: 'd2d4' },
        { score: cp(0), bestMove: 'd7d6' },
        { score: cp(80), bestMove: 'd2d4' },
        { score: cp(-90), bestMove: 'a7a6' },
        { score: cp(700) },
      ],
    )
    const report = classifyGame(line, evals)
    expect(line.slice(1).map((n) => report.moves[n.id].cls)).toEqual(['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'])
    expect(report.counts.white.best).toBe(1)
    expect(report.counts.black.blunder).toBe(1)
    expect(report.moves[line[2].id].bestMove).toBe('c7c5')
    expect(report.moves[line[1].id].bestMove).toBeUndefined()
  })

  it('skips moves without review data on both sides', () => {
    const { line, evals } = game(['e2e4', 'e7e5'], [{ score: cp(30), bestMove: 'e2e4' }, { score: cp(30) }])
    const report = classifyGame(line, evals)
    expect(Object.keys(report.moves)).toEqual([line[1].id])
  })
})

describe('board colours', () => {
  it('tint the move\'s squares in its verdict\'s colour', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    for (const [cls, { color }] of Object.entries(CLASS_INFO)) {
      const rule = css.match(new RegExp(`square\\.cls-${cls} \\{ background-color: rgba\\((\\d+), (\\d+), (\\d+),`))
      expect(rule, cls).not.toBeNull()
      const hex = '#' + rule!.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
      expect(hex, cls).toBe(color)
    }
  })
})

describe('only the engine\'s move is best', () => {
  it('calls a move other than the engine\'s "strong", even when the eval after it comes out as good', () => {
    // 7.f3, where the engine wanted Qd2: +2.06 → +1.97. And a move whose eval came out higher.
    const f3 = game(['f2f3'], [{ score: cp(206), bestMove: 'd1d2' }, { score: cp(197) }], melonAfter(12))
    expect(classifyGame(f3.line, f3.evals).moves[f3.line[1].id].cls).toBe('excellent')
    const up = game(['e2e4'], [{ score: cp(30), bestMove: 'd2d4' }, { score: cp(40) }])
    expect(classifyGame(up.line, up.evals).moves[up.line[1].id].cls).toBe('excellent')
  })

  it('calls any checkmate "best"', () => {
    const mated = { type: 'mate', value: 0, mated: 'black' } as Score
    const { line, evals } = game(['e1e8'], [{ score: { type: 'mate', value: 1 }, bestMove: 'a1a8' }, { score: mated }], '6k1/5ppp/8/8/8/8/8/R3R1K1 w - - 0 1')
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
  })

  it('notes a slower mate', () => {
    // 27.Qc5+ keeps a mate in 3 where 27.Rc4+ mated in 2.
    const { line, evals } = game(['d6c5'], [{ score: { type: 'mate', value: 2 }, bestMove: 'f4c4' }, { score: { type: 'mate', value: 3 } }], melonAfter(52))
    const move = classifyGame(line, evals).moves[line[1].id]
    expect(move.cls).toBe('excellent')
    expect(move.fasterMate).toBe(2)
    expect(moveDetail(move, 'Rc4+')).toBe('Rc4+ mates in 2.')
  })
})

describe('book, great, brilliant, miss, forced', () => {
  it('marks a contiguous book prefix', () => {
    const { line, evals } = game(['e2e4', 'e7e5', 'g1f3', 'b8c6'], [cp(30), cp(30), cp(30), cp(30), cp(30)].map((score, i) => ({ score, bestMove: ['e2e4', 'e7e5', 'g1f3', 'b8c6'][i] ?? null })))
    const bookFens = new Set([line[1].fen, line[2].fen, line[4].fen]) // 2.Nf3 missing: book stops there
    const report = classifyGame(line, evals, (fen) => bookFens.has(fen))
    expect(line.slice(1).map((n) => report.moves[n.id].cls)).toEqual(['book', 'book', 'best', 'best'])
  })

  it('grades a book move that loses real ground, and ends theory there', () => {
    // Every position is in the book, but 1...e5 drops from +0.30 to +2.50: a Mistake for Black.
    const { line, evals } = game(['e2e4', 'e7e5', 'g1f3', 'b8c6'], [cp(30), cp(30), cp(250), cp(250), cp(250)].map((score, i) => ({ score, bestMove: ['e2e4', 'c7c5', 'g1f3', 'b8c6'][i] ?? null })))
    const report = classifyGame(line, evals, () => true)
    expect(line.slice(1).map((n) => report.moves[n.id].cls)).toEqual(['book', 'mistake', 'best', 'best'])
  })

  it('keeps the engine\'s own book move in theory, even when the next eval drops', () => {
    const { line, evals } = game(['e2e4', 'e7e5', 'g1f3'], [{ score: cp(30), bestMove: 'e2e4' }, { score: cp(30), bestMove: 'e7e5' }, { score: cp(150), bestMove: 'g1f3' }, { score: cp(150) }])
    const report = classifyGame(line, evals, () => true)
    expect(line.slice(1).map((n) => report.moves[n.id].cls)).toEqual(['book', 'book', 'book'])
  })

  it('calls the only good move "great"', () => {
    const { line, evals } = game(['e2e4'], [{ score: cp(0), bestMove: 'e2e4', second: cp(-400) }, { score: cp(0) }])
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
  })

  it('calls a move "great" when every alternative would be a mistake', () => {
    // 5.Bd2 in the Englund Gambit: +1.85, and the next-best move only +0.33 (a 13% win-chance drop).
    const { line, evals } = game(['e2e4'], [{ score: cp(185), bestMove: 'e2e4', second: cp(33) }, { score: cp(174) }])
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
    const close = game(['e2e4'], [{ score: cp(185), bestMove: 'e2e4', second: cp(120) }, { score: cp(174) }])
    expect(classifyGame(close.line, close.evals).moves[close.line[1].id].cls).toBe('best')
  })

  it('calls an only move that holds a worse game "great"', () => {
    // −1.5 (36.5%) where the next-best is −5 (13.7%).
    const { line, evals } = game(['e2e4'], [{ score: cp(-150), bestMove: 'e2e4', second: cp(-500) }, { score: cp(-150) }])
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
  })

  it('calls the only move that avoids getting mated "great"', () => {
    // 54.Rxb1: taking the queen that promoted with check holds 0.00; every other move gets mated in 6 or less.
    const at = (second: Score) => (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['g1b1'], [{ score: cp(-3), bestMove: 'g1b1', second }, { score: cp(0) }], '8/2r5/6P1/8/8/3K4/k7/1q4R1 w - - 0 54'))
    expect(at(mate(-6))).toBe('great')
    expect(at(cp(-1161))).toBe('great') // what a depth-16 review sees: lost by 11 pawns, the mate further on
    expect(at(cp(-300))).toBe('great') // only worse, not lost: still the only move
  })

  it('calls an obvious only move "great" too', () => {
    // Taking a free queen is the only good move: Clutch, however obvious (chess.com calls these Great).
    const { line, evals } = game(['d1d5'], [{ score: cp(900), bestMove: 'd1d5', second: cp(-100) }, { score: cp(900) }], '4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1')
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
  })

  it('does not call a move "great" when it only loses less', () => {
    // Every move loses here; the best one just loses slower.
    const { line, evals } = game(['e2e4'], [{ score: cp(-300), bestMove: 'e2e4', second: cp(-900) }, { score: cp(-300) }])
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
  })

  describe('mating lines', () => {
    // 31...Bh3+! skewers king and rook: mate in 5, where the next-best move needs 9.
    const start = '8/3R1p1k/2p4p/2B3p1/6K1/Pr6/6bP/8 b - - 1 31'
    const mate = (value: number): Score => ({ type: 'mate', value })
    const classifyBh3 = (best: Score, second: Score) =>
      (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['g2h3'], [{ score: best, bestMove: 'g2h3', second }, { score: mate(-4) }], start))

    it('calls the only fast mate "great"', () => {
      expect(classifyBh3(mate(-5), mate(-9))).toBe('great')
      expect(classifyBh3(mate(-5), cp(-997))).toBe('great')
    })

    it('does not call a mate "great" when the next move mates almost as fast', () => {
      expect(classifyBh3(mate(-5), mate(-6))).toBe('best')
    })

    it('does not call the mating move itself "great"', () => {
      const at = (second: Score) =>
        (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['d8d1'], [{ score: mate(-1), bestMove: 'd8d1', second }, { score: { type: 'mate', value: 0, mated: 'white' } }], '3r2k1/8/8/8/8/8/5PPP/6K1 b - - 0 1'))
      expect(at(mate(-5))).toBe('best')
      expect(at(cp(900))).toBe('best') // even when every other move loses (17.Rd8# in the Opera Game)
    })
  })

  it('calls a bishop given for a pawn a sacrifice, though the eval says level while a pawn up', () => {
    // 11…Rb8 attacks the b5 bishop; 12.dxe5 Rxb5: White was a pawn up at 0.00, and that pawn of
    // compensation isn't material already lost.
    const { line, evals } = game(
      ['a8b8', 'd4e5'],
      [{ score: cp(-51) }, { score: cp(0), bestMove: 'd4e5', second: cp(-9) }, { score: cp(-3), pv: ['b8b5', 'd2d4'] }],
      itachiAfter(21),
    )
    expect(classifyGame(line, evals).moves[line[2].id].cls).toBe('brilliant')
  })

  it('calls 13.d4, the only move that holds, "great"', () => {
    const { line, evals } = game(['d2d4'], [{ score: cp(-11), bestMove: 'd2d4', second: cp(-194) }, { score: cp(-13) }], itachiAfter(24))
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
  })

  it('does not call taking back a piece on another square "great"', () => {
    // 8.cxd4 Qxg5: White took a knight on d4, Black takes one back on g5.
    const { line, evals } = game(['c3d4', 'd8g5'], [{ score: cp(20) }, { score: cp(13), bestMove: 'd8g5', second: cp(297) }, { score: cp(0) }], itachiAfter(14))
    expect(classifyGame(line, evals).moves[line[2].id].cls).toBe('best')
  })

  it('calls a capture that escapes a fork "great", though it brings the material back', () => {
    // Blackburne Shilling Gambit: 5.Nxf7 forks queen and rook; 5…Qxg2 is the only move, not just a pawn back.
    const chess = new Chess()
    'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5'.split(' ').forEach((san) => chess.move(san))
    const { line, evals } = game(
      ['e5f7', 'g5g2'],
      [{ score: cp(-150), bestMove: 'c4f7' }, { score: cp(-639), bestMove: 'g5g2', second: cp(377) }, { score: cp(-723), pv: ['f7g5', 'g2h1', 'c4f1', 'f8e7'] }],
      chess.fen(),
    )
    expect(classifyGame(line, evals).moves[line[2].id].cls).toBe('great')
  })

  it('does not call a recapture "great"', () => {
    // 1.e4 d5 2.exd5 Qxd5: the queen recapture is "only", but it's just a recapture.
    const { line, evals } = game(
      ['e2e4', 'd7d5', 'e4d5', 'd8d5'],
      [{ score: cp(30) }, { score: cp(30) }, { score: cp(30) }, { score: cp(30), bestMove: 'd8d5', second: cp(400) }, { score: cp(40) }],
    )
    expect(classifyGame(line, evals).moves[line[4].id].cls).toBe('best')
  })

  it('detects sacrifices from the engine line', () => {
    // Rook steps onto a pawn-attacked square and the engine line takes it.
    expect(isSacrifice('6k1/8/8/4p3/8/8/8/3R2K1 w - - 0 1', '6k1/8/8/4p3/3R4/8/8/6K1 b - - 1 1', ['e5d4'], 'white')).toBe(true)
    // An even trade isn't a sacrifice.
    expect(isSacrifice('4k3/3p4/2n5/1B6/8/8/8/4K3 w - - 0 1', '4k3/3p4/2B5/8/8/8/8/4K3 b - - 0 1', ['d7c6'], 'white')).toBe(false)
    // Giving up two pawns counts too.
    expect(isSacrifice('3q2k1/8/8/8/4P3/3P4/8/6K1 w - - 0 1', '3q2k1/8/8/8/3PP3/8/8/6K1 b - - 0 1', ['d8d4', 'g1h1', 'd4e4'], 'white')).toBe(true)
  })

  it('does not count a pawn trade as a sacrifice', () => {
    // 1.d4 d5 2.c4 dxc4 3.e3: the engine line takes c4 back.
    expect(isSacrifice('rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3', 'rnbqkbnr/ppp1pppp/8/8/2pP4/4P3/PP3PPP/RNBQKBNR b KQkq - 0 3', ['g8f6', 'f1c4'], 'white')).toBe(false)
  })

  it('tells an exchange sacrifice apart', () => {
    expect(sacrifice(EXCHANGE, EXCHANGE_AFTER, ['b6d5', 'e4d5'], 'white')).toBe('exchange')
    expect(sacrifice('4k3/8/2n5/8/8/8/8/3RK3 w - - 0 1', '4k3/8/2n5/8/3R4/8/8/4K3 b - - 1 1', ['c6d4'], 'white')).toBe('material')
  })

  it('counts ignoring a piece the opponent just attacked as a sacrifice', () => {
    // 1…h6 attacks the g5 bishop; 2.Ra7 leaves it there, and the engine's reply declines it.
    const ignore = game(
      ['h7h6', 'a1a7'],
      [{ score: cp(500), bestMove: 'h7h6' }, { score: cp(500), bestMove: 'a1a7', second: cp(490) }, { score: cp(500), pv: ['e8f8'] }],
      '4k3/7p/8/6B1/8/8/8/R3K3 b - - 0 1',
    )
    expect(classifyGame(ignore.line, ignore.evals).moves[ignore.line[2].id].cls).toBe('brilliant')
    // A check that gains a tempo isn't one: after 2.Ra8+ the bishop can't be taken.
    const check = game(
      ['h7h6', 'a1a8'],
      [{ score: cp(500), bestMove: 'h7h6' }, { score: cp(500), bestMove: 'a1a8', second: cp(490) }, { score: cp(500), pv: ['e8f7'] }],
      '4k3/7p/8/6B1/8/8/8/R3K3 b - - 0 1',
    )
    expect(classifyGame(check.line, check.evals).moves[check.line[2].id].cls).toBe('best')
  })

  it('does not count a piece left hanging as a sacrifice when taking it lets the mover win as much back', () => {
    // Blackburne Shilling Gambit, 5…Qxg2: 6.Nxh8 Qxh1+ is a rook for a rook.
    const chess = new Chess()
    'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7'.split(' ').forEach((san) => chess.move(san))
    const before = chess.fen()
    chess.move('Qxg2')
    expect(isSacrifice(before, chess.fen(), ['f7g5', 'g2h1', 'c4f1', 'f8e7'], 'black', 6.39, true)).toBe(false)
    // 1.Qc3 leaves the b4 rook to the knight and attacks h8: undefended, so 1…Nxb4 2.Qxh8+ wins it back…
    expect(isSacrifice('k6r/8/2n5/8/1R6/8/8/2Q3K1 w - - 0 1', 'k6r/8/2n5/8/1R6/2Q5/8/6K1 b - - 1 1', ['a8b7'], 'white', Infinity, true)).toBe(false)
    // …but with the king guarding h8 there's nothing to win back, and the rook was given up.
    expect(isSacrifice('6kr/8/2n5/8/1R6/8/8/2Q3K1 w - - 0 1', '6kr/8/2n5/8/1R6/2Q5/8/6K1 b - - 1 1', ['g8g7'], 'white', Infinity, true)).toBe(true)
    // A piece moved where it can be taken is still offered, whatever comes back.
    expect(isSacrifice('k6r/8/2n5/8/8/2Q5/8/1R4K1 w - - 0 1', 'k6r/8/2n5/8/1R6/2Q5/8/6K1 b - - 1 1', ['a8b7'], 'white')).toBe(true)
  })

  it('calls an undefended rook left to a knight a sacrifice of material, not the exchange', () => {
    expect(sacrifice('4k3/8/2n5/8/8/8/8/R3K3 w - - 0 1', '4k3/8/2n5/8/1R6/8/8/4K3 b - - 1 1', ['e8d7'], 'white')).toBe('material')
  })

  it('calls a hard sacrifice up to 3.5% short of the top move "brilliant"', () => {
    const at = (after: number) => (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['d1d4'], [{ score: cp(100), bestMove: 'd1d5' }, { score: cp(after), pv: ['e5d4'] }], ROOK_SAC))
    expect(at(70)).toBe('brilliant') // 2.7% short
    expect(at(55)).toBe('good') // 4.1% short
  })

  it('calls a queen that can\'t be taken "brilliant", even when already completely winning', () => {
    // 21…Qf2 (−23.89): 22.Rxf2 runs into a back-rank mate, so the engine's line declines it.
    const before = '3rr1k1/pp4pp/1qnb4/5Q1b/8/2P2pP1/PP5P/RNB2R1K b - - 3 21'
    const offered = game(['b6f2'], [{ score: cp(-2389), bestMove: 'b6f2', second: cp(-1161) }, { score: cp(-1963), pv: ['f5h3', 'f2e2'] }], before)
    expect(classifyGame(offered.line, offered.evals).moves[offered.line[1].id].cls).toBe('brilliant')
    // A sacrifice the opponent simply takes, in a game that's already won, stays as it is.
    const taken = game(['d1d4'], [{ score: cp(1500), bestMove: 'd1d4' }, { score: cp(1400), pv: ['e5d4'] }], ROOK_SAC)
    expect(classifyGame(taken.line, taken.evals).moves[taken.line[1].id].cls).not.toBe('brilliant')
  })

  it('calls 9.Rxf5, the exchange given as the only good move, "brilliant", though 10.Nxf7 wins a pawn back', () => {
    const start = (() => {
      const chess = new Chess()
      for (const san of 'e4 c6 d4 d5 Nc3 dxe4 Bc4 Bf5 f3 exf3 Nxf3 Nf6 O-O e6 Ne5 Nbd7'.split(' ')) chess.move(san)
      return chess.fen()
    })()
    const { line, evals } = game(['f1f5'], [{ score: cp(442), bestMove: 'f1f5', second: cp(273) }, { score: cp(432), pv: ['e6f5', 'e5f7', 'd8e7', 'f7h8'] }], start)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('calls the engine\'s own sacrifice "brilliant" though its eval wobbles down past 3.5%', () => {
    // 19…Bxh3: −4.53 before, −3.74 after the engine's own move (4.3% on paper); g2 can take the bishop.
    const { line, evals } = game(['g4h3'], [{ score: cp(-453), bestMove: 'g4h3', second: cp(-238) }, { score: cp(-374), pv: ['a1d1', 'h5h4', 'g2g3'] }], 'r3k2r/1Rp3p1/p1n2pp1/7q/3N2b1/2B1P2P/P1P2PP1/Q4RK1 b kq - 0 19')
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('calls the only good way out of check "great"', () => {
    // 5.Bd2 keeps +1.85; the other ways out of 4…Qb4+ give most of it back (+0.33).
    const { line, evals } = game(['f4d2'], [{ score: cp(185), bestMove: 'f4d2', second: cp(33) }, { score: cp(174) }], 'r1b1kbnr/pppp1ppp/2n5/4P3/1q3B2/5N2/PPP1PPPP/RN1QKB1R w KQkq - 5 5')
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
  })

  it('calls no move "great" while another one keeps an advantage too', () => {
    // 5.Bd2 keeps +1.85, and here the next-best way out of check still keeps +0.70.
    const { line, evals } = game(['f4d2'], [{ score: cp(185), bestMove: 'f4d2', second: cp(70) }, { score: cp(174) }], 'r1b1kbnr/pppp1ppp/2n5/4P3/1q3B2/5N2/PPP1PPPP/RN1QKB1R w KQkq - 5 5')
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
  })

  it('counts a capture that leaves something bigger to be taken as a sacrifice', () => {
    // 1.Bxb4 takes a knight but opens the d-file: 1…Rxd1+ takes the queen instead of the bishop.
    expect(sacrifice('3r2k1/8/8/8/1n6/8/3B4/3QK3 w - - 0 1', '3r2k1/8/8/8/1B6/8/8/3QK3 b - - 0 1', ['d8d1'], 'white')).toBe('material')
  })

  it('does not blame an even trade for a piece given up by a later capture in the line', () => {
    // 8…Bxc3 9.Bxc3 Nxe4 10.Qxe4 Re8: the knight goes with 9…Nxe4, a move of its own.
    const trade = game(['b4c3'], [{ score: cp(-119), bestMove: 'd7d5', second: cp(-118) }, { score: cp(-137), pv: ['d2c3', 'f6e4', 'e2e4', 'f8e8'] }], chingisAfter(15))
    expect(classifyGame(trade.line, trade.evals).moves[trade.line[1].id].cls).toBe('excellent')
    // 9…Nxe4 itself is the sacrifice.
    const sac = game(['f6e4'], [{ score: cp(-113), bestMove: 'f6e4', second: cp(-17) }, { score: cp(-111), pv: ['e2e4', 'f8e8'] }], chingisAfter(17))
    expect(classifyGame(sac.line, sac.evals).moves[sac.line[1].id].cls).toBe('brilliant')
  })

  it('calls putting the queen where a bishop can take it "brilliant", though it comes back', () => {
    // 14.Qxh3: a human takes the queen (14…Bxh3 15.Bxg5+); the engine's line declines it.
    const { line, evals } = game(['f3h3'], [{ score: cp(163), bestMove: 'f3h3', second: cp(20) }, { score: cp(170), pv: ['g5c1', 'h3c8', 'd8c8', 'f1c1'] }], itachiAfter(26))
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('calls 25…Bc5, the only move that keeps the win, "great"', () => {
    const { line, evals } = game(['f8c5'], [{ score: cp(-609), bestMove: 'f8c5', second: cp(24) }, { score: cp(-643) }], itachiAfter(49))
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
  })

  it('calls an exchange sacrifice "brilliant" only when it is the only good move', () => {
    const at = (second: number) => (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['d1d5'], [{ score: cp(300), bestMove: 'd1d5', second: cp(second) }, { score: cp(300), pv: ['b6d5', 'e4d5'] }], EXCHANGE))
    expect(at(290)).toBe('best')
    expect(at(100)).toBe('brilliant')
  })

  it('calls a rook sacrifice that mates two moves faster "brilliant"', () => {
    // 29.Rc4+ dxc4 30.Qd8#: mate in 2, where anything else takes 4.
    const at = (second: Score) => (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['f4c4'], [{ score: mate(2), bestMove: 'f4c4', second }, { score: mate(1), pv: ['d5c4', 'd6d8'] }], melonAfter(56)))
    expect(at(mate(4))).toBe('brilliant')
    expect(at(mate(3))).toBe('best')
  })

  it('calls a mating sacrifice "brilliant"', () => {
    // Morphy, 16.Qb8+ Nxb8 17.Rd8#
    const mate = (value: number): Score => ({ type: 'mate', value })
    const { line, evals } = game(['b3b8'], [{ score: mate(2), bestMove: 'b3b8', second: cp(400) }, { score: mate(1), pv: ['d7b8', 'd1d8'] }], MORPHY_BEFORE_QB8)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('calls a sound sacrifice "brilliant"', () => {
    const start = '6k1/8/8/4p3/8/8/8/3R2K1 w - - 0 1'
    const { line, evals } = game(['d1d4'], [{ score: cp(100), bestMove: 'd1d4' }, { score: cp(120), pv: ['e5d4'] }], start)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('calls a sacrifice "brilliant" when it ties the engine\'s top move', () => {
    const start = '6k1/8/8/4p3/8/8/8/3R2K1 w - - 0 1'
    const { line, evals } = game(['d1d4'], [{ score: cp(100), bestMove: 'd1d5' }, { score: cp(95), pv: ['e5d4'] }], start)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('counts a piece left en prise as a sacrifice, even when the engine line declines it', () => {
    // 14.Bxh6!: gxh6 loses, so the engine plays 14...Bg4 instead — but the bishop was offered.
    const before = 'r1bq3k/ppp1nBp1/1bnp3p/7Q/3PP3/8/P4PPP/RNB1R1K1 w - - 1 14'
    const after = 'r1bq3k/ppp1nBp1/1bnp3B/7Q/3PP3/8/P4PPP/RN2R1K1 b - - 0 14'
    expect(isSacrifice(before, after, ['c8g4', 'h5h4', 'e7f5', 'h6g7'], 'white', 5.68)).toBe(true)
    const { line, evals } = game(['c1h6'], [{ score: cp(568), bestMove: 'c1h6' }, { score: cp(582), pv: ['c8g4', 'h5h4', 'e7f5', 'h6g7'] }], before)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('does not count material the opponent only wins after a quiet move of their own as a sacrifice', () => {
    // Rudra_Yagami vs MelonLord-009, 23.g4: Black needs 23…Be7 before 24…Bxg5 wins the knight, so g4 offered nothing.
    const chess = new Chess()
    'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Nb6 Nc3 Ba6 b3 O-O-O Bb2 Qg5 Ne4 Qg6 O-O-O Bb4 f4 Rhe8 Qf3 f5 Ng5 h6 Nh3 Qf7 Bd3 g5 fxg5 hxg5 Nxg5 Qg6 h4 Rf8 Qe2 Bc5'
      .split(' ')
      .forEach((san) => chess.move(san))
    const before = chess.fen()
    chess.move('g4')
    const pv = ['c5e7', 'c1b1', 'e7g5', 'g4f5', 'f8f5', 'h1g1']
    expect(isSacrifice(before, chess.fen(), pv, 'white', 5.53)).toBe(false)
    const { line, evals } = game(['g2g4'], [{ score: cp(553), bestMove: 'g2g4', second: cp(526) }, { score: cp(559), pv }], before)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
  })

  it('counts a piece won back only after a quiet move as a sacrifice', () => {
    // 18…Nxe4!: 19.dxe4 d3 leaves Black a knight down for a move before 20.Bf4 Bxc4 wins it back.
    const before = '1r1qrbk1/1p3pp1/p1n1bn1p/2p5/2NpP3/PP1P1N1P/3BBPP1/R2Q1RK1 b - - 3 18'
    const after = '1r1qrbk1/1p3pp1/p1n1b2p/2p5/2Npn3/PP1P1N1P/3BBPP1/R2Q1RK1 w - - 0 19'
    const pv = ['d3e4', 'd4d3', 'd2f4', 'e6c4', 'b3c4', 'e8e4']
    expect(isSacrifice(before, after, pv, 'black', 1.36)).toBe(true)
    const { line, evals } = game(['f6e4'], [{ score: cp(-136), bestMove: 'f6e4' }, { score: cp(-140), pv }], before)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('does not count material taken straight back as a sacrifice', () => {
    // 1.Bxh7 Rxh7 2.Qxh7: the bishop goes, and the rook comes straight back for it.
    expect(isSacrifice('4k2r/7p/8/8/8/3B4/8/4K2Q w - - 0 1', '4k2r/7B/8/8/8/8/8/4K2Q b - - 0 1', ['h8h7', 'h1h7'], 'white')).toBe(false)
  })

  it('counts a piece given for two pawns as a sacrifice', () => {
    // 1.Nxe5 dxe5 2.Qxe5: a knight for two pawns, a pawn short, like 9.Rxf5 exf5 10.Nxf7.
    expect(isSacrifice('4k3/8/3p4/4p3/8/5N2/4Q3/4K3 w - - 0 1', '4k3/8/3p4/4N3/8/8/4Q3/4K3 b - - 0 1', ['d6e5', 'e2e5'], 'white')).toBe(true)
  })

  describe('a piece left hanging again', () => {
    // 20…Qxh3: the c6 knight has hung since 18…Qh5 and Black leaves it there once more.
    const start = 'r3k2r/1Rp3p1/p1n2pp1/7q/3N4/2B1P2P/P1P2P2/Q4RK1 b kq - 0 20'
    const pv = ['b7b8', 'c6b8', 'f1d1', 'h3h1']
    const classOf = (before: Partial<ReviewedPosition> & { score: Score }, after: Score) => {
      const { line, evals } = game(['h5h3'], [{ bestMove: 'h5h3', ...before }, { score: after, pv }], start)
      return classifyGame(line, evals).moves[line[1].id].cls
    }
    const mate = (value: number): Score => ({ type: 'mate', value })

    it('is not "brilliant" when already mating, even as the only mate found', () => {
      // A deeper search finds 20…Qg5+ mating in 4 as well.
      expect(classOf({ score: mate(-3), second: cp(-518) }, mate(-2))).not.toBe('brilliant')
    })

    it('is "brilliant" when the move is the only good one', () => {
      expect(classOf({ score: cp(-300), second: cp(-20) }, cp(-300))).toBe('brilliant')
    })

    it('is not "brilliant" when the engine line takes the piece that already hung', () => {
      const take = (before: Partial<ReviewedPosition> & { score: Score }, after: Score) =>
        (({ line, evals }) => classifyGame(line, evals).moves[line[1].id].cls)(game(['h5h3'], [{ bestMove: 'h5h3', ...before }, { score: after, pv: ['d4c6', 'h3h1'] }], start))
      expect(take({ score: mate(-3), second: cp(-518) }, mate(-2))).toBe('great') // the only fast mate: Clutch, not Legendary
      expect(take({ score: cp(-300), second: cp(-280) }, cp(-300))).toBe('best')
    })

    it('is just "best" when other moves work as well', () => {
      expect(classOf({ score: cp(-300), second: cp(-280) }, cp(-300))).toBe('best')
      expect(classOf({ score: mate(-3), second: mate(-4) }, mate(-2))).toBe('best')
    })
  })

  it('does not count an even trade left on offer as a sacrifice', () => {
    // Bxf6: the pawn can take back, but bishop for knight is a trade, not a sacrifice.
    expect(isSacrifice('4k3/6p1/5n2/8/8/8/1B6/4K3 w - - 0 1', '4k3/6p1/5B2/8/8/8/8/4K3 b - - 0 1', ['e8f7'], 'white')).toBe(false)
  })

  it('does not call giving back already-lost material "brilliant"', () => {
    // Petrov trap, 6.d4: the e5 knight is pinned and lost anyway (eval +0.5 while a knight up),
    // so 6...dxe5 7.dxe5 isn't a sacrifice — it just gets a pawn back for it.
    const start = 'rnb1kb1r/ppp1qppp/3p4/4N3/4Q3/8/PPPP1PPP/RNB1KB1R w KQkq - 0 6'
    const { line, evals } = game(['d2d4'], [{ score: cp(50), bestMove: 'd2d4' }, { score: cp(55), pv: ['d6e5', 'd4e5'] }], start)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
  })

  it('does not call a sacrifice "brilliant" when it leaves us worse than equal', () => {
    const start = '6k1/8/8/4p3/8/8/8/3R2K1 w - - 0 1'
    const { line, evals } = game(['d1d4'], [{ score: cp(-10), bestMove: 'd1d4' }, { score: cp(-10), pv: ['e5d4'] }], start)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
  })

  it('turns a mistake after the opponent blundered into a "miss"', () => {
    const { line, evals } = game(
      ['e2e4', 'e7e5', 'g1f3'],
      [
        { score: cp(30), bestMove: 'e2e4' },
        { score: cp(30), bestMove: 'c7c5' },
        { score: cp(600), bestMove: 'd1h5' }, // Black's e5 "blundered"; White is winning…
        { score: cp(80) }, // …but Nf3 lets it go, without losing.
      ],
    )
    const report = classifyGame(line, evals)
    expect(report.moves[line[2].id].cls).toBe('blunder')
    expect(report.moves[line[3].id].cls).toBe('miss')
  })

  it('keeps it a blunder when we fall below where we were before the opponent erred', () => {
    const { line, evals } = game(
      ['e2e4', 'e7e5', 'g1f3'],
      [{ score: cp(30), bestMove: 'e2e4' }, { score: cp(30), bestMove: 'c7c5' }, { score: cp(600), bestMove: 'd1h5' }, { score: cp(-250) }],
    )
    expect(classifyGame(line, evals).moves[line[3].id].cls).toBe('blunder')
  })

  it('calls a "miss" even when we were losing before the opponent erred', () => {
    // Black was much better (-3); 1...e5?? hands White +2, and 2.Nf3 gives it all back.
    const { line, evals } = game(
      ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
      [{ score: cp(-300) }, { score: cp(-300), bestMove: 'd7d5' }, { score: cp(200), bestMove: 'd2d4' }, { score: cp(-290), bestMove: 'f8c5' }, { score: cp(-290) }],
    )
    const report = classifyGame(line, evals)
    expect(report.moves[line[3].id].cls).toBe('miss')
  })

  it('calls a sacrifice that is nearly best "brilliant"', () => {
    const start = '6k1/8/8/4p3/8/8/8/3R2K1 w - - 0 1'
    // 1.5% short of the top move: "excellent" by the loss bands.
    const { line, evals } = game(['d1d4'], [{ score: cp(150), bestMove: 'd1d5' }, { score: cp(130), pv: ['e5d4'] }], start)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('calls the only move that holds a slightly worse position "great"', () => {
    const { line, evals } = game(['e2e4'], [{ score: cp(-30), bestMove: 'e2e4', second: cp(-400) }, { score: cp(-30) }])
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('great')
  })

  it('notes a missed mate', () => {
    const mate = (value: number): Score => ({ type: 'mate', value })
    const { line, evals } = game(['e2e4'], [{ score: mate(2), bestMove: 'd2d4' }, { score: cp(900) }])
    expect(classifyGame(line, evals).moves[line[1].id].missedMate).toBe(2)
    const found = game(['e2e4'], [{ score: mate(2), bestMove: 'd2d4' }, { score: mate(2) }])
    expect(classifyGame(found.line, found.evals).moves[found.line[1].id].missedMate).toBeUndefined()
  })

  it('marks the only legal move as forced', () => {
    const { line, evals } = game(['g8h8'], [{ score: cp(0) }, { score: cp(0) }], '6k1/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('forced')
  })
})

describe('accuracy', () => {
  it('per-move accuracy is 100 for no loss and drops with the win% lost', () => {
    expect(moveAccuracy(50, 50)).toBe(100)
    expect(moveAccuracy(50, 60)).toBe(100)
    expect(moveAccuracy(60, 50)).toBeGreaterThan(60)
    expect(moveAccuracy(60, 50)).toBeLessThan(70)
    expect(moveAccuracy(90, 10)).toBeLessThan(5)
  })

  it('game accuracy rewards the side that played well', () => {
    const { line, evals } = game(
      ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'],
      [cp(30), cp(30), cp(30), cp(30), cp(30), cp(30), cp(800)].map((score) => ({ score })),
    )
    const acc = gameAccuracy(line, evals)
    expect(acc.white).toBeGreaterThan(95)
    expect(acc.black!).toBeLessThan(acc.white!)
  })

  it('needs every position to be reviewed', () => {
    const { line, evals } = game(['e2e4', 'e7e5'], [{ score: cp(30) }, { score: cp(30) }])
    expect(gameAccuracy(line, evals)).toEqual({ white: null, black: null })
  })
})

describe('material', () => {
  it('computes balance and captured pieces', () => {
    const fen = 'rnb1kbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 0 3' // both queens gone
    expect(materialBalance(fen, 'white')).toBe(0)
    const m = materialState('r1bqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 4') // each side lost a knight
    expect(m.captured.white).toEqual(['knight'])
    expect(m.captured.black).toEqual(['knight'])
    expect(m.advantage).toEqual({ white: 0, black: 0 })
    const up = materialState('rnbqkbnr/pppp1ppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2') // Black's e-pawn gone
    expect(up.captured.white).toEqual(['pawn'])
    expect(up.advantage.white).toBe(1)
  })
})

describe('openings', () => {
  it('finds the deepest named position along a path', () => {
    const { line } = game(['e2e4', 'e7e6', 'd2d4'], [])
    const key = (fen: string) => fen.split(' ').slice(0, 3).join(' ')
    const book = makeBook({
      names: ['C00 French Defense', 'B00 King’s Pawn'],
      positions: { [key(line[1].fen)]: 1, [key(line[2].fen)]: 0, [key(line[3].fen)]: -1 },
    })
    expect(book.isBook(line[3].fen)).toBe(true)
    expect(book.nameAt(line[3].fen)).toBeUndefined()
    expect(openingOf(book, line)).toEqual({ eco: 'C00', name: 'French Defense' })
  })
})

describe('commentary', () => {
  it('points out a missed mate and a missed win', () => {
    const base = { nodeId: 'x', ply: 1, color: 'white' as const, winBefore: 90, winAfter: 50, loss: 0.4, accuracy: 10, score: cp(0) }
    expect(moveDetail({ ...base, cls: 'blunder', missedMate: 3 }, 'Qh7+')).toBe('Qh7+ had mate in 3.')
    expect(moveDetail({ ...base, cls: 'blunder' }, 'Qh7+')).toBe('This lets the win slip. Qh7+ kept it.')
    expect(moveDetail({ ...base, cls: 'excellent', winAfter: 99, missedMate: 7 }, 'Qh7+')).toBe('Qh7+ was slightly stronger.')
  })

  it('writes natural headlines', () => {
    const base = { nodeId: 'x', ply: 1, color: 'white' as const, winBefore: 50, winAfter: 50, loss: 0, accuracy: 100, score: cp(0) }
    const headline = (cls: Parameters<typeof moveHeadline>[1]['cls']) => moveHeadline('Nf3', { ...base, cls })
    expect(headline('brilliant')).toBe('Nf3 is legendary!')
    expect(headline('great')).toBe('Nf3 is clutch!')
    expect(headline('best')).toBe('Nf3 is best')
    expect(headline('excellent')).toBe('Nf3 is strong')
    expect(headline('good')).toBe('Nf3 is solid')
    expect(headline('book')).toBe('Nf3 is theory')
    expect(headline('inaccuracy')).toBe('Nf3 is a slip')
    expect(headline('mistake')).toBe('Nf3 is a mistake')
    expect(headline('miss')).toBe('Nf3 is an oversight')
    expect(headline('blunder')).toBe('Nf3 is a blunder')
    expect(headline('forced')).toBe('Nf3 is forced')
  })
})

describe('withClasses', () => {
  const { line, evals } = game(['e2e4', 'e7e5', 'g1f3'], [{ score: cp(30), bestMove: 'e2e4' }, { score: cp(30), bestMove: 'e7e5' }, { score: cp(30), bestMove: 'g1f3' }, { score: cp(30) }])
  const report = classifyGame(line, evals)

  it('leaves a report alone when nothing is overridden', () => {
    expect(withClasses(report, {})).toEqual(report)
  })

  it('replaces a class and moves its count, keeping accuracy', () => {
    const third = line[3].id
    expect(report.moves[third].cls).toBe('best')
    const out = withClasses(report, { [third]: 'brilliant' })
    expect(out.moves[third].cls).toBe('brilliant')
    expect(out.counts.white.best).toBe(report.counts.white.best - 1)
    expect(out.counts.white.brilliant).toBe(report.counts.white.brilliant + 1)
    expect(out.accuracy).toEqual(report.accuracy)
    expect(report.moves[third].cls).toBe('best')
  })
})
