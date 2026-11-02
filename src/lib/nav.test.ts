import { describe, expect, it } from 'vitest'
import { tabSlide } from './nav'

describe('tabSlide', () => {
  it('slides towards the tab you go to', () => {
    expect(tabSlide('/', '/puzzles')).toBe('forward')
    expect(tabSlide('/you', '/blog')).toBe('back')
  })

  it('leaves everything that is not one tab to another alone', () => {
    expect(tabSlide('/', '/analysis')).toBeNull()
    expect(tabSlide('/legendary', '/')).toBeNull()
    expect(tabSlide('/puzzles/rated', '/puzzles')).toBeNull()
    expect(tabSlide('/games', '/games')).toBeNull()
  })
})
