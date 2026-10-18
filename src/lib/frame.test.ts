import { describe, expect, it } from 'vitest'
import type { GameReport } from './classify'
import { frameFor, frameLayout, squareOrigin } from './frame'
import { mainline, treeFromPgn } from './tree'

describe('squareOrigin', () => {
  it('places squares for White at the bottom', () => {
    expect(squareOrigin('a1', 'white', 100)).toEqual({ x: 0, y: 700 })
    expect(squareOrigin('h8', 'white', 100)).toEqual({ x: 700, y: 0 })
    expect(squareOrigin('e4', 'white', 100)).toEqual({ x: 400, y: 400 })
  })

  it('flips for Black', () => {
    expect(squareOrigin('a1', 'black', 100)).toEqual({ x: 700, y: 0 })
    expect(squareOrigin('h8', 'black', 100)).toEqual({ x: 0, y: 700 })
  })
})

describe('frameLayout', () => {
  it('fills the width with the board and stacks bars and footer around it', () => {
    const l = frameLayout(840)
    expect(l.board).toBe(840)
    expect(l.square).toBe(105)
    expect(l.height).toBe(2 * l.bar + l.board + l.footer)
    expect(l.bar).toBeGreaterThan(40)
    expect(l.footer).toBeGreaterThan(30)
  })
})

describe('frameFor', () => {
  const theme = { light: '#fff', dark: '#000', lastMove: 'rgba(1,2,3,0.5)' }
  const { tree, headers } = treeFromPgn('[White "Morphy"]\n[Black "Duke"]\n[WhiteElo "2690"]\n\n1. e4 e5 2. Nf3 *')
  const line = mainline(tree)
  const report = { moves: { [line[3].id]: { cls: 'brilliant' } } } as unknown as GameReport

  it('captions the move with its class and badges it', () => {
    const f = frameFor(line[3], { headers, orientation: 'white', report, theme })
    expect(f.caption).toBe('2. Nf3!!')
    expect(f.verdict).toBe('brilliant')
    expect(f.cls).toBe('brilliant')
    expect(f.lastMove).toEqual(['g1', 'f3'])
    expect(f.top).toEqual({ name: 'Duke', rating: undefined })
    expect(f.bottom).toEqual({ name: 'Morphy', rating: '2690' })
  })

  it('puts White on top when the board faces Black', () => {
    const f = frameFor(line[3], { headers, orientation: 'black', report, theme })
    expect(f.top.name).toBe('Morphy')
  })

  it('can leave the badge off while keeping the verdict', () => {
    const f = frameFor(line[3], { headers, orientation: 'white', report, theme }, () => false)
    expect(f.cls).toBeUndefined()
    expect(f.verdict).toBe('brilliant')
  })

  it('captions the start position and an unreviewed move', () => {
    expect(frameFor(line[0], { headers: {}, orientation: 'white', report: null, theme }).caption).toBe('Position')
    const f = frameFor(line[1], { headers: {}, orientation: 'white', report: null, theme })
    expect(f.caption).toBe('1. e4')
    expect(f.verdict).toBeUndefined()
    expect(f.top.name).toBe('Black')
  })
})
