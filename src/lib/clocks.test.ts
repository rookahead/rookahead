import { describe, expect, it } from 'vitest'
import { clocksAt, formatClockFace, formatSpent, timeSpent } from './clocks'
import { addLine, mainline, treeFromPgn } from './tree'

const PGN = `[White "a"]
[Black "b"]
[TimeControl "180"]
[Result "0-1"]

1. e4 {[%clk 0:03:00]} 1... c5 {[%clk 0:02:59.6]} 2. Nf3 {[%clk 0:02:58.4]} 2... e6 {[%clk 0:02:58]} 0-1`

describe('clocksAt', () => {
  const { tree, headers } = treeFromPgn(PGN)
  const line = mainline(tree)

  it('shows the time control before anyone has moved', () => {
    expect(clocksAt(tree, line[0].id, headers)).toEqual({ white: 180, black: 180 })
  })

  it("shows each player's latest clock", () => {
    expect(clocksAt(tree, line[1].id, headers)).toEqual({ white: 180, black: 180 })
    expect(clocksAt(tree, line[3].id, headers)).toEqual({ white: 178.4, black: 179.6 })
    expect(clocksAt(tree, line[4].id, headers)).toEqual({ white: 178.4, black: 178 })
  })

  it('shows nothing in a side line, or for a game without clocks', () => {
    const side = addLine(tree, line[1].id, ['g8f6'])
    expect(clocksAt(side.tree, side.nodeId, headers)).toEqual({})
    const plain = treeFromPgn('1. e4 c5 2. Nf3 e6')
    expect(clocksAt(plain.tree, mainline(plain.tree)[3].id, plain.headers)).toEqual({})
  })
})

describe('formatClockFace', () => {
  it('reads like a chess clock', () => {
    expect(formatClockFace(180)).toBe('3:00')
    expect(formatClockFace(178.4)).toBe('2:58')
    expect(formatClockFace(9.66)).toBe('0:09.6')
    expect(formatClockFace(0)).toBe('0:00.0')
    expect(formatClockFace(3723)).toBe('1:02:03')
  })
})

describe('timeSpent', () => {
  it('is the clock before less the clock after, plus the increment', () => {
    const pgn = `[TimeControl "180+2"]\n\n1. e4 {[%clk 0:03:00]} 1... c5 {[%clk 0:02:59]} 2. Nf3 {[%clk 0:02:50]} 2... e6 {[%clk 0:02:30]} *`
    const { tree, headers } = treeFromPgn(pgn)
    const t = timeSpent(tree, headers)
    const ids = mainline(tree).slice(1).map((n) => t[n.id])
    // White: 180 → 180 took 2s (the increment); 180 → 170 took 12s. Black: 180 → 179 took 3s; 179 → 150 took 31s.
    expect(ids).toEqual([2, 3, 12, 31])
  })

  it('skips a first move when the time control is not known, and a game without clocks', () => {
    const { tree, headers } = treeFromPgn(`1. e4 {[%clk 0:03:00]} 1... c5 {[%clk 0:02:59]} 2. Nf3 {[%clk 0:02:50]} *`)
    expect(Object.values(timeSpent(tree, headers))).toEqual([10])
    const plain = treeFromPgn('1. e4 c5')
    expect(timeSpent(plain.tree, plain.headers)).toEqual({})
  })
})

describe('formatSpent', () => {
  it('reads short, like Chess.com', () => {
    expect(formatSpent(4.94)).toBe('4.9s')
    expect(formatSpent(24.4)).toBe('24s')
    expect(formatSpent(72)).toBe('1:12')
  })
})
