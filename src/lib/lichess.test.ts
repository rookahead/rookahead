import { describe, expect, it } from 'vitest'
import { isLichessUrl, lichessGameUrl, outcomeFor, parseGame, type ApiGame } from './lichess'

const api = (over: Partial<ApiGame> = {}): ApiGame => ({
  id: 'PndlSDZg',
  rated: true,
  variant: 'standard',
  status: 'resign',
  lastMoveAt: 1791814483311,
  players: {
    white: { user: { name: 'thibault', id: 'thibault' }, rating: 1749 },
    black: { user: { name: 'Pehachzed', id: 'pehachzed' }, rating: 1800 },
  },
  winner: 'black',
  opening: { eco: 'B44', name: 'Sicilian Defense: Taimanov Variation' },
  clock: { initial: 300, increment: 3 },
  pgn: '[Site "https://lichess.org/PndlSDZg"]\n\n1. e4 c5 0-1',
  ...over,
})

describe('parseGame', () => {
  it('reads a game from the export', () => {
    expect(parseGame(api())).toEqual({
      url: 'https://lichess.org/PndlSDZg',
      pgn: '[Site "https://lichess.org/PndlSDZg"]\n\n1. e4 c5 0-1',
      timeControl: '300+3',
      endTime: 1791814483,
      rated: true,
      white: { username: 'thibault', rating: 1749 },
      black: { username: 'Pehachzed', rating: 1800 },
      winner: 'black',
      opening: 'Sicilian Defense: Taimanov Variation',
    })
  })

  it('writes correspondence time controls the way Chess.com does', () => {
    expect(parseGame(api({ clock: undefined, daysPerTurn: 3 }))?.timeControl).toBe('1/259200')
    expect(parseGame(api({ clock: undefined }))?.timeControl).toBe('-')
  })

  it('names Lichess AI opponents', () => {
    const game = parseGame(api({ players: { white: { user: { name: 'thibault', id: 'thibault' }, rating: 1858 }, black: { aiLevel: 3 } } }))
    expect(game?.black).toEqual({ username: 'Lichess AI level 3' })
  })

  it('skips variants and games that never started', () => {
    expect(parseGame(api({ variant: 'chess960' }))).toBeNull()
    expect(parseGame(api({ status: 'aborted' }))).toBeNull()
    expect(parseGame(api({ status: 'noStart' }))).toBeNull()
    expect(parseGame(api({ pgn: undefined }))).toBeNull()
  })
})

describe('outcomeFor', () => {
  const game = parseGame(api())!
  it('reads the result from either side, ignoring case', () => {
    expect(outcomeFor(game, 'Thibault')).toBe('loss')
    expect(outcomeFor(game, 'pehachzed')).toBe('win')
    expect(outcomeFor({ ...game, winner: undefined }, 'thibault')).toBe('draw')
  })
})

describe('lichessGameUrl', () => {
  it('writes a game link one way, as the games list does', () => {
    expect(lichessGameUrl('https://lichess.org/game/PndlSDZg')).toBe('https://lichess.org/PndlSDZg')
    expect(lichessGameUrl('https://lichess.org/PndlSDZg')).toBe('https://lichess.org/PndlSDZg')
    expect(lichessGameUrl('https://lichess.org/PndlSDZg/black')).toBe('https://lichess.org/PndlSDZg')
    expect(lichessGameUrl('https://lichess.org/PndlSDZgAbCd')).toBe('https://lichess.org/PndlSDZg')
  })

  it('leaves links that are not games as they are', () => {
    expect(lichessGameUrl('https://lichess.org/training/abc12')).toBe('https://lichess.org/training/abc12')
    expect(lichessGameUrl('not a url')).toBe('not a url')
  })
})

describe('isLichessUrl', () => {
  it('accepts Lichess game links', () => {
    expect(isLichessUrl('https://lichess.org/PndlSDZg')).toBe(true)
  })

  it('rejects look-alike hosts (share links can carry any URL)', () => {
    expect(isLichessUrl('https://evil.example/lichess.org')).toBe(false)
    expect(isLichessUrl('https://lichess.org.evil.example/x')).toBe(false)
    expect(isLichessUrl('not a url')).toBe(false)
  })
})
