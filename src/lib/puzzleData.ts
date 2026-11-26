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
    // Any of the shard's unseen puzzles, not its first: the first would be the same one every time you start here.
    const fresh = lines.filter((l) => !recent.has(l.split(' ')[0]))
    if (fresh.length) return fresh[Math.floor(rand() * fresh.length)]
    fallback ??= lines[Math.floor(rand() * lines.length)]
  }
  if (!fallback) throw new Error('No puzzles')
  return fallback
}

/** Each Lichess theme: how many puzzles have it, and the shards of each rating band that hold any (themes.json). */
export interface ThemeIndex {
  version: number
  themes: Record<string, { count: number; bands: Record<string, number[]> }>
}

let themeIndex: Promise<ThemeIndex> | null = null

export function fetchThemes(): Promise<ThemeIndex> {
  themeIndex ??= fetchText('/puzzle-data/themes.json')
    .then((t) => JSON.parse(t) as ThemeIndex)
    .catch((e: unknown) => {
      themeIndex = null
      throw e
    })
  return themeIndex
}

/**
 * A puzzle of one theme ("fork", a Lichess theme) near the rating, not among those seen: from a shard that holds the
 * theme, in the nearest band that has it (rare ones live in only a few).
 */
export async function nextThemeLine(theme: string, rating: number, seen: string[], rand: () => number = Math.random, spread?: number): Promise<string> {
  const entry = (await fetchThemes()).themes[theme]
  if (!entry) return nextRatedLine(rating, seen, rand, spread)
  const recent = new Set(seen)
  const ofTheme = (l: string) => `,${l.split(' ')[4]},`.includes(`,${theme},`)
  let fallback: string | undefined
  for (let attempt = 0; attempt < 6; attempt++) {
    // Wider each time, in case the puzzles near the rating have all been seen.
    const band = pickBand(rating, Object.keys(entry.bands).map(Number), rand, (spread ?? 150) + attempt * 100)
    const shards = entry.bands[band]
    const lines = (await fetchLines(`${band}-${shards[Math.floor(rand() * shards.length)]}.txt`)).filter(ofTheme)
    const fresh = lines.filter((l) => !recent.has(l.split(' ')[0]))
    if (fresh.length) return fresh[Math.floor(rand() * fresh.length)]
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
