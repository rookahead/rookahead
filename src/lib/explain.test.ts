import { describe, expect, it } from 'vitest'
import { explainMove, lineText, nullMoveFen, playSteps, takeFen, type ExplainInput } from './explain'

const cp = (value: number) => ({ type: 'cp' as const, value })

// Real moments from recorded games: the review's scores, and Stockfish 19 lines at depth 16.

/** 20…Rab8 (melonlord): White's e5 was on the board already, and Rab8 does nothing about it. */
const RAB8: ExplainInput = {
  fenBefore: 'r2r2k1/1p2qppp/pQnpb3/8/P3P3/B1P5/5PPP/R3RBK1 b - - 7 20',
  uci: 'a8b8',
  san: 'Rab8',
  cls: 'blunder',
  best: { pv: ['f7f6', 'f2f4', 'e6f7', 'a1d1', 'd8d7', 'b6f2', 'a8e8', 'h2h3'], score: cp(86) },
  reply: { pv: ['e4e5', 'd8d7', 'e5d6', 'e7d8', 'b6e3', 'c6a5', 'a1d1', 'b8c8'], score: cp(374) },
  threat: { pv: ['e4e5', 'e7h4', 'e5d6', 'a8b8', 'c3c4', 'h7h6', 'a1c1'], score: cp(309) },
}

const texts = (input: ExplainInput) => explainMove(input)?.rows.map((r) => `${r.label}: ${r.text}`)

