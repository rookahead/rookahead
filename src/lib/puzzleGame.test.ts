import { describe, expect, it } from 'vitest'
import { parsePuzzleGame } from './puzzleGame'

const ANSWER = {
  game: {
    clock: '15+15',
    perf: { key: 'classical', name: 'Classical' },
    players: [
      { name: 'Ilyas-Cabbarov', rating: 1772, color: 'black' },
      { name: 'Gengti', rating: 1785, color: 'white', title: 'NM' },
    ],
  },
  puzzle: { id: 'lDJqb', plays: 24173, rating: 1646 },
}

describe('puzzle game', () => {
  it('reads the clock, speed, players (White first) and plays', () => {
    expect(parsePuzzleGame(ANSWER)).toEqual({
      clock: '15+15',
      speed: 'classical',
      perf: 'Classical',
      plays: 24173,
      players: [
        { name: 'Gengti', rating: 1785, color: 'white', title: 'NM' },
        { name: 'Ilyas-Cabbarov', rating: 1772, color: 'black', title: undefined },
      ],
    })
  })

  it('draws ultra bullet as bullet and correspondence as daily', () => {
    expect(parsePuzzleGame({ ...ANSWER, game: { ...ANSWER.game, perf: { key: 'ultraBullet', name: 'UltraBullet' } } })?.speed).toBe('bullet')
    expect(parsePuzzleGame({ ...ANSWER, game: { ...ANSWER.game, perf: { key: 'correspondence', name: 'Correspondence' } } })?.speed).toBe('daily')
  })

  it('gives up on anything else', () => {
    expect(parsePuzzleGame(null)).toBeNull()
    expect(parsePuzzleGame({ game: { clock: '3+0', players: [] }, puzzle: { plays: 1 } })).toBeNull()
    expect(parsePuzzleGame({ game: ANSWER.game, puzzle: {} })).toBeNull()
  })
})
