import { describe, expect, it } from 'vitest'
import { keepQueued, tag, type UsageRow } from './usage'

const row = (event: UsageRow['event'], detail = ''): UsageRow => ({ event, detail, platform: 'desktop' })

describe('usage log', () => {
  it('keeps only the latest open waiting', () => {
    const rows = keepQueued([row('open'), row('explain'), row('open'), row('review_done')])
    expect(rows.map((r) => r.event)).toEqual(['explain', 'open', 'review_done'])
  })

  it('caps the queue at 50, dropping the oldest', () => {
    const rows = keepQueued(Array.from({ length: 60 }, (_, i) => row('puzzle_solved', String(i))))
    expect(rows).toHaveLength(50)
    expect(rows[0].detail).toBe('10')
  })

  it('makes tags the table accepts', () => {
    expect(tag('Daily')).toBe('daily')
    expect(tag('win/loss draw!')).toBe('winlossdraw')
    expect(tag('a'.repeat(30))).toHaveLength(20)
  })
})
