import { describe, expect, it } from 'vitest'
import { coverCrop } from './avatar'

describe('coverCrop', () => {
  it('takes the centred square', () => {
    expect(coverCrop(1200, 800)).toEqual({ sx: 200, sy: 0, side: 800 })
    expect(coverCrop(600, 900)).toEqual({ sx: 0, sy: 150, side: 600 })
    expect(coverCrop(500, 500)).toEqual({ sx: 0, sy: 0, side: 500 })
  })
})
