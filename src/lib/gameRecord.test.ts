import { describe, expect, it } from 'vitest'
import { byOpening, byTimeControl, openingFamily, ratingLine, results } from './gameRecord'
import type { MyGame } from './myGames'

const NOW = new Date(2026, 9, 24, 21, 0).getTime()
const DAY = 86400000

function game(over: Partial<MyGame> & { endedAt: number }): MyGame {
  return {
    key: `k${over.endedAt}`,
    source: 'chesscom',
    pgn: '1. e4 e5 1-0',
    white: { name: 'me', rating: 1500 },
    black: { name: 'them', rating: 1500 },
    color: 'white',
    result: 'win',
    time: '10 min',
    moves: 1,
    ...over,
  }
}

const rated = (daysAgo: number, rating: number, over: Partial<MyGame> = {}) => game({ endedAt: NOW - daysAgo * DAY, white: { name: 'me', rating }, ...over })

describe('openingFamily', () => {
  it('cuts names from both sites to the family', () => {
    expect(openingFamily('Sicilian Defense: Najdorf Variation')).toBe('Sicilian Defense')
    expect(openingFamily('French Defense Queens Knight Variation')).toBe('French Defense')
    expect(openingFamily('Bishops Opening Berlin Defense')).toBe('Bishops Opening')
    expect(openingFamily('Four Knights Game Scotch Variation Accepted')).toBe('Four Knights Game')
    expect(openingFamily('Englund Gambit')).toBe('Englund Gambit')
  })

  it('keeps a name with no family word whole', () => {
    expect(openingFamily('Van t Kruijs Opening')).toBe('Van t Kruijs Opening')
    expect(openingFamily('Ruy Lopez')).toBe('Ruy Lopez')
  })
})

describe('results', () => {
  it('counts wins, draws and losses', () => {
    const games = [game({ endedAt: 3 }), game({ endedAt: 2, result: 'loss' }), game({ endedAt: 1, result: 'draw' }), game({ endedAt: 0 })]
    expect(results(games)).toEqual({ won: 2, drawn: 1, lost: 1 })
  })
})

describe('ratingLine', () => {
  it("follows your latest game's time control, oldest first", () => {
    const games = [rated(1, 1530), rated(2, 1700, { time: '3 min' }), rated(3, 1510), rated(40, 1490)]
    const line = ratingLine(games, NOW)!
    expect(line.label).toBe('10 min')
    expect(line.points).toEqual([1490, 1510, 1530])
    expect([line.change, line.over]).toEqual([40, 'month'])
  })

  it('takes where a month ago stood from the rating before the first game since, for want of an older one', () => {
    // Lichess's ratings are from before each game.
    const lichess = { source: 'lichess' as const, pgn: '[WhiteRatingDiff "+8"]\n\n1. e4 1-0' }
    const line = ratingLine([rated(1, 1530, lichess), rated(3, 1510, lichess)], NOW)!
    expect([line.change, line.over]).toEqual([28, 'month'])
  })

  it("falls back to the change across its points when a month ago isn't known", () => {
    // Chess.com's are after each game, so the first game's own start isn't known.
    const line = ratingLine([rated(1, 1530), rated(3, 1510)], NOW)!
    expect([line.change, line.over]).toEqual([20, 'points'])
  })

  it('is null without a rated game', () => {
    expect(ratingLine([game({ endedAt: 0, source: 'rookahead' })], NOW)).toBeNull()
  })
})

describe('byTimeControl', () => {
  it('groups by site and time control, most played first, with your latest rating', () => {
    const games = [rated(1, 1530, { time: '3 min' }), rated(2, 1520), rated(3, 1510, { result: 'loss' }), rated(4, 1600, { source: 'lichess' })]
    expect(byTimeControl(games).map((g) => [g.label, g.site, g.games, g.won, g.lost, g.rating])).toEqual([
      ['10 min', 'Chess.com', 2, 1, 1, 1520],
      ['3 min', 'Chess.com', 1, 1, 0, 1530],
      ['10 min', 'Lichess', 1, 1, 0, null],
    ])
    // One site: no need to name it.
    expect(byTimeControl(games.slice(0, 3))[0].site).toBeUndefined()
  })
})

describe('byOpening', () => {
  it('groups by family and side, ties to the most recent', () => {
    const games = [
      game({ endedAt: 5, opening: 'French Defense Normal Variation', color: 'black' }),
      game({ endedAt: 4, opening: 'Italian Game' }),
      game({ endedAt: 3, opening: 'French Defense Queens Knight Variation', color: 'black', result: 'loss' }),
      game({ endedAt: 2, opening: 'Italian Game Knight Attack' }),
      game({ endedAt: 1, opening: 'French Defense', color: 'white' }),
      game({ endedAt: 0 }),
    ]
    expect(byOpening(games).map((g) => [g.label, g.color, g.games, g.won, g.lost])).toEqual([
      ['French Defense', 'black', 2, 1, 1],
      ['Italian Game', 'white', 2, 2, 0],
      ['French Defense', 'white', 1, 1, 0],
    ])
  })
})
