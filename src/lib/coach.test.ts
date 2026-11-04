import { describe, expect, it } from 'vitest'
import { coachLine } from './coach'
import type { ExplainInput } from './explain'

// Every line here is from one real game (MelonLord-009 – DarkBiishopOnFire, 2026), seen as White.
describe('the coach line', () => {
  it('6.Nxf3: joins a recapture to what else it does, with praise', () => {
    expect(coachLine({ fenBefore: 'rnbqkb1r/pp2pppp/2p2n2/8/2BP4/2N2p2/PPP3PP/R1BQK1NR w KQkq - 0 6', uci: 'g1f3', san: 'Nxf3', cls: 'best', best: { pv: ['g1f3', 'c8f5', 'f3e5', 'e7e6', 'g2g4', 'f6d7', 'g4f5', 'd8h4', 'e1f1', 'h4h3'], score: { type: 'cp', value: -51 }}, reply: { pv: ['c8f5', 'f3e5', 'e7e6', 'g2g4', 'f6d7', 'g4f5', 'd8h4', 'e1f1', 'd7e5', 'c4e2'], score: { type: 'cp', value: -63 }}, previous: 'e4f3' } as ExplainInput, 'white')).toBe('You take back the pawn and protect the g2 pawn, which was hanging. Very nice.')
  })
  it('8.Ne5+: praises your fork', () => {
    expect(coachLine({ fenBefore: 'rn1q1b1r/pp2pkpp/2p2n2/8/3P2b1/2N2N2/PPP3PP/R1BQK2R w KQ - 0 8', uci: 'f3e5', san: 'Ne5+', cls: 'great', best: { pv: ['f3e5', 'f7g8', 'e5g4', 'b8d7', 'd1e2', 'h7h6', 'c1f4', 'f6g4', 'e2g4', 'd7f6'], score: { type: 'cp', value: 148 }}, reply: { pv: ['f7g8', 'e5g4', 'b8d7', 'd1e2', 'h7h6', 'c1f4', 'f6g4', 'e2g4', 'd7f6', 'g4e6'], score: { type: 'cp', value: 182 }}, previous: 'e8f7' } as ExplainInput, 'white')).toBe('Clutch! You fork the king and the bishop on g4: after the king moves, 9.Nxg4 wins it.')
  })
  it('8…Kg8: tells the opponent’s move as theirs', () => {
    expect(coachLine({ fenBefore: 'rn1q1b1r/pp2pkpp/2p2n2/4N3/3P2b1/2N5/PPP3PP/R1BQK2R b KQ - 1 8', uci: 'f7g8', san: 'Kg8', cls: 'best', best: { pv: ['f7g8', 'e5g4', 'b8d7', 'd1e2', 'h7h6', 'c1f4', 'f6g4', 'e2g4', 'd7f6', 'g4e6'], score: { type: 'cp', value: 182 }}, reply: { pv: ['e5g4', 'b8d7', 'd1e2', 'h7h6', 'c1f4', 'f6g4', 'e2g4', 'd7f6', 'g4e6', 'g8h7'], score: { type: 'cp', value: 177 }}, previous: 'f3e5' } as ExplainInput, 'white')).toBe('Your opponent gets out of check, but 9.Nxg4 still wins the bishop on g4.')
  })
  it('11.dxe5: still winning after it, so not a missed winning shot: what was missed, and what the move did', () => {
    expect(coachLine({ fenBefore: 'r2q1bkr/pp1n2pp/2p2n2/4p3/3P2N1/2N5/PPP1Q1PP/R1B1K2R w KQ - 0 11', uci: 'd4e5', san: 'dxe5', cls: 'mistake', best: { pv: ['e2c4', 'f6d5', 'c3d5', 'f8d6', 'd5c7', 'g8f8', 'c7e6', 'f8e7', 'c1g5', 'd7f6'], score: { type: 'cp', value: 1261 }}, reply: { pv: ['h7h5', 'g4f6', 'g7f6', 'c1f4', 'd7e5', 'f4e5', 'f6e5', 'e1g1', 'h8h6', 'g1h1'], score: { type: 'cp', value: 344 }}, previous: 'e7e5' } as ExplainInput, 'white')).toBe('Careful! You missed 11.Qc4+, and 12.Nxd5 wins the knight on d5. dxe5 makes a passed pawn on e5, but it’s too slow.')
  })
  it('12.Qxg4: a missed mate', () => {
    expect(coachLine({ fenBefore: 'r2q1bkr/pp1n2pp/2p5/4P3/6n1/2N5/PPP1Q1PP/R1B1K2R w KQ - 0 12', uci: 'e2g4', san: 'Qxg4', cls: 'blunder', best: { pv: ['e2c4'], score: { type: 'mate', value: 1 }}, reply: { pv: ['d8e7', 'g4c4', 'e7f7', 'c4f7', 'g8f7', 'c1f4', 'f8e7', 'h1f1', 'h8d8', 'c3e2'], score: { type: 'cp', value: 128 }}, previous: 'f6g4' } as ExplainInput, 'white')).toBe('You had mate! 12.Qc4# is mate.')
  })
  it('16…Qb6: the opponent’s mistake, and their better move', () => {
    expect(coachLine({ fenBefore: 'r4bkr/pp4p1/2p4p/2q1n3/Q3N3/8/PPP3PP/R1B2R1K b - - 1 16', uci: 'c5b6', san: 'Qb6', cls: 'mistake', best: { pv: ['c5c4', 'a4c4', 'e5c4', 'c1f4', 'g8h7', 'b2b3', 'c4b6', 'a1e1', 'b6d5', 'f4d6'], score: { type: 'cp', value: 21 }}, reply: { pv: ['c1f4', 'e5g6', 'a4c4', 'g8h7', 'f4g5', 'b6b5', 'c4f7', 'h6g5', 'a2a4', 'b5b2'], score: { type: 'cp', value: 243 }}, previous: 'c3e4' } as ExplainInput, 'white')).toBe('Your opponent made a mistake. Qb6 stops guarding the knight on e5, and 17.Bf4 attacks it. 16…Qc4 was better.')
  })
  it('22.b3: a winning shot missed for a pawn', () => {
    expect(coachLine({ fenBefore: '3r1br1/pp4pk/1qp4p/8/4NQ2/8/PPP3PP/R4R1K w - - 1 22', uci: 'b2b3', san: 'b3', cls: 'blunder', best: { pv: ['f4f5', 'g7g6', 'e4f6', 'h7h8', 'f5h3', 'f8g7', 'f6g8', 'h8g8', 'a1b1', 'd8d2'], score: { type: 'cp', value: 416 }}, reply: { pv: ['f8e7', 'f4e5', 'g8e8', 'f1f7', 'b6d4', 'f7g7', 'h7h8', 'g7g5', 'd4e5', 'g5e5'], score: { type: 'cp', value: -8 }}, previous: 'h8g8' } as ExplainInput, 'white')).toBe('You had a winning shot! 22.Qf5+ forces …g6, and now nothing guards f6. b3 saves the attacked b2 pawn, but it’s too slow.')
  })
  it('23.Qf5+: a check that leads nowhere, and your better option', () => {
    expect(coachLine({ fenBefore: '5br1/pp4pk/1qp4p/8/3rNQ2/1P6/P1P3PP/R4R1K w - - 1 23', uci: 'f4f5', san: 'Qf5+', cls: 'blunder', best: { pv: ['c2c3', 'd4d5', 'c3c4', 'd5a5', 'c4c5', 'b6d8', 'a1d1', 'd8e8', 'f4c7', 'e8e4'], score: { type: 'cp', value: 474 }}, reply: { pv: ['h7h8', 'c2c3', 'd4d5', 'f5f7', 'd5e5', 'e4d2', 'e5e7', 'f7g6', 'b6e3', 'd2f3'], score: { type: 'cp', value: 11 }}, previous: 'd8d4' } as ExplainInput, 'white')).toBe('You had a winning shot! Qf5+ is a check that leads nowhere. Your better option was 23.c3, which kicks the rook on d4.')
  })
  it('23…Kh8: never says “your opponent” twice', () => {
    expect(coachLine({ fenBefore: '5br1/pp4pk/1qp4p/5Q2/3rN3/1P6/P1P3PP/R4R1K b - - 2 23', uci: 'h7h8', san: 'Kh8', cls: 'great', best: { pv: ['h7h8', 'c2c3', 'd4d5', 'f5f7', 'd5e5', 'e4d2', 'e5e7', 'f7g6', 'b6e3', 'd2f3'], score: { type: 'cp', value: 11 }}, reply: { pv: ['c2c3', 'd4d5', 'f5f7', 'd5e5', 'e4d2', 'e5e7', 'f7g6', 'b6e3', 'd2f3', 'e7e6'], score: { type: 'cp', value: 13 }}, previous: 'f4f5' } as ExplainInput, 'white')).toBe('Your opponent found the only move. They get out of check.')
  })
  it('26.Nf6: a mating sacrifice', () => {
    expect(coachLine({ fenBefore: '6rk/pp4p1/1qp3Qp/2br4/4N3/1PP5/P5PP/R4R1K w - - 3 26', uci: 'e4f6', san: 'Nf6', cls: 'brilliant', best: { pv: ['e4f6', 'd5d1', 'g6h7'], score: { type: 'mate', value: 2 }}, reply: { pv: ['d5g5', 'g6h7'], score: { type: 'mate', value: 1 }}, previous: 'f8c5' } as ExplainInput, 'white')).toBe('Brilliant! You give up the knight. Black can’t take it and can’t leave it: it’s mate either way.')
  })
  it('27.Qxh6#: the finish', () => {
    expect(coachLine({ fenBefore: '6rk/pp6/1qp2pQp/2br4/8/1PP5/P5PP/R4R1K w - - 0 27', uci: 'g6h6', san: 'Qxh6#', cls: 'best', best: { pv: ['g6h6'], score: { type: 'mate', value: 1 }}, reply: { pv: [], score: { type: 'mate', value: 0 }}, previous: 'g7f6' } as ExplainInput, 'white')).toBe('Checkmate! Well played.')
  })
})

