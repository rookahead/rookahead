// Copies the Stockfish WASM builds from node_modules into public/engine so
// Vite can serve them as static files. Runs automatically before dev/build.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = path.join(root, 'node_modules', 'stockfish', 'bin')
const dest = path.join(root, 'public', 'engine')

const files = [
  'stockfish-19.js',
  'stockfish-19.wasm',
  'stockfish-19-single.js',
  'stockfish-19-single.wasm',
  'stockfish-19-lite.js',
  'stockfish-19-lite.wasm',
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
]

fs.mkdirSync(dest, { recursive: true })

for (const file of files) {
  const from = path.join(src, file)
  const to = path.join(dest, file)
  if (!fs.existsSync(from)) {
    console.error(`[copy-engine] missing ${from} — run "npm install" first`)
    process.exit(1)
  }
  if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue
  fs.rmSync(to, { force: true })
  try {
    fs.linkSync(from, to) // hard link: no extra disk space for the 99MB nets
  } catch {
    fs.copyFileSync(from, to)
  }
  console.log(`[copy-engine] ${file}`)
}
