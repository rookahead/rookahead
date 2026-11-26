// Builds src/pieces-classic.css: the classic Lichess pieces (cburnett, GPL-2.0-or-later, from chessground) for those who
// pick them in Board settings, over Rookahead's own (src/pieces.css) wherever the page says data-pieces="classic"; and
// src/pieceSets.ts, each set's white knight for the Pieces option to show. Run: node scripts/build-classic-pieces.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const classic = fs.readFileSync(path.join(root, 'node_modules/@lichess-org/chessground/assets/chessground.cburnett.css'), 'utf8')
const own = fs.readFileSync(path.join(root, 'src/pieces.css'), 'utf8')

const rules = [...classic.matchAll(/\.cg-wrap piece\.(\w+)\.(\w+) \{\s*background-image: (url\([^)]*\));\s*\}/g)]
if (rules.length !== 12) throw new Error(`expected 12 pieces, found ${rules.length}`)
const ownKnight = /\.card-piece\.knight\.white \{\s*background-image: (url\([^)]*\));/.exec(own)?.[1]
if (!ownKnight) throw new Error("Rookahead's white knight not found in src/pieces.css")

let css = '/* The classic Lichess pieces (cburnett, GPL-2.0-or-later, by Colin M.L. Burnett), when picked in Board settings.\n   Built by scripts/build-classic-pieces.mjs from chessground\'s copy. */\n'
for (const [, role, color, url] of rules) {
  css += `[data-pieces='classic'] .cg-wrap piece.${role}.${color},\n[data-pieces='classic'] .card-piece.${role}.${color} {\n  background-image: ${url};\n}\n`
}
fs.writeFileSync(path.join(root, 'src/pieces-classic.css'), css)

// The Pieces option: each set's white knight, as an image of its own.
const bare = (url) => url.replace(/^url\('?|'?\)$/g, '')
const knight = rules.find(([, role, color]) => role === 'knight' && color === 'white')[3]
const ts = `// Each piece set's white knight, for the Pieces option (BoardOptions.tsx). Built by scripts/build-classic-pieces.mjs.\nexport const SET_KNIGHTS = {\n  rookahead: '${bare(ownKnight)}',\n  classic: '${bare(knight)}',\n}\n`
fs.writeFileSync(path.join(root, 'src/pieceSets.ts'), ts)
console.log(`${css.length} + ${ts.length} bytes`)
