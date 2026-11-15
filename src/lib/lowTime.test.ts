import { describe, expect, it } from 'vitest'
import { lowTimeMs } from './clock'

describe('lowTimeMs', () => {
  it('is a minute for rapid and longer games', () => {
    expect(lowTimeMs(600_000)).toBe(60_000)
    expect(lowTimeMs(1_800_000)).toBe(60_000)
  })
  it('is an eighth of the starting time for shorter games', () => {
    expect(lowTimeMs(180_000)).toBe(22_500)
    expect(lowTimeMs(300_000)).toBe(37_500)
  })
  it('never drops below ten seconds', () => {
    expect(lowTimeMs(60_000)).toBe(10_000)
  })
})
