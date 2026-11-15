import { describe, expect, it } from 'vitest'
import { incomingFrom } from './lichessPlay'

const base = { id: 'abcd1234', direction: 'in', challenger: { name: 'Friend' }, rated: true, variant: { key: 'standard' } }

describe('incomingFrom', () => {
  it('reads a rapid challenge as one Rookahead can play', () => {
    expect(incomingFrom({ ...base, speed: 'rapid', timeControl: { type: 'clock', limit: 600, increment: 5 } })).toEqual({
      id: 'abcd1234',
      from: 'Friend',
      rematchOf: null,
      clock: '10+5',
      rated: true,
      playable: true,
    })
  })

  it('marks blitz, variants and days-a-move games as not playable here', () => {
    expect(incomingFrom({ ...base, speed: 'blitz', timeControl: { type: 'clock', limit: 180, increment: 2 } }).playable).toBe(false)
    expect(incomingFrom({ ...base, speed: 'rapid', variant: { key: 'chess960' }, timeControl: { type: 'clock', limit: 600, increment: 0 } }).playable).toBe(false)
    expect(incomingFrom({ ...base, speed: 'correspondence', timeControl: { type: 'correspondence', daysPerTurn: 3 } })).toMatchObject({ clock: null, playable: false })
  })

  it('keeps a rematch apart', () => {
    expect(incomingFrom({ ...base, rematchOf: 'game0001', speed: 'rapid' }).rematchOf).toBe('game0001')
  })
})