describe('explaining a move', () => {
  it('names the threat the move ignored, how it loses, and what was better', () => {
    expect(texts(RAB8)).toEqual([
      'The threat: White was threatening e5, which wins the d6 pawn.',
      'Rab8: Does nothing about e5.',
      'How it loses: 21.e5 wins the d6 pawn. White is winning (+3.74).',
      'Better: 20…f6 covers e5. White stays only a little better (+0.86).',
    ])
    // The line stops once the pawn is won.
    expect(explainMove(RAB8)?.lines).toEqual([{ label: 'The line', from: 'after', fen: '1r1r2k1/1p2qppp/pQnpb3/8/P3P3/B1P5/5PPP/R3RBK1 w - - 8 21', uci: ['e4e5', 'd8d7', 'e5d6'], text: '21.e5 Rd7 22.exd6' }])
  })

  it('draws each row on the board', () => {
    const rows = explainMove(RAB8)!.rows
    expect(rows[0].shapes).toEqual([{ orig: 'e4', dest: 'e5', brush: 'red' }])
    expect(rows[3].shapes).toEqual([{ orig: 'f7', dest: 'f6', brush: 'suggest' }])
  })

  it('leaves the threat out when the punishment is something else', () => {
    // A threat whose first move isn't the reply that punishes the move tells another story.
    const rows = explainMove({ ...RAB8, threat: { ...RAB8.threat!, pv: ['a3b4', ...RAB8.threat!.pv.slice(1)] } })!.rows
    expect(rows.map((r) => r.key)).toEqual(['loses', 'better'])
  })

  it('says what the missed check was pulling away, where it leads, and what the reply shuts', () => {
    // MelonLord-009 – DarkBiishopOnFire, 2026: 22.b3 saves the pawn, but 22.Qf5+ g6 23.Nf6+ was there.
    const B3: ExplainInput = {
      fenBefore: '3r1br1/pp4pk/1qp4p/8/4NQ2/8/PPP3PP/R4R1K w - - 1 22',
      uci: 'b2b3',
      san: 'b3',
      cls: 'blunder',
      best: { pv: ['f4f5', 'g7g6', 'e4f6', 'h7h8', 'f5e6', 'g8g7', 'f6e8', 'b6c5', 'e8g7', 'f8g7', 'e6g6', 'c5g5', 'g6e4'], score: cp(576) },
      reply: { pv: ['f8e7', 'f4e5', 'd8e8', 'a1d1'], score: cp(-8) },
      threat: null,
    }
    expect(texts(B3)).toEqual([
      'The chance: You had a winning shot. 22.Qf5+ forces …g6, and now nothing guards f6.',
      'Then: 23.Nf6+ Kh8 24.Qe6 wins the exchange (+5.76).',
      'b3: Saves the attacked b2 pawn, but it’s too slow. After …Be7, which guards f6, it’s about level (−0.08).',
    ])
    const e = explainMove(B3)!
    expect(e.rows[1].position?.fen).toBe('3r1br1/pp5k/1qp3pp/5Q2/4N3/8/PPP3PP/R4R1K w - - 0 23')
    expect(e.lines[0].text).toBe('22.Qf5+ g6 23.Nf6+ Kh8 24.Qe6 Rg7 25.Ne8 Qc5 26.Nxg7 Bxg7 27.Qxg6')
  })

  it('tells a mating sacrifice: the threat, what makes it work, and why taking is mate too', () => {
    // The same game, 26.Nf6!!: Qh7 is coming, and …gxf6 lets Qxh6 in.
    const NF6: ExplainInput = {
      fenBefore: '6rk/pp4p1/1qp3Qp/2br4/4N3/1PP5/P5PP/R4R1K w - - 3 26',
      uci: 'e4f6',
      san: 'Nf6',
      cls: 'brilliant',
      best: { pv: ['e4f6', 'd5g5', 'g6h7'], score: { type: 'mate', value: 2 } },
      reply: { pv: ['d5g5', 'g6h7'], score: { type: 'mate', value: 1 } },
      playedTake: { pv: ['g6h6'], score: { type: 'mate', value: 1 } },
      ownThreat: { pv: ['g6h7'], score: { type: 'mate', value: 1 } },
    }
    expect(texts(NF6)).toEqual([
      'The idea: Gives up the knight: the g7 pawn can take it.',
      'The threat: Next is 27.Qh7 mate: the knight guards h7.',
      'If 26…gxf6: The pawn has left g7, so 27.Qxh6 is mate.',
      'Either way: Black can’t take it and can’t leave it: it’s mate either way.',
    ])
    // Without the search for its threat, the line itself tells it.
    expect(texts({ ...NF6, ownThreat: null })?.[1]).toBe('Then: It starts a mate in 2: it ends with 27.Qh7#, and the knight guards h7.')
  })

  it('spots a fork', () => {
    expect(
      texts({
        fenBefore: '8/p7/1pb2B2/5p1k/6rP/P1P3K1/1P6/5R2 w - - 5 39',
        uci: 'g3h3',
        san: 'Kh3',
        cls: 'blunder',
        best: { pv: ['g3f2', 'f5f4', 'f1g1', 'g4g1', 'f2g1', 'h5g4'], score: cp(0) },
        reply: { pv: ['c6g2', 'h3h2', 'g2f1', 'c3c4', 'f5f4', 'f6g5'], score: cp(-761) },
        threat: null,
      }),
    ).toEqual([
      'How it loses: 39…Bg2+ forks your king and rook, and wins the rook on f1. Black is winning (−7.61).',
      'Better: 39.Kf2 covers g2. It stays about level (0.00).',
    ])
  })

  it('says when the move stops guarding what gets taken', () => {
    const rows = explainMove({
      fenBefore: 'r4rk1/ppp2ppp/2P5/8/8/P1N2PPb/1PP5/R1BQKB1q w Q - 1 14',
      uci: 'e1d2',
      san: 'Kd2',
      cls: 'mistake',
      best: { pv: ['d1e2', 'a8e8', 'c3e4', 'f7f5', 'c1e3', 'f5e4', 'e1c1', 'b7c6'], score: cp(-293) },
      reply: { pv: ['h3f1', 'c3d5', 'b7c6', 'd5e7', 'g8h8', 'd2c3', 'f8d8', 'c1d2'], score: cp(-705) },
      threat: { pv: ['h1f1', 'e1d2', 'a8d8', 'd2e3', 'f8e8', 'e3f4', 'd8d1', 'c1d2'], score: cp(-2094) },
    })!.rows
    expect(rows[0]).toMatchObject({ label: 'Kd2', text: 'Stops guarding the bishop on f1.' })
    expect(rows[1].label).toBe('What it allows')
  })

  it('tells a missed win by what was there, not by what comes next', () => {
    const e = explainMove({
      fenBefore: '3r4/pp3pkp/6b1/3p4/3p1B2/P4PN1/1PP3PP/2R1K3 w - - 2 24',
      uci: 'g3e4',
      san: 'Ne4',
      cls: 'blunder',
      best: { pv: ['f4e5', 'f7f6', 'e5d4', 'd8c8', 'c2c3', 'g7f7', 'e1f2', 'c8e8'], score: cp(650) },
      reply: { pv: ['d5e4', 'f3e4', 'g6e4', 'g2g4', 'g7g6', 'e1d2', 'd8c8', 'c2c3'], score: cp(3) },
      threat: null,
    })!
    expect(e.rows.map((r) => `${r.label}: ${r.text}`)).toEqual([
      'The chance: You had a winning shot. 24.Be5+ wins the d4 pawn (+6.50).',
      'Ne4: Lets the win slip. After 24…dxe4, it’s about level (+0.03).',
    ])
    expect(e.lines[0].from).toBe('before')
  })

  it('doesn’t fall over on a line it can’t play to the end of', () => {
    const fenBefore = 'r1bqk1nr/pppp1pp1/2n4p/2b5/2BNP3/8/PPP2PPP/RNBQK2R w KQkq - 1 6'
    const input = { fenBefore, uci: 'c1e3', san: 'Be3', cls: 'miss' as const, reply: { pv: ['d8f6'], score: cp(48) } }
    expect(() => explainMove({ ...input, best: { pv: ['c4f7', 'e8h8', 'd4c6'], score: cp(247) } })).not.toThrow()
  })

  it('follows a sacrifice the defence declines into the line where it’s taken', () => {
    // 6.Be3 (MelonLord-009, 2026-10-26): 6.Bxf7+ was there. The engine's defence is 6…Kf8, but the
    // point is what happens if Black takes: a fork that wins the bishop back.
    const fenBefore = 'r1bqk1nr/pppp1pp1/2n4p/2b5/2BNP3/8/PPP2PPP/RNBQK2R w KQkq - 1 6'
    const best = { pv: ['c4f7', 'e8f8', 'd4c6', 'b7c6', 'f7b3', 'd8h4', 'd1f3', 'g8f6'], score: cp(247) }
    expect(takeFen(fenBefore, best.pv)).toBe('r1bq2nr/pppp1kp1/2n4p/2b5/3NP3/8/PPP2PPP/RNBQK2R w KQ - 0 7')
    const e = explainMove({
      fenBefore,
      uci: 'c1e3',
      san: 'Be3',
      cls: 'miss',
      best,
      reply: { pv: ['d8f6', 'c2c3', 'g8e7', 'e1g1', 'e8g8', 'c4b3', 'b7b6', 'f1e1'], score: cp(48) },
      bestTake: { pv: ['d1h5', 'f7f8', 'h5c5', 'd7d6', 'd4c6', 'd8e8', 'c5d4', 'b7c6'], score: cp(292) },
    })!
    expect(e.rows.map((r) => `${r.label}: ${r.text}`)).toEqual([
      'The chance: 6.Bxf7+ sacrifices the bishop with check.',
      'If 6…Kxf7: 7.Qh5+ forks the king and the bishop on c5, and 8.Qxc5+ wins it back.',
      'Either way: White ends a pawn up, and Black can’t castle any more (+2.47).',
      'Be3: Misses 6.Bxf7+. You’re only a little better (+0.48).',
    ])
    expect(e.lines.map((l) => `${l.label}: ${l.text}`)).toEqual(['If 6…Kxf7: 6.Bxf7+ Kxf7 7.Qh5+ Kf8 8.Qxc5+', 'Best defence: 6.Bxf7+ Kf8'])
    expect(e.lines[0]).toMatchObject({ from: 'before', uci: ['c4f7', 'e8f7', 'd1h5', 'f7f8', 'h5c5'] })
  })

  it('gives up when the move doesn’t fit the position', () => {
    expect(explainMove({ ...RAB8, uci: 'e1e8' })).toBeNull()
  })
})

