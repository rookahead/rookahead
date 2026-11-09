import { describe, expect, it } from 'vitest'
import { readStats } from './publicProfile'
import { playerName, routeFor } from './router'

describe('public profile addresses', () => {
  it('reads the username after the @', () => {
    expect(playerName('/@MelonLord-009')).toBe('MelonLord-009')
    expect(playerName('/%40melon_lord/')).toBe('melon_lord')
    expect(routeFor('/@melon')).toBe('player')
  })

  it('leaves anything that is not a username alone', () => {
    expect(playerName('/@ab')).toBeNull()
    expect(playerName('/@bad.name')).toBeNull()
    expect(playerName('/profile')).toBeNull()
    expect(routeFor('/@a/b')).toBe('home')
  })
})

describe('readStats', () => {
  it('keeps what a public profile shows', () => {
    const stats = { online: [{ label: 'Blitz', rating: 1886, games: 40 }], puzzles: { rating: 1612, solved: 90 }, games: 652, reviewed: 31, legendary: 4 }
    expect(readStats(stats)).toEqual(stats)
  })

  it('makes do with an empty or broken row', () => {
    expect(readStats(null)).toEqual({ online: [], puzzles: { rating: 1500, solved: 0 }, games: 0, reviewed: 0, legendary: 0 })
    expect(readStats({ online: [null, { rating: 3 }, { label: 'Rapid', rating: '9' }], games: 'x' }).online).toEqual([{ label: 'Rapid', rating: 0, games: 0 }])
  })
})
