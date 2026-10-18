import { describe, expect, it } from 'vitest'
import { favoured, formatScore, formatScoreShort, toWhitePov, winPercent } from './evaluation'

describe('toWhitePov', () => {
  it('keeps White-to-move scores and flips Black-to-move scores', () => {
    expect(toWhitePov({ type: 'cp', value: 50 }, 'white')).toEqual({ type: 'cp', value: 50 })
    expect(toWhitePov({ type: 'cp', value: 50 }, 'black')).toEqual({ type: 'cp', value: -50 })
    expect(toWhitePov({ type: 'mate', value: 2 }, 'black')).toEqual({ type: 'mate', value: -2 })
  })

  it('records who is checkmated for mate 0', () => {
    expect(toWhitePov({ type: 'mate', value: 0 }, 'black')).toEqual({ type: 'mate', value: 0, mated: 'black' })
  })
})

describe('winPercent', () => {
  it('is 50 at equality and symmetric', () => {
    expect(winPercent({ type: 'cp', value: 0 })).toBe(50)
    const up = winPercent({ type: 'cp', value: 200 })
    const down = winPercent({ type: 'cp', value: -200 })
    expect(up + down).toBeCloseTo(100)
    expect(up).toBeGreaterThan(65)
    expect(up).toBeLessThan(75)
  })

  it('saturates for mates', () => {
    expect(winPercent({ type: 'mate', value: 3 })).toBe(100)
    expect(winPercent({ type: 'mate', value: -1 })).toBe(0)
    expect(winPercent({ type: 'mate', value: 0, mated: 'white' })).toBe(0)
    expect(winPercent({ type: 'mate', value: 0, mated: 'black' })).toBe(100)
  })
})

describe('formatting', () => {
  it('formats centipawns and mates', () => {
    expect(formatScore({ type: 'cp', value: 124 })).toBe('+1.24')
    expect(formatScore({ type: 'cp', value: -50 })).toBe('−0.50')
    expect(formatScore({ type: 'cp', value: 0 })).toBe('0.00')
    expect(formatScore({ type: 'mate', value: 3 })).toBe('M3')
    expect(formatScore({ type: 'mate', value: -2 })).toBe('−M2')
    expect(formatScoreShort({ type: 'cp', value: -1234 })).toBe('12')
    expect(formatScoreShort({ type: 'cp', value: 87 })).toBe('0.9')
  })

  it('knows who is better', () => {
    expect(favoured({ type: 'cp', value: 3 })).toBeNull()
    expect(favoured({ type: 'cp', value: -80 })).toBe('black')
    expect(favoured({ type: 'mate', value: 0, mated: 'white' })).toBe('black')
  })
})
