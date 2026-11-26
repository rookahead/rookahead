import { describe, expect, it } from 'vitest'
import { speedOf } from './speed'

describe('speedOf', () => {
  it('reads Chess.com, Lichess and Rookahead labels', () => {
    expect(speedOf('1 min', 'chesscom')).toBe('bullet')
    expect(speedOf('2 | 1', 'chesscom')).toBe('bullet')
    expect(speedOf('30s', 'lichess')).toBe('bullet')
    expect(speedOf('3 min', 'chesscom')).toBe('blitz')
    expect(speedOf('3 | 2', 'lichess')).toBe('blitz')
    expect(speedOf('5+3', 'rookahead')).toBe('blitz')
    expect(speedOf('10 min', 'chesscom')).toBe('rapid')
    expect(speedOf('15 | 10', 'lichess')).toBe('rapid')
    expect(speedOf('1 day', 'chesscom')).toBe('daily')
    expect(speedOf('3 days', 'chesscom')).toBe('daily')
    expect(speedOf('Unlimited', 'lichess')).toBe('untimed')
    expect(speedOf('Untimed', 'rookahead')).toBe('untimed')
  })

  it('follows each site: 5 | 5 is blitz on Chess.com, rapid on Lichess', () => {
    expect(speedOf('5 | 5', 'chesscom')).toBe('blitz')
    expect(speedOf('5 | 5', 'lichess')).toBe('rapid')
  })

  it('has no classical on Chess.com: 30 min is rapid there', () => {
    expect(speedOf('30 min', 'chesscom')).toBe('rapid')
    expect(speedOf('30 | 20', 'lichess')).toBe('classical')
    expect(speedOf('30+0', 'rookahead')).toBe('classical')
  })
})
