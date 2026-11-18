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
