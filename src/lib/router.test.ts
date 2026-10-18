import { describe, expect, it, vi } from 'vitest'
import { navigate, onReselect, routeFor } from './router'

describe('routeFor', () => {
  it('maps paths to pages', () => {
    expect(routeFor('/')).toBe('home')
    expect(routeFor('/analysis')).toBe('analysis')
    expect(routeFor('/analysis/')).toBe('analysis')
    expect(routeFor('/r')).toBe('analysis')
    expect(routeFor('/r/')).toBe('analysis')
    expect(routeFor('/play')).toBe('play')
    expect(routeFor('/play/')).toBe('play')
  })

  it('sends unknown paths home', () => {
    expect(routeFor('/nope')).toBe('home')
    expect(routeFor('')).toBe('home')
  })
})

describe('navigate', () => {
  it('tells reselect listeners when the link for the current page is clicked again', () => {
    vi.stubGlobal('location', { pathname: '/play', search: '', hash: '' })
    vi.stubGlobal('history', { pushState: vi.fn() })
    vi.stubGlobal('window', { scrollTo: vi.fn() })
    const seen: string[] = []
    const stop = onReselect((path) => seen.push(path))
    navigate('/play')
    expect(seen).toEqual(['/play'])
    expect(history.pushState).not.toHaveBeenCalled()
    navigate('/analysis')
    expect(seen).toEqual(['/play'])
    stop()
    navigate('/play')
    expect(seen).toEqual(['/play'])
    vi.unstubAllGlobals()
  })
})
