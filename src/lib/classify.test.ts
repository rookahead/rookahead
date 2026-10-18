import { describe, expect, it } from 'vitest'
import { classifyGame, gameAccuracy, isSacrifice, materialBalance, moveAccuracy, type ReviewedPosition } from './classify'
import { moveHeadline } from './commentary'
import { materialState } from './material'
import { makeBook, openingOf } from './openings'
import { addLine, createTree, mainline, ROOT_ID } from './tree'
import type { Score } from './uci'

const cp = (value: number): Score => ({ type: 'cp', value })

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

  it('calls a move "best" when it keeps the same eval as the engine\'s top move', () => {
    const { line, evals } = game(['e2e4'], [{ score: cp(30), bestMove: 'd2d4' }, { score: cp(25) }])
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
  })

  it('skips moves without review data on both sides', () => {
    const { line, evals } = game(['e2e4', 'e7e5'], [{ score: cp(30), bestMove: 'e2e4' }, { score: cp(30) }])
    const report = classifyGame(line, evals)
    expect(Object.keys(report.moves)).toEqual([line[1].id])
  })
})

describe('book, great, brilliant, miss, forced', () => {
  it('marks a contiguous book prefix', () => {
    const { line, evals } = game(['e2e4', 'e7e5', 'g1f3', 'b8c6'], [cp(30), cp(30), cp(30), cp(30), cp(30)].map((score) => ({ score, bestMove: 'x' })))
    const bookFens = new Set([line[1].fen, line[2].fen, line[4].fen]) // 2.Nf3 missing: book stops there
    const report = classifyGame(line, evals, (fen) => bookFens.has(fen))
    expect(line.slice(1).map((n) => report.moves[n.id].cls)).toEqual(['book', 'book', 'best', 'best'])
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
      const { line, evals } = game(['d8d1'], [{ score: mate(-1), bestMove: 'd8d1', second: mate(-5) }, { score: { type: 'mate', value: 0, mated: 'white' } }], '3r2k1/8/8/8/8/8/5PPP/6K1 b - - 0 1')
      expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('best')
    })
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
    // Giving up pawns, even two of them, isn't a piece sacrifice.
    expect(isSacrifice('3q2k1/8/8/8/4P3/3P4/8/6K1 w - - 0 1', '3q2k1/8/8/8/3PP3/8/8/6K1 b - - 0 1', ['d8d4', 'g1h1', 'd4e4'], 'white')).toBe(false)
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

  it('counts a piece won back only after a quiet move as a sacrifice', () => {
    // 18…Nxe4!: 19.dxe4 d3 leaves Black a knight down for a move before 20.Bf4 Bxc4 wins it back.
    const before = '1r1qrbk1/1p3pp1/p1n1bn1p/2p5/2NpP3/PP1P1N1P/3BBPP1/R2Q1RK1 b - - 3 18'
    const after = '1r1qrbk1/1p3pp1/p1n1b2p/2p5/2Npn3/PP1P1N1P/3BBPP1/R2Q1RK1 w - - 0 19'
    const pv = ['d3e4', 'd4d3', 'd2f4', 'e6c4', 'b3c4', 'e8e4']
    expect(isSacrifice(before, after, pv, 'black', 1.36)).toBe(true)
    const { line, evals } = game(['f6e4'], [{ score: cp(-136), bestMove: 'f6e4' }, { score: cp(-140), pv }], before)
    expect(classifyGame(line, evals).moves[line[1].id].cls).toBe('brilliant')
  })

  it('does not count a piece taken straight back as a sacrifice', () => {
    // Nxe5 dxe5?? would be a sacrifice, but here the queen takes back on e5 at once.
    expect(isSacrifice('4k3/8/3p4/4p3/8/5N2/4Q3/4K3 w - - 0 1', '4k3/8/3p4/4N3/8/8/4Q3/4K3 b - - 0 1', ['d6e5', 'e2e5'], 'white')).toBe(false)
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
  it('writes natural headlines', () => {
    const base = { nodeId: 'x', ply: 1, color: 'white' as const, winBefore: 50, winAfter: 50, loss: 0, accuracy: 100, score: cp(0) }
    expect(moveHeadline('Nf3', { ...base, cls: 'best' })).toBe('Nf3 is the best move')
    expect(moveHeadline('Qh5', { ...base, cls: 'inaccuracy' })).toBe('Qh5 is an inaccuracy')
    expect(moveHeadline('Qh5', { ...base, cls: 'blunder' })).toBe('Qh5 is a blunder')
  })
})
