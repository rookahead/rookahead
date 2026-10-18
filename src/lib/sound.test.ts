import { describe, expect, it } from 'vitest'
import { moveSoundKind, stepSound, type Step } from './sound'

describe('moveSoundKind', () => {
  it('reads the move type off the SAN', () => {
    expect(moveSoundKind('e4')).toBe('move')
    expect(moveSoundKind('Nxe5')).toBe('capture')
    expect(moveSoundKind('O-O')).toBe('castle')
    expect(moveSoundKind('O-O-O')).toBe('castle')
    expect(moveSoundKind('e8=Q')).toBe('promote')
    expect(moveSoundKind('exd8=N')).toBe('promote')
  })

  it('lets a check or mate outrank the rest', () => {
    expect(moveSoundKind('Bxf7+')).toBe('check')
    expect(moveSoundKind('O-O+')).toBe('check')
    expect(moveSoundKind('e8=Q+')).toBe('check')
    expect(moveSoundKind('Qxf7#')).toBe('check')
  })
})

describe('stepSound', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
  const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
  const root: Step = { id: 'root', parentId: null, fen: start }
  const e4: Step = { id: 'e2e4', parentId: 'root', fen: afterE4, san: 'e4', parentFen: start }
  const e5: Step = { id: 'e2e4.e7e5', parentId: 'e2e4', fen: afterE5, san: 'e5', parentFen: afterE4 }

  it('plays the move made on a step forward', () => {
    expect(stepSound(root, e4)).toEqual({ san: 'e4', forward: true })
    expect(stepSound(e4, e5)).toEqual({ san: 'e5', forward: true })
  })

  it('replays the move taken back on a step back', () => {
    expect(stepSound(e5, e4)).toEqual({ san: 'e5', forward: false })
  })

  it('stays silent on jumps and when nothing moved', () => {
    expect(stepSound(root, e5)).toBeNull()
    expect(stepSound(e5, root)).toBeNull()
    expect(stepSound(e4, e4)).toBeNull()
  })

  it('stays silent when a new game reuses the ids from a different start', () => {
    const custom = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'
    expect(stepSound({ ...root, fen: custom }, e4)).toBeNull()
  })
})
