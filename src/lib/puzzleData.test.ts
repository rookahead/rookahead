import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextRatedLine } from './puzzleData'

const line = (id: string) => `${id} 6k1/5ppp/8/8/8/8/5PPP/3R2K1_w_-_-_0_1 d1d8,g8h7 600 mate,mateIn1`
const SHARD = ['aaaaa', 'bbbbb', 'ccccc', 'ddddd'].map(line).join('\n')

afterEach(() => vi.unstubAllGlobals())

describe('nextRatedLine', () => {
  it('picks any unseen puzzle in the file, not always its first', async () => {
    vi.stubGlobal('fetch', async (path: string) => new Response(path.endsWith('index.json') ? JSON.stringify({ version: 1, bands: { 600: 1 } }) : SHARD))
    // The same file and band each time; only the pick within the file changes with the dice.
    const at = (r: number) => nextRatedLine(600, [], () => r, 0)
    const ids = new Set((await Promise.all([0.01, 0.3, 0.6, 0.99].map(at))).map((l) => l.split(' ')[0]))
    expect(ids.size).toBeGreaterThan(1)
    // Seen ones stay out.
    expect((await nextRatedLine(600, ['aaaaa', 'bbbbb', 'ccccc'], () => 0.01, 0)).split(' ')[0]).toBe('ddddd')
  })
})

describe('nextRatedLine within', () => {
  const rated = (id: string, r: number) => `${id} 6k1/5ppp/8/8/8/8/5PPP/3R2K1_w_-_-_0_1 d1d8,g8h7 ${r} mate,mateIn1`
  const load = async () => {
    vi.resetModules()
    const shard = [rated('near1', 610), rated('near2', 640), rated('far01', 690)].join('\n')
    vi.stubGlobal('fetch', async (path: string) => new Response(path.endsWith('index.json') ? JSON.stringify({ version: 1, bands: { 600: 1 } }) : shard))
    return (await import('./puzzleData')).nextRatedLine
  }

  it('keeps to puzzles that close to the rating', async () => {
    const next = await load()
    const ids = await Promise.all([0.01, 0.5, 0.99].map((r) => next(620, [], () => r, 0, 40)))
    expect(ids.every((l) => l.startsWith('near'))).toBe(true)
  })

  it('falls back to the nearest unseen one when none is that close', async () => {
    const next = await load()
    expect((await next(620, ['near1'], () => 0.5, 0, 5)).split(' ')[0]).toBe('near2')
  })
})
