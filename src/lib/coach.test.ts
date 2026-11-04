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
  it('11.dxe5: a missed winning shot, and what the move did instead', () => {
    expect(coachLine({ fenBefore: 'r2q1bkr/pp1n2pp/2p2n2/4p3/3P2N1/2N5/PPP1Q1PP/R1B1K2R w KQ - 0 11', uci: 'd4e5', san: 'dxe5', cls: 'mistake', best: { pv: ['e2c4', 'f6d5', 'c3d5', 'f8d6', 'd5c7', 'g8f8', 'c7e6', 'f8e7', 'c1g5', 'd7f6'], score: { type: 'cp', value: 1261 }}, reply: { pv: ['h7h5', 'g4f6', 'g7f6', 'c1f4', 'd7e5', 'f4e5', 'f6e5', 'e1g1', 'h8h6', 'g1h1'], score: { type: 'cp', value: 344 }}, previous: 'e7e5' } as ExplainInput, 'white')).toBe('You had a winning shot! 11.Qc4+, then 12.Nxd5 wins the knight on d5. dxe5 makes a passed pawn on e5, but it’s too slow.')
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
