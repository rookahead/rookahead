import { describe, expect, it } from 'vitest'
import type { MoveClass } from './classify'
import { gameDays, howItEnded, moveQuality } from './homeGames'
import type { MyGame } from './myGames'
import type { SharedGame } from './share'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const NOW = new Date(2026, 9, 24, 21, 0)
const at = (daysAgo: number, hour: number) => new Date(2026, 9, 24 - daysAgo, hour).getTime()

function game(over: Partial<MyGame> & { endedAt: number }): MyGame {
  return {
    key: `k${over.endedAt}`,
    source: 'chesscom',
    pgn: '1. e4 e5 1-0',
    white: { name: 'me', rating: 1500 },
    black: { name: 'them', rating: 1500 },
    color: 'white',
    result: 'win',
    time: '3 min',
    moves: 1,
    ...over,
  }
}

describe('howItEnded', () => {
  it("reads Chess.com's and our own Termination", () => {
    expect(howItEnded(game({ endedAt: 0, pgn: '[Termination "Hikaru won by resignation"]\n\n1. e4 1-0' }))).toBe('by resignation')
    expect(howItEnded(game({ endedAt: 0, pgn: '[Termination "Hikaru won on time"]\n\n1. e4 1-0' }))).toBe('on time')
    expect(howItEnded(game({ endedAt: 0, pgn: '[Termination "Game drawn by repetition"]\n\n1. e4 1/2-1/2' }))).toBe('by repetition')
    expect(howItEnded(game({ endedAt: 0, pgn: '[Termination "Hikaru won - game abandoned"]\n\n1. e4 1-0' }))).toBe('by abandonment')
  })

  it("tells mate from resignation in Lichess's Normal", () => {
    const mate = '[Termination "Normal"]\n\n1. f3 e5 2. g4 Qh4# 0-1'
    expect(howItEnded(game({ endedAt: 0, source: 'lichess', key: 'mate', pgn: mate, result: 'loss' }))).toBe('by checkmate')
    const resigned = '[Termination "Normal"]\n\n1. e4 e5 0-1'
    expect(howItEnded(game({ endedAt: 0, source: 'lichess', key: 'resigned', pgn: resigned, result: 'loss' }))).toBe('by resignation')
    expect(howItEnded(game({ endedAt: 0, source: 'lichess', key: 'flag', pgn: '[Termination "Time forfeit"]\n\n1. e4 1-0' }))).toBe('on time')
  })

  it('says nothing without a Termination', () => {
    expect(howItEnded(game({ endedAt: 0 }))).toBeNull()
  })
})

describe('gameDays', () => {
  it('groups by day and counts results', () => {
    const games = [game({ endedAt: at(0, 20) }), game({ endedAt: at(0, 19), result: 'loss' }), game({ endedAt: at(1, 18), result: 'draw' })]
    const days = gameDays(games, games, NOW)
    expect(days.map((d) => [d.label, d.won, d.lost, d.drawn])).toEqual([
      ['Today', 1, 1, 0],
      ['Yesterday', 0, 0, 1],
    ])
  })

  it("counts the whole day's results when only some of its games are shown", () => {
    const all = [game({ endedAt: at(0, 20) }), game({ endedAt: at(0, 19), result: 'loss' }), game({ endedAt: at(0, 18) })]
    const [today] = gameDays(all.slice(0, 1), all, NOW)
    expect([today.games.length, today.won, today.lost]).toEqual([1, 2, 1])
  })

  it("takes a Chess.com day's start from the game before it (its ratings are after each game)", () => {
    const games = [
      game({ endedAt: at(0, 20), white: { name: 'me', rating: 1530 } }),
      game({ endedAt: at(0, 19), white: { name: 'me', rating: 1520 } }),
      game({ endedAt: at(1, 18), white: { name: 'me', rating: 1510 } }),
    ]
    const [today, yesterday] = gameDays(games, games, NOW)
    expect(today.rating).toEqual({ time: '3 min', from: 1510, to: 1530 })
    // Nothing before yesterday's game: its start isn't known.
    expect(yesterday.rating).toBeNull()
  })

  it("takes a Lichess day's end from the last game's rating change", () => {
    const pgn = (diff: string) => `[WhiteRatingDiff "${diff}"]\n\n1. e4 1-0`
    const games = [
      game({ endedAt: at(0, 20), source: 'lichess', white: { name: 'me', rating: 1506 }, pgn: pgn('+6') }),
      game({ endedAt: at(0, 19), source: 'lichess', white: { name: 'me', rating: 1500 }, pgn: pgn('+6') }),
    ]
    expect(gameDays(games, games, NOW)[0].rating).toEqual({ time: '3 min', from: 1500, to: 1512 })
  })

  it('leaves the rating out when a day mixes time controls', () => {
    const games = [game({ endedAt: at(0, 20) }), game({ endedAt: at(0, 19), time: '10 min' }), game({ endedAt: at(1, 9) })]
    expect(gameDays(games, games, NOW)[0].rating).toBeNull()
  })
})

describe('moveQuality', () => {
  const shared = (classes: MoveClass[], startFen = START): SharedGame => ({
    startFen,
    moves: classes.map(() => 'e2e4'),
    headers: {},
    orientation: 'white',
    review: { depth: 16, scores: [], bestMoves: [], classes },
  })

  it("keeps only your moves and names the first blunder's move", () => {
    const q = moveQuality(shared(['book', 'book', 'best', 'blunder', 'blunder', 'good', 'inaccuracy', 'best']), 'white')
    expect(q?.moves).toEqual(['book', 'good', 'blunder', 'slip'])
    expect(q?.note).toBe('1 blunder, move 3')
    expect(moveQuality(shared(['book', 'book', 'best', 'blunder']), 'black')?.note).toBe('1 blunder, move 2')
  })

  it('counts from a position where Black moves first', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    expect(moveQuality(shared(['blunder', 'best'], fen), 'black')?.note).toBe('1 blunder, move 1')
    expect(moveQuality(shared(['best', 'blunder'], fen), 'white')?.note).toBe('1 blunder, move 2')
  })

  it('says Legendary, else mistakes, else none', () => {
    expect(moveQuality(shared(['brilliant', 'best']), 'white')?.note).toBe('1 Legendary')
    expect(moveQuality(shared(['mistake', 'best', 'miss', 'best']), 'white')?.note).toBe('2 mistakes')
    expect(moveQuality(shared(['best', 'mistake']), 'white')?.note).toBe('No mistakes')
  })
})
