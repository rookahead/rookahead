import { describe, expect, it } from 'vitest'
import { planGif } from './gifPlan'

const none = (n: number) => Array<boolean>(n).fill(false)

describe('planGif', () => {
  it('plays the whole game and holds the last frame', () => {
    const frames = planGif(34, { speed: 'normal', range: 'game', endIndex: 19, badged: none(34) })
    expect(frames).toHaveLength(34)
    expect(frames[0].nodeIndex).toBe(0)
    expect(frames.at(-1)!.nodeIndex).toBe(33)
    expect(frames.slice(0, -1).every((f) => f.delayMs === 1000)).toBe(true)
    expect(frames.at(-1)!.delayMs).toBe(3000)
  })

  it('shows the last ten moves up to the shared one', () => {
    expect(planGif(34, { speed: 'normal', range: 'last10', endIndex: 19, badged: none(34) }).map((f) => f.nodeIndex)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    expect(planGif(34, { speed: 'normal', range: 'last10', endIndex: 3, badged: none(34) }).map((f) => f.nodeIndex)).toEqual([0, 1, 2, 3])
  })

  it('uses the chosen speed', () => {
    expect(planGif(5, { speed: 'fast', range: 'game', endIndex: 4, badged: none(5) })[0].delayMs).toBe(500)
    expect(planGif(5, { speed: 'slow', range: 'game', endIndex: 4, badged: none(5) })[0].delayMs).toBe(1600)
  })

  it('badges only the moves it is told to', () => {
    const notable = none(5)
    notable[2] = true
    expect(planGif(5, { speed: 'normal', range: 'game', endIndex: 4, badged: notable }).map((f) => f.badge)).toEqual([false, false, true, false, false])
  })
})
