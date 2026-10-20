import { describe, expect, it } from 'vitest'
import { pickGuestNudge } from './guestNudge'

describe('pickGuestNudge', () => {
  it('stays quiet until there is something to lose', () => {
    expect(pickGuestNudge({ streak: 2, reviews: 2, dismissed: [] })).toBeNull()
  })

  it('names the streak first, then the reviews', () => {
    expect(pickGuestNudge({ streak: 3, reviews: 5, dismissed: [] })?.kind).toBe('streak')
    expect(pickGuestNudge({ streak: 3, reviews: 5, dismissed: [] })?.title).toBe('Keep your 3-day puzzle streak safe')
    expect(pickGuestNudge({ streak: 1, reviews: 5, dismissed: [] })?.title).toBe('Your 5 reviews live only in this browser')
  })

  it('never brings back a dismissed nudge', () => {
    expect(pickGuestNudge({ streak: 4, reviews: 5, dismissed: ['streak'] })?.kind).toBe('reviews')
    expect(pickGuestNudge({ streak: 4, reviews: 5, dismissed: ['streak', 'reviews'] })).toBeNull()
  })
})
