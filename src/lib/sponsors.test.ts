import { describe, expect, it } from 'vitest'
import { amazonUrl, pickSponsor, regionFromTimeZone, SPONSORS } from './sponsors'

describe('regionFromTimeZone', () => {
  it('sends Indian time zones to amazon.in', () => {
    expect(regionFromTimeZone('Asia/Kolkata')).toBe('in')
    expect(regionFromTimeZone('Asia/Calcutta')).toBe('in')
  })

  it('sends everyone else to amazon.com', () => {
    expect(regionFromTimeZone('Europe/London')).toBe('com')
    expect(regionFromTimeZone('')).toBe('com')
    expect(regionFromTimeZone(undefined)).toBe('com')
  })
})

describe('amazonUrl', () => {
  it('builds a tagged search link for the region', () => {
    expect(amazonUrl('tournament chess set', 'in', 'rookahead-21')).toBe('https://www.amazon.in/s?k=tournament+chess+set&tag=rookahead-21')
    expect(amazonUrl('chess clock', 'com', 'rookahead-20')).toBe('https://www.amazon.com/s?k=chess+clock&tag=rookahead-20')
  })
})

describe('pickSponsor', () => {
  it('shows the house card until the region has an affiliate tag', () => {
    expect(pickSponsor('in', { in: '', com: '' }, 0.3).kind).toBe('house')
    expect(pickSponsor('com', { in: 'x-21', com: '' }, 0.3).kind).toBe('house')
  })

  it('picks an Amazon item by the random value, with the tag in its link', () => {
    const first = pickSponsor('in', { in: 'x-21', com: '' }, 0)
    expect(first.kind).toBe('amazon')
    if (first.kind !== 'amazon') return
    expect(first.title).toBe(SPONSORS[0].title)
    expect(first.url).toContain('amazon.in/s?k=')
    expect(first.url).toContain('&tag=x-21')
    const last = pickSponsor('in', { in: 'x-21', com: '' }, 0.9999)
    expect(last.kind === 'amazon' && last.title).toBe(SPONSORS.at(-1)!.title)
  })
})
