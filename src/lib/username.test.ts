import { describe, expect, it } from 'vitest'
import { usernameProblem } from './username'

describe('usernameProblem', () => {
  it('accepts 3–20 letters, digits, _ and -, starting with a letter or digit', () => {
    expect(usernameProblem('Magnus')).toBeNull()
    expect(usernameProblem('k1ng_side-castle')).toBeNull()
    expect(usernameProblem('abc')).toBeNull()
    expect(usernameProblem('a'.repeat(20))).toBeNull()
  })

  it('says what is wrong', () => {
    expect(usernameProblem('ab')).toMatch(/at least 3/)
    expect(usernameProblem('a'.repeat(21))).toMatch(/20/)
    expect(usernameProblem('_magnus')).toMatch(/Start/)
    expect(usernameProblem('mag nus')).toMatch(/letters/)
    expect(usernameProblem('Rookahead')).toMatch(/taken/)
  })
})
