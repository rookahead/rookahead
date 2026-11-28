import { describe, expect, it } from 'vitest'
import { sprintRunTypes, THEME_ORDER } from './puzzleThemes'

describe('sprintRunTypes', () => {
  it('mixes the chosen types, or every kind when none is chosen', () => {
    expect(sprintRunTypes(['fork', 'pin'], 'mix', 'fork')).toEqual(['fork', 'pin'])
    expect(sprintRunTypes([], 'mix', null)).toEqual([])
  })

  it('takes the next type, round to the first after the last', () => {
    expect(sprintRunTypes(['fork', 'pin'], 'next', null)).toEqual(['fork'])
    expect(sprintRunTypes(['fork', 'pin'], 'next', 'fork')).toEqual(['pin'])
    expect(sprintRunTypes(['fork', 'pin'], 'next', 'pin')).toEqual(['fork'])
    expect(sprintRunTypes([], 'next', THEME_ORDER[0])).toEqual([THEME_ORDER[1]])
  })

  it('takes a random type other than the last', () => {
    for (const r of [0, 0.5, 0.99]) expect(sprintRunTypes(['fork', 'pin', 'skewer'], 'random', 'pin', () => r)).not.toEqual(['pin'])
    expect(sprintRunTypes(['fork'], 'random', 'fork')).toEqual(['fork'])
  })
})
