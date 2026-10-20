import { describe, expect, it, vi } from 'vitest'
import { afterSignIn, navigate, onReselect, puzzleTab, routeFor } from './router'

describe('routeFor', () => {
  it('maps paths to pages', () => {
    expect(routeFor('/')).toBe('home')
    expect(routeFor('/analysis')).toBe('analysis')
    expect(routeFor('/analysis/')).toBe('analysis')
    expect(routeFor('/r')).toBe('analysis')
    expect(routeFor('/r/')).toBe('analysis')
    expect(routeFor('/play')).toBe('play')
    expect(routeFor('/play/')).toBe('play')
    expect(routeFor('/games')).toBe('games')
    expect(routeFor('/games/')).toBe('games')
    expect(routeFor('/board')).toBe('board')
    expect(routeFor('/puzzles')).toBe('puzzles')
    expect(routeFor('/puzzles/daily')).toBe('puzzles')
    expect(routeFor('/puzzles/mistakes/')).toBe('puzzles')
    expect(routeFor('/puzzles/other')).toBe('home')
  })

  it('reads the puzzle tab', () => {
    expect(puzzleTab('/puzzles')).toBe('rated')
    expect(puzzleTab('/puzzles/daily')).toBe('daily')
    expect(puzzleTab('/puzzles/sprint')).toBe('sprint')
    expect(routeFor('/puzzles/sprint')).toBe('puzzles')
    expect(puzzleTab('/puzzles/mistakes/')).toBe('mistakes')
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

describe('auth routes', () => {
  it('sends /signup and /login to the account page', () => {
    expect(routeFor('/signup')).toBe('auth')
    expect(routeFor('/login/')).toBe('auth')
    expect(routeFor('/reset-password')).toBe('auth')
  })
})

describe('afterSignIn', () => {
  it('goes on to an account page’s next', () => {
    expect(afterSignIn('/login?next=%2Fgames')).toBe('/games')
    expect(afterSignIn('/signup?next=/puzzles/daily')).toBe('/puzzles/daily')
    expect(afterSignIn('/reset-password?next=/play')).toBe('/play')
  })

  it('goes Home from an account page without one, or with one off the site', () => {
    expect(afterSignIn('/signup')).toBe('/')
    expect(afterSignIn('/login?next=//evil.example')).toBe('/')
    expect(afterSignIn('/login?next=https://evil.example')).toBe('/')
  })

  it('stays on any other page', () => {
    expect(afterSignIn('/games')).toBe('/games')
  })
})
