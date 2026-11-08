import { describe, expect, it } from 'vitest'
import { isRecent, RECENT_MS, type Session } from './session'

const game = (pgn: string, seenAt?: number): Session => ({ pgn, orientation: 'white', currentPly: 0, evals: {}, seenAt })
const NOW = 1_800_000_000_000

describe('the game you were just on', () => {
  it('is one with moves, worked on in the last half hour', () => {
    expect(isRecent(game('[White "A"]\n\n1. e4 e5 *', NOW - 60_000), NOW)).toBe(true)
  })
  it('isn’t once the half hour is up', () => {
    expect(isRecent(game('1. e4 e5 *', NOW - RECENT_MS), NOW)).toBe(false)
  })
  it('isn’t an empty board, or a game never stamped, or none at all', () => {
    expect(isRecent(game('[SetUp "1"]\n[FEN "8/8/8/8/8/8/8/K6k w - - 0 1"]\n\n*', NOW), NOW)).toBe(false)
    expect(isRecent(game('1. e4 *'), NOW)).toBe(false)
    expect(isRecent(null, NOW)).toBe(false)
  })
  it('isn’t moves tried on a clean board', () => {
    expect(isRecent({ ...game('1. e4 e5 *', NOW - 60_000), board: true }, NOW)).toBe(false)
  })
})
