import { describe, expect, it } from 'vitest'
import { explainMove, lineText, nullMoveFen, type ExplainInput } from './explain'

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
    expect(explainMove(RAB8)?.line).toEqual({ from: 'after', uci: ['e4e5', 'd8d7', 'e5d6'], text: '21.e5 Rd7 22.exd6' })
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
      'The chance: 24.Be5+ wins the d4 pawn. You’d be winning (+6.50).',
      'Ne4: Lets the win slip. After 24…dxe4, it’s about level (+0.03).',
    ])
    expect(e.line?.from).toBe('before')
  })

  it('gives up when the move doesn’t fit the position', () => {
    expect(explainMove({ ...RAB8, uci: 'e1e8' })).toBeNull()
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
