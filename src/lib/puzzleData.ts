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

const ratingOf = (line: string) => Number(line.split(' ')[3])

/**
 * Picks among a shard's unseen puzzles: any of them, or with `within` only those that close to the rating. When none
 * is that close, `closest` keeps the nearest seen so far, for when every try comes up short.
 */
function pickFresh(lines: string[], recent: Set<string>, rating: number, rand: () => number, within: number | undefined, closest: { line?: string; gap: number }): string | undefined {
  const fresh = lines.filter((l) => !recent.has(l.split(' ')[0]))
  const near = within === undefined ? fresh : fresh.filter((l) => Math.abs(ratingOf(l) - rating) <= within)
  // Any of them, not the first: the first would be the same one every time you start here.
  if (near.length) return near[Math.floor(rand() * near.length)]
  for (const l of fresh) {
    const gap = Math.abs(ratingOf(l) - rating)
    if (gap < closest.gap) Object.assign(closest, { line: l, gap })
  }
  return undefined
}

/**
 * A puzzle near the rating that isn't among those seen (picked up to `spread` points either way), and with `within`
 * no further than that from it: a Sprint climbs in even steps, not a jump of 200 between two puzzles.
 */
export async function nextRatedLine(rating: number, seen: string[], rand: () => number = Math.random, spread?: number, within?: number): Promise<string> {
  const { bands } = await fetchIndex()
  const recent = new Set(seen)
  const closest: { line?: string; gap: number } = { gap: Infinity }
  let fallback: string | undefined
  for (let attempt = 0; attempt < 6; attempt++) {
    const band = pickBand(rating, Object.keys(bands).map(Number), rand, spread)
    const lines = await fetchLines(`${band}-${Math.floor(rand() * bands[band])}.txt`)
    const picked = pickFresh(lines, recent, rating, rand, within, closest)
    if (picked) return picked
    fallback ??= lines[Math.floor(rand() * lines.length)]
  }
  const line = closest.line ?? fallback
  if (!line) throw new Error('No puzzles')
  return line
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
export async function nextThemeLine(theme: string, rating: number, seen: string[], rand: () => number = Math.random, spread?: number, within?: number): Promise<string> {
  const entry = (await fetchThemes()).themes[theme]
  if (!entry) return nextRatedLine(rating, seen, rand, spread, within)
  const recent = new Set(seen)
  const ofTheme = (l: string) => `,${l.split(' ')[4]},`.includes(`,${theme},`)
  const closest: { line?: string; gap: number } = { gap: Infinity }
  let fallback: string | undefined
  for (let attempt = 0; attempt < 6; attempt++) {
    // Wider each time, in case the puzzles near the rating have all been seen.
    const band = pickBand(rating, Object.keys(entry.bands).map(Number), rand, (spread ?? 150) + attempt * 100)
    const shards = entry.bands[band]
    const lines = (await fetchLines(`${band}-${shards[Math.floor(rand() * shards.length)]}.txt`)).filter(ofTheme)
    const picked = pickFresh(lines, recent, rating, rand, within, closest)
    if (picked) return picked
    fallback ??= lines[Math.floor(rand() * lines.length)]
  }
  const line = closest.line ?? fallback
  if (!line) throw new Error('No puzzles')
  return line
}

/** Today's puzzle (UTC day). */
export async function dailyLine(date = new Date()): Promise<string> {
  const lines = await fetchLines('daily.txt')
  return lines[dailyIndex(date, lines.length)]
}
