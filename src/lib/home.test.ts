import { describe, expect, it } from 'vitest'
import { currentGame, formatDay, movesInPgn, playedRow } from './home'
import type { Session } from './session'

describe('movesInPgn', () => {
  it('counts full moves, ignoring headers, clocks and black move numbers', () => {
    const pgn = '[Event "Live"]\n[White "A"]\n\n1. e4 {[%clk 0:09:58.5]} 1... e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:50]} 2... Nc6 3. Bb5 1-0'
    expect(movesInPgn(pgn)).toBe(3)
  })

  it('counts a game ending on Black’s move', () => {
    expect(movesInPgn('1. e4 e5 2. Nf3 Nc6 0-1')).toBe(2)
    expect(movesInPgn('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 exd5 9. Bd3 Bb7 10. O-O c5 11. Rc1 c4 12. Bb1 a6 13. Ne5 b5 14. f4 Nfd7 15. Bxe7 Qxe7 16. Qf3 Nxe5 17. fxe5 *')).toBe(17)
  })

  it('is 0 without moves', () => {
    expect(movesInPgn('[Event "x"]\n\n*')).toBe(0)
  })
})

describe('formatDay', () => {
  const now = new Date('2026-10-18T12:00:00Z')
  it('leaves the year out for this year', () => {
    expect(formatDay(Date.parse('2026-10-17T10:00:00Z') / 1000, now)).toBe('Oct 17')
    expect(formatDay(Date.parse('2025-03-02T10:00:00Z') / 1000, now)).toBe('Mar 2, 2025')
  })
})

describe('currentGame', () => {
  const session = (pgn: string, reviewed = false): Session => ({
    pgn,
    orientation: 'white',
    currentPly: 0,
    evals: reviewed ? { x: { score: { type: 'cp', value: 0 }, bestMove: null, pv: [], depth: 16 } } : {},
  })

  it('describes the game open on the board', () => {
    expect(currentGame(session('[White "Ann"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3 *'))).toEqual({ title: 'Ann vs Bob', moves: 2, reviewed: false })
    expect(currentGame(session('1. d4 d5 *', true))).toEqual({ title: 'Your analysis board', moves: 1, reviewed: true })
  })

  it('is null without a game in progress', () => {
    expect(currentGame(null)).toBeNull()
    expect(currentGame(session('[White "Ann"]\n\n*'))).toBeNull()
  })
})

describe('playedRow', () => {
  const base = { id: 'g', pgn: '1. e4 e5 2. Nf3 *', result: 'win' as const, reason: 'checkmate' as const, color: 'white' as const, level: 4, clock: '600+5' as const, takebacks: 0, hints: 0, endedAt: Date.parse('2026-10-18T10:00:00Z') }
  const now = new Date('2026-10-18T12:00:00Z')

  it('describes the opponent, your side, clock, moves and date', () => {
    expect(playedRow(base, now)).toEqual({ opponent: 'Rookahead · Level 4', rating: '1300', detail: 'White · 10+5 · 2 moves · Oct 18', assists: '', result: 'Won' })
  })

  it('mentions takebacks and hints, and untimed games', () => {
    const row = playedRow({ ...base, clock: 'none', takebacks: 2, hints: 1, result: 'draw', color: 'black' }, now)
    expect(row.detail).toBe('Black · Untimed · 2 moves · Oct 18')
    expect(row.assists).toBe('2 takebacks · 1 hint')
    expect(row.result).toBe('Draw')
  })
})
