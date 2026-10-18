import { describe, expect, it } from 'vitest'
import { routeFor } from './router'

describe('routeFor', () => {
  it('maps paths to pages', () => {
    expect(routeFor('/')).toBe('home')
    expect(routeFor('/analysis')).toBe('analysis')
    expect(routeFor('/analysis/')).toBe('analysis')
    expect(routeFor('/r')).toBe('analysis')
    expect(routeFor('/r/')).toBe('analysis')
  })

  it('sends unknown paths home', () => {
    expect(routeFor('/nope')).toBe('home')
    expect(routeFor('')).toBe('home')
  })
})
