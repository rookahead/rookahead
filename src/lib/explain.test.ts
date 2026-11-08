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
    // Without the search for its threat, a mate in one is found by hand.
    expect(texts({ ...NF6, ownThreat: null })).toEqual(texts(NF6))
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
      'The chance: 6.Bxf7+ gives up the bishop for the f7 pawn with check: the king can take it.',
      'If 6…Kxf7: 7.Qh5+ forks the king and the bishop on c5, and 8.Qxc5+ wins it back.',
      'Either way: White ends a pawn up, and Black can’t castle any more (+2.47).',
      'Be3: Misses 6.Bxf7+. You’re only a little better (+0.48).',
    ])
    expect(e.lines.map((l) => `${l.label}: ${l.text}`)).toEqual(['If 6…Kxf7: 6.Bxf7+ Kxf7 7.Qh5+ Kf8 8.Qxc5+', 'Best defence: 6.Bxf7+ Kf8'])
    expect(e.lines[0]).toMatchObject({ from: 'before', uci: ['c4f7', 'e8f7', 'd1h5', 'f7f8', 'h5c5'] })
  })

  it('tells what a sacrifice buys when taking it wins nothing back: the attack', () => {
    // 9…b5 in the Opera Game (Morphy, 1858). 10.Nxb5 can be taken, and nothing comes back soon,
    // but 11.Bxb5+ and 12.O-O-O+ hunt the king. Without those moves, "gives up the knight" reads as a loss.
    const e = explainMove({
      fenBefore: 'rn2kb1r/pp2qppp/2p2n2/4p1B1/2B1P3/1QN5/PPP2PPP/R3K2R b KQkq - 1 9',
      uci: 'b7b5',
      san: 'b5',
      cls: 'mistake',
      best: { pv: ['b8a6', 'g5f6', 'g7f6', 'c4a6', 'b7a6', 'b3a4', 'e7b7', 'e1c1'], score: cp(240) },
      reply: { pv: ['c3b5', 'e7b4', 'b5c3', 'b4b3', 'a2b3', 'f8b4', 'f2f3', 'f6d7'], score: cp(409) },
      replyTake: { pv: ['c4b5', 'e8d8', 'e1c1', 'd8c8', 'd1d3', 'e7b4', 'd3c3', 'c8b7', 'b3f7'], score: cp(666) },
    })!
    expect(e.rows.map((r) => `${r.label}: ${r.text}`)).toEqual([
      'b5: Puts the pawn where it can be taken.',
      'What it allows: 10.Nxb5 gives up the knight for the b5 pawn: the c6 pawn can take it.',
      'If 10…cxb5: 11.Bxb5+ and 12.O-O-O+ come with check after check: Black’s king is stuck in the middle. White is still winning.',
      'If 10…Qb4+: White ends a pawn up (+4.09).',
      'Better: 9…Na6 develops the knight. White stays better, but you’re still in it (+2.40).',
    ])
    expect(e.lines.map((l) => `${l.label}: ${l.text}`)).toEqual(['If 10…cxb5: 10.Nxb5 cxb5 11.Bxb5+ Kd8 12.O-O-O+', 'Best defence: 10.Nxb5 Qb4+'])
    // The coach line on the mistake stays short: the attack is for Explain to show.
    expect(e.coach?.allows).toBe('10.Nxb5 wins the b5 pawn.')

    // On 10.Nxb5 itself, the coach says how it goes on in one sentence.
    const played = explainMove({
      fenBefore: 'rn2kb1r/p3qppp/2p2n2/1p2p1B1/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq - 0 10',
      uci: 'c3b5',
      san: 'Nxb5',
      cls: 'brilliant',
      best: { pv: ['c3b5', 'e7b4', 'b5c3', 'b4b3', 'a2b3', 'f8b4', 'f2f3', 'f6d7'], score: cp(409) },
      reply: { pv: ['e7b4', 'b5c3', 'b4b3', 'a2b3', 'f8b4', 'f2f3', 'f6d7'], score: cp(409) },
      playedTake: { pv: ['c4b5', 'e8d8', 'e1c1', 'd8c8', 'd1d3', 'e7b4', 'd3c3', 'c8b7', 'b3f7'], score: cp(666) },
    })!
    expect(played.coach?.also).toBe('If 10…cxb5, 11.Bxb5+ and 12.O-O-O+ come with check after check.')
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
    expect(e.rows[1]).toMatchObject({ label: 'Best', text: '4.d3 protects the hanging e4 pawn (+0.30).' })
  })
})

