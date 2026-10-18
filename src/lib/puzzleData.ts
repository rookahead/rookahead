// Fetches the puzzle files in public/puzzle-data/ (built by scripts/build-puzzles.mjs), keeping shards in memory.
import { dailyIndex, parsePuzzleLine, pickBand } from './puzzles'

interface PuzzleIndex {
  version: number
  /** Band (lowest rating) → number of shards. */
  bands: Record<string, number>
}

let index: Promise<PuzzleIndex> | null = null
const shards = new Map<string, Promise<string[]>>()

async function fetchText(path: string): Promise<string> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.text()
}

function fetchIndex(): Promise<PuzzleIndex> {
  // A failed fetch isn't kept, so Retry fetches again.
  index ??= fetchText('/puzzle-data/index.json')
    .then((t) => JSON.parse(t) as PuzzleIndex)
    .catch((e: unknown) => {
      index = null
      throw e
    })
  return index
}

function fetchLines(file: string): Promise<string[]> {
  let lines = shards.get(file)
  if (!lines) {
    lines = fetchText(`/puzzle-data/${file}`).then((t) => t.split('\n').filter((l) => parsePuzzleLine(l)))
    lines.catch(() => shards.delete(file))
    shards.set(file, lines)
  }
  return lines
}

/** A puzzle near the rating that isn't among those seen (picked up to `spread` points either way). */
export async function nextRatedLine(rating: number, seen: string[], rand: () => number = Math.random, spread?: number): Promise<string> {
  const { bands } = await fetchIndex()
  const recent = new Set(seen)
  let fallback: string | undefined
  for (let attempt = 0; attempt < 6; attempt++) {
    const band = pickBand(rating, Object.keys(bands).map(Number), rand, spread)
    const lines = await fetchLines(`${band}-${Math.floor(rand() * bands[band])}.txt`)
    const fresh = lines.find((l) => !recent.has(l.split(' ')[0]))
    if (fresh) return fresh
    fallback ??= lines[Math.floor(rand() * lines.length)]
  }
  if (!fallback) throw new Error('No puzzles')
  return fallback
}

/** Today's puzzle (UTC day). */
export async function dailyLine(date = new Date()): Promise<string> {
  const lines = await fetchLines('daily.txt')
  return lines[dailyIndex(date, lines.length)]
}
