import { describe, expect, it } from 'vitest'
import { puzzlePath } from './puzzlePath'

describe('puzzlePath', () => {
  it('starts at the first chapter, with four ahead', () => {
    const { stops, current } = puzzlePath(0)
    expect(current).toBe(0)
    expect(stops.map((s) => s.state)).toEqual(['current', 'ahead', 'ahead', 'ahead', 'ahead'])
    expect(stops[0].inStop).toBe(0)
  })

  it('counts five rated puzzles to a chapter', () => {
    const { stops, current } = puzzlePath(12)
    expect(current).toBe(2)
    expect(stops[2].inStop).toBe(2)
    expect(stops.slice(0, 2).every((s) => s.state === 'done')).toBe(true)
  })

  it('moves on as a chapter fills', () => {
    expect(puzzlePath(14).current).toBe(2)
    expect(puzzlePath(15).current).toBe(3)
  })
})
