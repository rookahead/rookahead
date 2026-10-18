// Builds public/puzzle-data/ from the Lichess puzzle database
// (https://database.lichess.org/#puzzles, CC0). Usage:
//   node scripts/build-puzzles.mjs <path to lichess_db_puzzle.csv.zst>
// Keeps well-rated, popular puzzles, the 8 000 most played per 100-point band, in shuffled
// shards of 500, plus a fixed list for the daily puzzle. Format: docs/superpowers/specs/2026-10-18-puzzles-design.md.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const input = process.argv[2]
if (!input) {
  console.error('usage: node scripts/build-puzzles.mjs <lichess_db_puzzle.csv.zst>')
  process.exit(1)
}

const PER_BAND = 8000
const PER_SHARD = 500
const DAILY = 1000
const MIN_BAND = 400
const MAX_BAND = 2800

/** Seeded PRNG, so a rebuild from the same file gives the same shards. */
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(items, rand) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

const byPlays = (a, b) => b.plays - a.plays
const bands = new Map() // band -> candidates
const daily = []

const zstd = spawn('zstd', ['-dc', input], { stdio: ['ignore', 'pipe', 'inherit'] })
const lines = readline.createInterface({ input: zstd.stdout, crlfDelay: Infinity })
let header = true
for await (const row of lines) {
  if (header) {
    header = false
    continue
  }
  const [id, fen, moves, rating, deviation, popularity, plays, themes] = row.split(',')
  const r = Number(rating)
  if (Number(deviation) > 90 || Number(popularity) < 85 || Number(plays) < 300) continue
  const line = [id, fen.replaceAll(' ', '_'), moves.replaceAll(' ', ','), r, themes.replaceAll(' ', ',')].join(' ')
  const entry = { line, plays: Number(plays) }
  if (Number(popularity) >= 95 && r >= 1300 && r <= 2000 && Number(plays) >= 2000) daily.push(entry)
  const band = Math.min(MAX_BAND, Math.max(MIN_BAND, Math.floor(r / 100) * 100))
  let list = bands.get(band)
  if (!list) bands.set(band, (list = []))
  list.push(entry)
  // Keep memory flat: trim to the most played every so often.
  if (list.length >= PER_BAND * 3) list.sort(byPlays).splice(PER_BAND)
}

const out = path.join(root, 'public', 'puzzle-data')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

const rand = mulberry32(2026)
const index = { version: 1, bands: {} }
let total = 0
for (const band of [...bands.keys()].sort((a, b) => a - b)) {
  const kept = shuffle(bands.get(band).sort(byPlays).slice(0, PER_BAND), rand)
  const shards = Math.ceil(kept.length / PER_SHARD)
  index.bands[band] = shards
  for (let n = 0; n < shards; n++) {
    fs.writeFileSync(path.join(out, `${band}-${n}.txt`), kept.slice(n * PER_SHARD, (n + 1) * PER_SHARD).map((e) => e.line).join('\n') + '\n')
  }
  total += kept.length
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index) + '\n')
fs.writeFileSync(path.join(out, 'daily.txt'), shuffle(daily.sort(byPlays).slice(0, DAILY * 4), rand).slice(0, DAILY).map((e) => e.line).join('\n') + '\n')
console.log(`${total} puzzles in ${Object.keys(index.bands).length} bands, ${DAILY} daily`)
