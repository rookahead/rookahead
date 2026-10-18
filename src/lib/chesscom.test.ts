import { describe, expect, it } from 'vitest'
import { isChesscomUrl } from './chesscom'

describe('isChesscomUrl', () => {
  it('accepts Chess.com game links', () => {
    expect(isChesscomUrl('https://www.chess.com/game/live/123')).toBe(true)
    expect(isChesscomUrl('https://chess.com/game/daily/9')).toBe(true)
  })

  it('rejects look-alike hosts (share links can carry any URL)', () => {
    expect(isChesscomUrl('https://evil.example/chess.com')).toBe(false)
    expect(isChesscomUrl('https://chess.com.evil.example/game')).toBe(false)
    expect(isChesscomUrl('https://notchess.com/game')).toBe(false)
    expect(isChesscomUrl('not a url')).toBe(false)
  })
})
