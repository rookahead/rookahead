// Builds public/puzzle-data/themes.json from the puzzle shards (scripts/build-puzzles.mjs): for each Lichess theme, how
// many puzzles have it, and which shards of each rating band hold any, so a puzzle of a rare theme is one fetch away.
// Run after build-puzzles: node scripts/build-puzzle-themes.mjs
import fs from 'node:fs'
import path from 'node:path'

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../public/puzzle-data')
const { bands } = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))

/** theme → { count, bands: { band: [shard numbers] } } */
const themes = {}
for (const [band, shards] of Object.entries(bands)) {
  for (let shard = 0; shard < shards; shard++) {
    const lines = fs.readFileSync(path.join(dir, `${band}-${shard}.txt`), 'utf8').split('\n').filter(Boolean)
    const here = new Set()
    for (const line of lines) {
      for (const theme of (line.split(' ')[4] ?? '').split(',')) {
        if (!theme) continue
        themes[theme] ??= { count: 0, bands: {} }
        themes[theme].count++
        here.add(theme)
      }
    }
    for (const theme of here) (themes[theme].bands[band] ??= []).push(shard)
  }
}

fs.writeFileSync(path.join(dir, 'themes.json'), JSON.stringify({ version: 1, themes }))
console.log(`${Object.keys(themes).length} themes, ${fs.statSync(path.join(dir, 'themes.json')).size} bytes`)
