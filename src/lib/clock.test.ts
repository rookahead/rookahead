import { describe, expect, it } from 'vitest'
import { CLOCK_GROUPS, clockLabel, flagged, isClockSetting, pause, press, remaining, resume, startClock } from './clock'

describe('clock', () => {
  it('has no clock for untimed games', () => {
    expect(startClock('none', 0, 'white')).toBeNull()
  })

  it('runs the side to move and adds the increment on each move', () => {
    let c = startClock('600+5', 1000, 'white')!
    expect(remaining(c, 'white', 4000)).toBe(597000)
    expect(remaining(c, 'black', 4000)).toBe(600000)
    c = press(c, 'white', 4000) // White used 3 s, gets 5 s back
    expect(remaining(c, 'white', 9000)).toBe(602000)
    expect(remaining(c, 'black', 9000)).toBe(595000)
  })

  it('stops while paused and continues from the same times', () => {
    let c = startClock('600+0', 0, 'white')!
    c = pause(c, 10000)
    expect(remaining(c, 'white', 99999)).toBe(590000)
    c = resume(c, 200000)
    expect(remaining(c, 'white', 201000)).toBe(589000)
  })

  it('reports a flag', () => {
    const c = startClock('600+0', 0, 'black')!
    expect(flagged(c, 599999)).toBeNull()
    expect(flagged(c, 600000)).toBe('black')
  })
})

describe('clock edge cases', () => {
  it('never adds time when read with a timestamp from before the clock started', () => {
    const c = startClock('600+0', 5000, 'white')!
    expect(remaining(c, 'white', 4000)).toBe(600000)
  })
})

describe('time controls', () => {
  it('offers bullet, blitz, rapid and classical', () => {
    expect(CLOCK_GROUPS.map((g) => [g.name, g.settings.map(clockLabel)])).toEqual([
      ['Bullet', ['1+0', '2+1']],
      ['Blitz', ['3+0', '3+2', '5+0', '5+3']],
      ['Rapid', ['10+0', '10+5', '15+10']],
      ['Classical', ['30+0', '30+20']],
    ])
    expect(clockLabel('none')).toBe('Untimed')
  })

  it('starts a bullet clock with its increment', () => {
    expect(startClock('120+1', 0, 'white')).toMatchObject({ white: 120000, black: 120000, increment: 1000 })
  })

  it('accepts only the offered settings', () => {
    expect(isClockSetting('300+3')).toBe(true)
    expect(isClockSetting('none')).toBe(true)
    expect(isClockSetting('7+7')).toBe(false)
    expect(isClockSetting(undefined)).toBe(false)
  })
})
