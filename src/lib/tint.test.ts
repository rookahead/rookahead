import { describe, expect, it } from 'vitest'
import { tintOf, tintParts, withStrength } from './settings'

describe('your own last-move colour', () => {
  it('goes from the picker to a tint and back', () => {
    expect(tintOf('#6445fc', 0.49)).toBe('rgba(100, 69, 252, 0.49)')
    expect(tintParts('rgba(100, 69, 252, 0.49)')).toEqual({ hex: '#6445fc', opacity: 0.49 })
    expect(tintParts(tintOf('#00ff7f', 0.3))).toEqual({ hex: '#00ff7f', opacity: 0.3 })
  })

  it('takes any colour to another strength', () => {
    expect(withStrength('rgba(255, 214, 102, 0.62)', 0.35)).toBe('rgba(255, 214, 102, 0.35)')
  })
})