// More games: the same player's on Chess.com (November 2026), and a strong player's on Lichess, each seen from one side.
describe('the coach line, across games', () => {
  it('19.Qxd8: a trade, then the piece it wins', () => {
    expect(coachLine({ fenBefore: 'r2q1rk1/p5pp/2p5/n3b3/4b3/8/PPP2PPP/R1BQRBK1 w - - 0 19', uci: 'd1d8', san: 'Qxd8', cls: 'great', best: { pv: ['d1d8', 'a8d8', 'e1e4', 'f8e8', 'f1d3', 'c6c5', 'c1g5', 'd8d4', 'e4e1', 'd4b4'], score: { type: 'cp', value: 455 }}, reply: { pv: ['a8d8', 'e1e4', 'f8e8', 'f1d3', 'c6c5', 'c1g5', 'd8d4', 'a1e1', 'd4e4', 'd3e4'], score: { type: 'cp', value: 481 }}, previous: 'd5e4' } as ExplainInput, 'white')).toBe('Clutch! You trade queens, then 20.Rxe4 wins the bishop on e4.')
  })
  it('2.Nf3: what the opponent missed, said as theirs', () => {
    expect(coachLine({ fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2', uci: 'g1f3', san: 'Nf3', cls: 'mistake', best: { pv: ['d4e5', 'b8c6', 'g1f3', 'd7d5', 'c1f4', 'g8e7', 'h2h3', 'e7g6', 'e2e3', 'f8c5'], score: { type: 'cp', value: 121 }}, reply: { pv: ['e5e4', 'f3d2', 'g8f6', 'c2c4', 'c7c6', 'b1c3', 'd7d5', 'c4d5', 'c6d5', 'd2b3'], score: { type: 'cp', value: -26 }}} as ExplainInput, 'black')).toBe('Your opponent made a mistake. They missed 2.dxe5, which wins the e5 pawn. Nf3 attacks the e5 pawn, which has no defender, but it’s too slow.')
  })
  it('22.Ngf3: their king and rook, not “your”', () => {
    expect(coachLine({ fenBefore: 'r3rbk1/1pp2ppp/p7/7b/5Q1P/PPBq4/3N2P1/R1K3NR w - - 1 22', uci: 'g1f3', san: 'Ngf3', cls: 'blunder', best: { pv: ['h1h3', 'd3d7', 'c1b2', 'b7b5', 'h3e3', 'e8e3', 'f4e3', 'c7c5', 'g1f3', 'a8e8'], score: { type: 'cp', value: -9 }}, reply: { pv: ['d3c3', 'c1d1', 'c3a1', 'd1c2', 'h5g6', 'd2e4', 'a1h1', 'f3e5', 'h1g2', 'c2c3'], score: { type: 'cp', value: -2335 }}} as ExplainInput, 'black')).toBe('Your opponent blundered! Now 22…Qxc3+ forks their king and rook, and wins the rook on a1 and the bishop on c3. 22.Rh3 was better: it attacks the queen on d3, which has no defender.')
  })
  it('49.g4: still winning after it: no “winning shot”', () => {
    expect(coachLine({ fenBefore: '8/p2n4/3k2pp/PPpB4/2P1KP2/8/6PP/8 w - - 0 49', uci: 'g2g4', san: 'g4', cls: 'inaccuracy', best: { pv: ['e4f3', 'd7f6', 'd5f7', 'g6g5', 'f7g6', 'd6c7', 'h2h3', 'c7d6'], score: { type: 'cp', value: 483 }}, reply: { pv: ['d7f6', 'e4f3', 'f6d5', 'c4d5', 'd6d5', 'f3e3', 'c5c4', 'f4f5', 'g6f5', 'g4f5'], score: { type: 'cp', value: 372 }}} as ExplainInput, 'white')).toBe('Not quite. Your better option was 49.Kf3, which steps the king out of the firing line.')
  })
  it('18.Ng5: no praise in a lost position, and no score', () => {
    expect(coachLine({ fenBefore: 'r2q1rk1/bpp3pp/p1n5/4pp2/2P1N3/PB1n1P2/2Q2P1P/R4RK1 w - - 0 18', uci: 'e4g5', san: 'Ng5', cls: 'excellent', best: { pv: ['e4g3', 'd3c5', 'a1d1', 'd8e7', 'g3f5', 'e7f6', 'f5g3', 'g8h8', 'g3e4', 'f6e7'], score: { type: 'cp', value: -901 }}, reply: { pv: ['d8g5', 'g1h1', 'd3c5', 'f1g1', 'g5h4', 'b3a2', 'c6d4', 'c2c3', 'h4e7', 'a1d1'], score: { type: 'cp', value: -1175 }}} as ExplainInput, 'white')).toBe('You give up the knight: the queen on d8 can take it.')
  })
  it('18.Nd2: a mate threat stopped, found without a search', () => {
    expect(coachLine({ fenBefore: 'r2q1bk1/1pp2ppp/p7/8/2p1rpb1/PP6/1B3QPP/RNK3NR w - - 0 18', uci: 'b1d2', san: 'Nd2', cls: 'excellent', best: { pv: ['g1f3', 'c4b3', 'b1d2', 'e4e8', 'd2b3', 'd8d5', 'b3d4', 'c7c5', 'd4c2', 'a8d8'], score: { type: 'cp', value: -610 }}, reply: { pv: ['c4b3', 'g1f3', 'e4e3', 'd2c4', 'e3e7', 'c4e5', 'g4f5', 'g2g4'], score: { type: 'cp', value: -611 }}, previous: 'd5c4' } as ExplainInput, 'black')).toBe('Your opponent stops 18…Qd1 mate.')
  })
  it('6…Qh4+: a mate it starts', () => {
    expect(coachLine({ fenBefore: 'rnbqk1nr/pp3ppp/2pb4/3p4/3PP3/2N5/PPPNP1PP/R1BQKB1R b KQkq - 0 6', uci: 'd8h4', san: 'Qh4+', cls: 'great', best: { pv: ['d8h4', 'g2g3', 'd6g3', 'h2g3', 'h4g3'], score: { type: 'mate', value: -3 }}, reply: { pv: ['g2g3', 'd6g3', 'h2g3', 'h4g3'], score: { type: 'mate', value: -2 }}, previous: 'f3e4' } as ExplainInput, 'black')).toBe('The only move, and you found it. You start a mate in 3: it ends with 8…Qxg3#.')
  })
  it('24.Rc2: a winning shot missed, and what the move did', () => {
    expect(coachLine({ fenBefore: '2r2rk1/3pb3/p3pnpp/1p6/8/1P6/PR1Q1PPP/4R1K1 w - - 5 24', uci: 'b2c2', san: 'Rc2', cls: 'blunder', best: { pv: ['d2h6', 'g8f7', 'a2a4', 'e7b4', 'e1f1', 'f8h8', 'h6f4', 'f7g7', 'h2h3'], score: { type: 'cp', value: 456 }}, reply: { pv: ['e7b4', 'd2b4', 'c8c2', 'a2a4', 'b5a4', 'b3a4', 'g8f7', 'h2h4', 'f8c8', 'b4f4'], score: { type: 'cp', value: 80 }}} as ExplainInput, 'white')).toBe('You had a winning shot! 24.Qxh6 wins the h6 pawn. Rc2 takes the open c-file, aiming at the rook on c8, but it’s too slow.')
  })
  it('12…fxg6: a better move that only takes back isn’t a win', () => {
    expect(coachLine({ fenBefore: 'r1b2rk1/pppp1ppp/2n3B1/q3P3/1b6/1RN1PN2/P1PB1PPP/3Q1RK1 b - - 0 12', uci: 'f7g6', san: 'fxg6', cls: 'inaccuracy', best: { pv: ['h7g6', 'a2a3', 'b4c3', 'd2c3', 'a5c5', 'c3a1', 'c5e7', 'h2h4', 'd7d6', 'e5d6'], score: { type: 'cp', value: 47 }}, reply: { pv: ['a2a3', 'b4c3', 'd2c3', 'a5c5', 'c3b4', 'c6b4', 'a3b4', 'c5e7', 'd1d5', 'f8f7'], score: { type: 'cp', value: 140 }}, previous: 'd3g6' } as ExplainInput, 'black')).toBe('A small slip. Your better option was 12…hxg6, which takes back with the h-pawn.')
  })
  it('21…Rxf3: an exchange sacrifice says what it takes', () => {
    expect(coachLine({ fenBefore: '1rb2rk1/2p1q1bp/np1p2p1/1B1Pp2n/1PP1N3/3QBN1P/5PP1/1R2R1K1 b - - 0 21', uci: 'f8f3', san: 'Rxf3', cls: 'excellent', best: { pv: ['h7h6', 'c4c5', 'f8f3', 'g2f3', 'e7h4', 'c5d6', 'c7d6', 'b5a6', 'c8h3', 'b1b3'], score: { type: 'cp', value: 256 }}, reply: { pv: ['g2f3', 'e7h4', 'd3f1', 'h7h6', 'f1g2', 'c8h3', 'g2h2', 'b8f8', 'b5a6', 'f8f3'], score: { type: 'cp', value: 252 }}, previous: 'c3e4' } as ExplainInput, 'black')).toBe('You give up the rook for the knight on f3: the g2 pawn can take it. Good move.')
  })
})