describe('a whole game, move by move (MelonLord-009 – DarkBiishopOnFire, 2026)', () => {
  it('8.Ne5+: a check that forks a piece, which falls once the king moves', () => {
    expect(texts({ fenBefore: 'rn1q1b1r/pp2pkpp/2p2n2/8/3P2b1/2N2N2/PPP3PP/R1BQK2R w KQ - 0 8', uci: 'f3e5', san: 'Ne5+', cls: 'great', best: { pv: ['f3e5', 'f7g8', 'e5g4', 'b8d7', 'd1e2', 'h7h6', 'c1f4', 'f6g4', 'e2g4', 'd7f6'], score: { type: 'cp', value: 148 }}, reply: { pv: ['f7g8', 'e5g4', 'b8d7', 'd1e2', 'h7h6', 'c1f4', 'f6g4', 'e2g4', 'd7f6', 'g4e6'], score: { type: 'cp', value: 182 }}, threat: { pv: ['g4f3', 'd1f3', 'd8d4', 'h2h3', 'd4c4', 'c1e3', 'b8d7', 'e1c1', 'f7g8', 'h1f1'], score: { type: 'cp', value: -469 }}, second: { move: 'e1g1', score: { type: 'cp', value: -347 }}, previous: 'e8f7' } as ExplainInput)).toEqual(['The idea: Forks the king and the bishop on g4: after the king moves, 9.Nxg4 wins it.', 'Next best: Nothing else holds: 8.O-O was next (−3.47).'])
  })
  it('8…Kg8: getting out of check, and what falls anyway', () => {
    expect(texts({ fenBefore: 'rn1q1b1r/pp2pkpp/2p2n2/4N3/3P2b1/2N5/PPP3PP/R1BQK2R b KQ - 1 8', uci: 'f7g8', san: 'Kg8', cls: 'best', best: { pv: ['f7g8', 'e5g4', 'b8d7', 'd1e2', 'h7h6', 'c1f4', 'f6g4', 'e2g4', 'd7f6', 'g4e6'], score: { type: 'cp', value: 182 }}, reply: { pv: ['e5g4', 'b8d7', 'd1e2', 'h7h6', 'c1f4', 'f6g4', 'e2g4', 'd7f6', 'g4e6', 'g8h7'], score: { type: 'cp', value: 177 }}, ownThreat: { pv: ['g4d1', 'c3d1', 'd8d4', 'e5f3', 'd4d6', 'c1d2', 'b8d7', 'd1e3', 'h7h6', 'a2a3'], score: { type: 'cp', value: -892 }}, second: { move: 'f7e8', score: { type: 'cp', value: 220 }}, previous: 'f3e5' } as ExplainInput)).toEqual(['The idea: Gets out of check, but 9.Nxg4 still wins the bishop on g4.', 'Next best: One of several good moves: 8…Ke8 was next (+2.20).'])
  })
  it('14…Qc5+: a check, not a defender for a pawn only the queen attacks', () => {
    expect(texts({ fenBefore: 'r4bkr/pp2q1pp/2p5/4n3/Q7/2N5/PPP3PP/R1B2RK1 b - - 1 14', uci: 'e7c5', san: 'Qc5+', cls: 'best', best: { pv: ['e7b4', 'a4b4', 'f8b4', 'c3e4', 'a8e8', 'c1d2', 'b4d2', 'e4d2', 'e5g4', 'd2c4'], score: { type: 'cp', value: 24 }}, reply: { pv: ['f1f2', 'c5c4', 'a4c4', 'e5c4', 'b2b3', 'f8b4', 'c3a4', 'b7b5', 'b3c4', 'b5a4'], score: { type: 'cp', value: 24 }}, threat: { pv: ['a4b3', 'e5f7', 'c1d2', 'h7h6', 'a1e1', 'e7d7', 'c3e4', 'a8e8', 'a2a4', 'b7b6'], score: { type: 'cp', value: 293 }}, second: { move: 'e7c5', score: { type: 'cp', value: 30 }}, previous: 'g4a4' } as ExplainInput)).toEqual(['The idea: Gives check: after 15.Rf2, 15…Qc4 follows.'])
  })
  it('16…Qb6: the piece it stops guarding, and the reply that goes for it', () => {
    expect(texts({ fenBefore: 'r4bkr/pp4p1/2p4p/2q1n3/Q3N3/8/PPP3PP/R1B2R1K b - - 1 16', uci: 'c5b6', san: 'Qb6', cls: 'mistake', best: { pv: ['c5c4', 'a4c4', 'e5c4', 'c1f4', 'g8h7', 'b2b3', 'c4b6', 'a1e1', 'b6d5', 'f4d6'], score: { type: 'cp', value: 21 }}, reply: { pv: ['c1f4', 'e5g6', 'a4c4', 'g8h7', 'f4g5', 'b6b5', 'c4f7', 'h6g5', 'a2a4', 'b5b2'], score: { type: 'cp', value: 243 }}, threat: { pv: ['e4c5', 'f8c5', 'a4e4', 'c5d6', 'c1f4', 'a8e8', 'f4e5', 'd6e5', 'a1e1', 'h6h5'], score: { type: 'cp', value: 866 }}, ownThreat: { pv: ['b6b4', 'a4b3', 'b4b3', 'a2b3', 'e5f7', 'c1d2', 'h6h5', 'h2h3', 'f8e7', 'd2e3'], score: { type: 'cp', value: 50 }}, second: { move: 'c5b4', score: { type: 'cp', value: 51 }}, previous: 'c3e4' } as ExplainInput)).toEqual(['Qb6: Stops guarding the knight on e5, and 17.Bf4 attacks it.', 'What it allows: After 17.Bf4, White is clearly better (+2.43).', 'Better: 16…Qc4 was the move. It stays about level (+0.21).'])
  })
  it('20…Nxf4: a trade isn’t a loss: what falls for good is the bishop, later', () => {
    expect(texts({ fenBefore: '3r1b1r/pp4pk/1qp3np/8/4NB2/6Q1/PPP3PP/R4R1K b - - 9 20', uci: 'g6f4', san: 'Nxf4', cls: 'blunder', best: { pv: ['b6b4', 'e4g5', 'h6g5', 'g3h3', 'h7g8', 'h3e6', 'g8h7'], score: { type: 'cp', value: 0 }}, reply: { pv: ['g3f4', 'c6c5', 'f4f7', 'f8e7', 'f7e7', 'h8e8', 'e7h4', 'b6g6', 'e4g3', 'g6c2'], score: { type: 'cp', value: 459 }}, threat: { pv: ['f4c7', 'b6d4', 'c7d8', 'd4e4', 'd8a5', 'f8e7', 'a5c3', 'h8f8', 'f1f8', 'e7f8'], score: { type: 'cp', value: 526 }}, ownThreat: { pv: ['f4g6', 'h2h4', 'f8e7', 'h4h5', 'g6h4', 'f1f7', 'b6b2', 'a1f1', 'h8f8', 'f1f2'], score: { type: 'cp', value: -313 }}, second: { move: 'b6d4', score: { type: 'cp', value: 15 }}, previous: 'd3g3' } as ExplainInput)).toEqual(['How it loses: 21.Qxf4, then 23.Qxe7 wins the bishop on e7. White is winning (+4.59).', 'Better: 20…Qb4, then 21…hxg5 wins the knight on g5. It stays about level (0.00).'])
  })
  it('21.Qxf4: a recapture is taking back, not winning', () => {
    expect(texts({ fenBefore: '3r1b1r/pp4pk/1qp4p/8/4Nn2/6Q1/PPP3PP/R4R1K w - - 0 21', uci: 'g3f4', san: 'Qxf4', cls: 'best', best: { pv: ['g3f4', 'c6c5', 'f4f7', 'f8e7', 'f7e7', 'h8e8', 'e7h4', 'b6g6', 'e4g3', 'g6c2'], score: { type: 'cp', value: 459 }}, reply: { pv: ['c6c5', 'f4f7', 'f8e7', 'f7e7', 'h8e8', 'e7h4', 'b6g6', 'e4g3', 'd8d4', 'h4h3'], score: { type: 'cp', value: 448 }}, threat: { pv: ['f4g6', 'h2h4', 'f8e7', 'h4h5', 'g6h4', 'f1f7', 'b6b2', 'a1f1', 'h8f8', 'f1f2'], score: { type: 'cp', value: -313 }}, ownThreat: { pv: ['f4f5', 'g7g6', 'f5f7', 'f8g7', 'e4f6'], score: { type: 'mate', value: 3 }}, second: { move: 'f1f4', score: { type: 'cp', value: 49 }}, previous: 'g6f4' } as ExplainInput)).toEqual(['The idea: Takes back the knight.', 'Next best: Well ahead of the rest: 21.Rxf4 was next (+0.49).'])
  })
  it('23.Qf5+: a check that leads nowhere, and why the better move was better', () => {
    expect(texts({ fenBefore: '5br1/pp4pk/1qp4p/8/3rNQ2/1P6/P1P3PP/R4R1K w - - 1 23', uci: 'f4f5', san: 'Qf5+', cls: 'blunder', best: { pv: ['c2c3', 'd4d5', 'c3c4', 'd5a5', 'c4c5', 'b6d8', 'a1d1', 'd8e8', 'f4c7', 'e8e4'], score: { type: 'cp', value: 474 }}, reply: { pv: ['h7h8', 'c2c3', 'd4d5', 'f5f7', 'd5e5', 'e4d2', 'e5e7', 'f7g6', 'b6e3', 'd2f3'], score: { type: 'cp', value: 11 }}, threat: { pv: ['b6d8', 'c2c3', 'd4d5', 'c3c4', 'd5d4', 'f4f5', 'h7h8', 'f5g6', 'f8e7', 'e4g3'], score: { type: 'cp', value: 0 }}, second: { move: 'f4f7', score: { type: 'cp', value: 227 }}, previous: 'd8d4' } as ExplainInput)).toEqual(['The chance: You had a winning shot. 23.c3 was the move: it kicks the rook on d4 (+4.74).', 'Qf5+: The check leads nowhere. After 23…Kh8, it’s about level (+0.11).'])
  })
  it('25…Bc5: the other side’s mating sacrifice, and what the better move guards', () => {
    expect(texts({ fenBefore: '5brk/pp4p1/1qp3Qp/3r4/4N3/1PP5/P5PP/R4R1K b - - 2 25', uci: 'f8c5', san: 'Bc5', cls: 'blunder', best: { pv: ['b6d8', 'h2h3', 'f8e7', 'c3c4', 'd5e5', 'a1d1', 'd8e8', 'g6e8', 'g8e8', 'e4d6'], score: { type: 'cp', value: -6 }}, reply: { pv: ['e4f6', 'd5d1', 'g6h7'], score: { type: 'mate', value: 2 }}, threat: { pv: ['f1f7', 'b6d8', 'h2h3', 'f8e7', 'c3c4', 'd5e5', 'a1f1', 'd8e8', 'f1f4', 'e7d8'], score: { type: 'cp', value: 22 }}, replyTake: { pv: ['g6h6'], score: { type: 'mate', value: 1 }}, ownThreat: { pv: ['c5e7', 'e4g3', 'b6d8', 'g3f5', 'd8e8', 'g6e8', 'g8e8', 'a1e1', 'd5d7', 'h2h3'], score: { type: 'cp', value: 2 }}, second: { move: 'f8e7', score: { type: 'cp', value: -6 }}, previous: 'f5g6' } as ExplainInput)).toEqual(['How it loses: 26.Nf6 gives up the knight: the g7 pawn can take it.', 'The threat: Next is 27.Qh7 mate: the knight guards h7.', 'If 26…gxf6: The pawn has left g7, so 27.Qxh6 is mate.', 'Either way: You can’t take it and can’t leave it: it’s mate either way.', 'Better: 25…Qd8 guards f6 against 26.Nf6. It stays about level (−0.06).'])
  })
  it('26…gxf6: getting mated isn’t “starting a mate”', () => {
    expect(texts({ fenBefore: '6rk/pp4p1/1qp2NQp/2br4/8/1PP5/P5PP/R4R1K b - - 4 26', uci: 'g7f6', san: 'gxf6', cls: 'best', best: { pv: ['d5g5', 'g6h7'], score: { type: 'mate', value: 1 }}, reply: { pv: ['g6h6'], score: { type: 'mate', value: 1 }}, threat: { pv: ['g6h7'], score: { type: 'mate', value: 1 }}, ownThreat: { pv: ['g8g6', 'b3b4', 'c5f8', 'c3c4', 'd5g5', 'a2a3', 'g5g2', 'a1e1', 'b6d8', 'f1g1'], score: { type: 'cp', value: -1315 }}, second: { move: 'g8f8', score: { type: 'mate', value: 1 }}, previous: 'e4f6' } as ExplainInput)).toEqual(['The idea: Takes the knight, but nothing saves the king now: 27.Qxh6 is mate.'])
  })
  it('15…h6: the square the better move guards against the reply', () => {
    expect(texts({ fenBefore: 'r4bkr/pp4pp/2p5/2q1n3/Q7/2N5/PPP3PP/R1B2R1K b - - 3 15', uci: 'h7h6', san: 'h6', cls: 'inaccuracy', best: { pv: ['c5c4', 'a4c4', 'e5c4', 'b2b3', 'f8b4', 'c3a4', 'c4b6', 'c2c3', 'b4e7', 'a4b6'], score: { type: 'cp', value: 20 }}, reply: { pv: ['c1f4', 'e5c4', 'a4b3', 'c5b4', 'c3e4', 'b4b3', 'a2b3', 'c4b6', 'a1e1', 'a7a5'], score: { type: 'cp', value: 89 }}, threat: { pv: ['c1f4', 'e5c4', 'a4b3', 'c5b4', 'c3e4', 'b4b3', 'a2b3', 'c4b6', 'f4d6', 'a7a6'], score: { type: 'cp', value: 206 }}, ownThreat: { pv: ['c5b4', 'a4b3', 'g8h7', 'c1e3', 'f8d6', 'e3g1', 'h8e8', 'a1e1', 'b4b3', 'a2b3'], score: { type: 'cp', value: -1 }}, second: { move: 'c5b4', score: { type: 'cp', value: 33 }}, previous: 'g1h1' } as ExplainInput)).toEqual(['What it allows: After 16.Bf4, White is a little better (+0.89).', 'Better: 15…Qc4 guards f4 against 16.Bf4. It stays about level (+0.20).'])
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
