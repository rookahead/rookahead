import { describe, expect, it } from 'vitest'
import { endMarks } from './gameEnd'

// Kings on e1 (white) and e8 (black), nothing else happening.
const QUIET = '4k3/pppp4/8/8/8/8/PPPP4/4K3 w - - 0 30'
const BACK_RANK_MATE = '4R1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1'
const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 60'

describe('endMarks', () => {
  it('marks a checkmate from the position alone', () => {
    expect(endMarks(BACK_RANK_MATE)).toEqual([
      { square: 'g8', kind: 'mate', label: 'Checkmate' },
      { square: 'g1', kind: 'winner', label: 'Winner' },
    ])
  })

  it('marks a stalemate from the position alone: the stuck king, and a draw for the other', () => {
    expect(endMarks(STALEMATE)).toEqual([
      { square: 'h8', kind: 'draw', label: 'Stalemate' },
      { square: 'g6', kind: 'draw', label: 'Draw' },
    ])
  })

  it('marks nothing in an ordinary position with no result', () => {
    expect(endMarks(QUIET)).toEqual([])
    expect(endMarks(QUIET, { result: '*' })).toEqual([])
  })

  it('reads a resignation from a Chess.com termination', () => {
    expect(endMarks(QUIET, { result: '1-0', termination: 'Hikaru won by resignation' })).toEqual([
      { square: 'e8', kind: 'resign', label: 'Resigned' },
      { square: 'e1', kind: 'winner', label: 'Winner' },
    ])
  })

  it('reads a loss on time from Chess.com, Lichess and our own games', () => {
    for (const termination of ['MagnusCarlsen won on time', 'Time forfeit', 'Black won by timeout']) {
      expect(endMarks(QUIET, { result: '0-1', termination })).toEqual([
        { square: 'e1', kind: 'timeout', label: 'Time out' },
        { square: 'e8', kind: 'winner', label: 'Winner' },
      ])
    }
  })

  it('takes a decisive Lichess "Normal" ending without mate on the board as a resignation', () => {
    expect(endMarks(QUIET, { result: '1-0', termination: 'Normal' })[0]).toEqual({ square: 'e8', kind: 'resign', label: 'Resigned' })
  })

  it('marks an abandoned game on the side that left', () => {
    expect(endMarks(QUIET, { result: '1-0', termination: 'Someone won - game abandoned' })[0]).toEqual({ square: 'e8', kind: 'resign', label: 'Abandoned' })
  })

  it('marks only the winner when it is unclear how the game was lost', () => {
    expect(endMarks(QUIET, { result: '0-1' })).toEqual([{ square: 'e8', kind: 'winner', label: 'Winner' }])
  })

  it('marks both kings for a draw that is not a stalemate', () => {
    expect(endMarks(QUIET, { result: '1/2-1/2', termination: 'Game drawn by repetition' })).toEqual([
      { square: 'e1', kind: 'draw', label: 'Draw' },
      { square: 'e8', kind: 'draw', label: 'Draw' },
    ])
  })

  it('believes the board over a result that disagrees with it', () => {
    expect(endMarks(BACK_RANK_MATE, { result: '1/2-1/2' })[0]).toEqual({ square: 'g8', kind: 'mate', label: 'Checkmate' })
  })
})
