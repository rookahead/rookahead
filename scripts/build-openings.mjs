// Builds src/data/openings.json from the Lichess opening list
// (https://github.com/lichess-org/chess-openings, CC0). Usage:
//   node scripts/build-openings.mjs <dir containing a.tsv … e.tsv>
// Every position reached along a named line counts as "book"; the line's last
// position also carries its name.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/build-openings.mjs <dir with a.tsv..e.tsv>')
  process.exit(1)
}

/** Board, side to move and castling rights — en passant and move counters don't matter here. */
const key = (fen) => fen.split(' ').slice(0, 3).join(' ')

const names = []
const nameIndex = new Map()
const positions = {} // key -> index into names, or -1 for book-but-unnamed

for (const file of ['a', 'b', 'c', 'd', 'e']) {
  const rows = fs.readFileSync(path.join(dir, `${file}.tsv`), 'utf8').trim().split('\n').slice(1)
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t')
    const chess = new Chess()
    chess.loadPgn(pgn)
    const replay = new Chess()
    for (const move of chess.history()) {
      replay.move(move)
      const k = key(replay.fen())
      if (!(k in positions)) positions[k] = -1
    }
    const label = `${eco} ${name}`
    if (!nameIndex.has(label)) {
      nameIndex.set(label, names.length)
      names.push(label)
    }
    positions[key(replay.fen())] = nameIndex.get(label)
  }
}

const out = path.join(root, 'src', 'data', 'openings.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ names, positions }))
console.log(`${Object.keys(positions).length} book positions, ${names.length} names → ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`)
