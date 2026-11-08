import { describe, expect, it } from 'vitest'
import type { MyGame } from './myGames'
import { perfsFor, perfStats, speedOf } from './profile'

function game(over: Partial<MyGame> & { endedAt: number }): MyGame {
  return {
    key: `k${over.endedAt}`,
    source: 'chesscom',
    pgn: '[TimeControl "600"]\n\n1. e4 e5 1-0',
    white: { name: 'me', rating: 1500 },
    black: { name: 'them', rating: 1500 },
    color: 'white',
    result: 'win',
    time: '10 min',
    moves: 1,
    ...over,
  }
}

const control = (tc: string, extra = '') => `[TimeControl "${tc}"]\n${extra}\n1. e4 e5 1-0`

describe('speedOf', () => {
  it("cuts Chess.com's speeds where Chess.com does", () => {
    expect(speedOf(game({ endedAt: 0, pgn: control('60') }))).toBe('bullet')
    expect(speedOf(game({ endedAt: 0, pgn: control('180+2') }))).toBe('blitz')
    expect(speedOf(game({ endedAt: 0, pgn: control('600') }))).toBe('rapid')
    expect(speedOf(game({ endedAt: 0, pgn: control('1/86400') }))).toBe('daily')
  })

  it("cuts Lichess's speeds where Lichess does", () => {
    const li = (tc: string) => speedOf(game({ endedAt: 0, source: 'lichess', pgn: control(tc) }))
    expect(li('15+0')).toBe('ultrabullet')
    expect(li('120+1')).toBe('bullet')
    expect(li('300+3')).toBe('blitz')
    expect(li('600+0')).toBe('rapid')
    expect(li('1800+20')).toBe('classical')
    expect(li('-')).toBe('daily')
  })

  it('gives games played here none', () => {
    expect(speedOf(game({ endedAt: 0, source: 'rookahead' }))).toBeNull()
  })
})

describe('perfsFor', () => {
  it("groups a site's games by speed, most played first, with your latest rating", () => {
    const games = [
      game({ endedAt: 4, white: { name: 'me', rating: 1520 } }),
      game({ endedAt: 3, pgn: control('180') }),
      game({ endedAt: 2, white: { name: 'me', rating: 1510 } }),
      game({ endedAt: 1, source: 'lichess', pgn: control('300+0') }),
    ]
    const perfs = perfsFor(games, 'chesscom')
    expect(perfs.map((p) => [p.id, p.games.length, p.rating])).toEqual([
      ['chesscom:rapid', 2, 1520],
      ['chesscom:blitz', 1, 1500],
    ])
    expect(perfs[0].points).toEqual([
      { at: 2, rating: 1510 },
      { at: 4, rating: 1520 },
    ])
  })

  it("adds Lichess's rating change to the rating it gives from before the game", () => {
    const g = game({ endedAt: 0, source: 'lichess', pgn: control('300+0', '[WhiteRatingDiff "+7"]') })
    expect(perfsFor([g], 'lichess')[0].rating).toBe(1507)
  })

  it('puts games against the computer in one group without a rating', () => {
    const perfs = perfsFor([game({ endedAt: 0, source: 'rookahead' })], 'rookahead')
    expect(perfs).toMatchObject([{ id: 'computer', rating: null, points: [] }])
  })
})

describe('perfStats', () => {
  it('counts results, streaks, the best win and the average opponent', () => {
    const vs = (endedAt: number, result: MyGame['result'], rating: number, color: MyGame['color'] = 'white') =>
      game({ endedAt, result, color, white: { name: color === 'white' ? 'me' : `p${endedAt}`, rating: color === 'white' ? 1500 : rating }, black: { name: color === 'black' ? 'me' : `p${endedAt}`, rating: color === 'black' ? 1500 : rating } })
    // Newest first, as the list keeps them.
    const games = [vs(6, 'loss', 1600), vs(5, 'win', 1700, 'black'), vs(4, 'win', 1550), vs(3, 'win', 1450), vs(2, 'draw', 1500), vs(1, 'loss', 1400)]
    const [perf] = perfsFor(games, 'chesscom')
    const stats = perfStats(perf)
    expect(stats.results.all).toEqual({ games: 6, won: 3, drawn: 1, lost: 2 })
    expect(stats.results.black).toEqual({ games: 1, won: 1, drawn: 0, lost: 0 })
    expect(stats.winStreak).toBe(3)
    expect(stats.lossStreak).toBe(1)
    expect(stats.bestWin).toEqual({ name: 'p5', rating: 1700, at: 5 })
    expect(stats.opponents).toEqual({ all: 1533, win: 1567, draw: 1500, loss: 1500 })
  })
})