describe('explaining a good move', () => {
  it('says it takes back what was taken, and what came next', () => {
    // 1.e4 d5 2.exd5 Qxd5
    const e = explainMove({
      fenBefore: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
      uci: 'd8d5',
      san: 'Qxd5',
      cls: 'best',
      best: { pv: ['d8d5', 'b1c3', 'd5a5'], score: cp(40) },
      reply: { pv: ['b1c3', 'd5a5'], score: cp(40) },
      second: { move: 'g8f6', score: cp(55) },
    })!
    expect(e.rows.map((r) => `${r.label}: ${r.text}`)).toEqual(['The idea: Takes back the pawn.', 'Next best: One of several good moves: 2…Nf6 was next (+0.55).'])
    expect(e.lines[0]).toMatchObject({ label: 'Best play from here', text: '3.Nc3 Qa5' })
  })

  it('names castling', () => {
    const e = explainMove({
      fenBefore: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
      uci: 'e1g1',
      san: 'O-O',
      cls: 'excellent',
      best: { pv: ['d2d3', 'd7d6'], score: cp(30) },
      reply: { pv: ['d7d6', 'c2c3'], score: cp(20) },
    })!
    expect(e.rows[0].text).toBe('Castles: the king is safe and the rook comes into play.')
    expect(e.rows[1]).toMatchObject({ label: 'Best', text: '4.d3 was a little better (+0.30).' })
  })
})

describe('playing a row', () => {
  it('steps through its positions', () => {
    const steps = playSteps({ fen: RAB8.fenBefore, uci: ['a8b8', 'e4e5'] })
    expect(steps.map((s) => s.lastMove)).toEqual([undefined, ['a8', 'b8'], ['e4', 'e5']])
    expect(steps[0].fen).toBe(RAB8.fenBefore)
  })

  it('gives every row of a mistake something to play', () => {
    expect(explainMove(RAB8)!.rows.map((r) => r.play?.uci)).toEqual([['e4e5'], ['a8b8'], ['e4e5', 'd8d7', 'e5d6'], ['f7f6', 'f2f4', 'e6f7', 'a1d1']])
  })
})

describe('null move', () => {
  it('hands the move to the other side', () => {
    expect(nullMoveFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2')).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2')
  })

  it('has nothing to give in check', () => {
    expect(nullMoveFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBeNull()
  })
})

describe('line text', () => {
  it('numbers the moves from the position', () => {
    expect(lineText(RAB8.fenBefore, ['Rab8', 'e5', 'Rd7'])).toBe('20…Rab8 21.e5 Rd7')
  })
})
