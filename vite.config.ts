/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Multi-threaded Stockfish needs SharedArrayBuffer, which browsers only expose
// on cross-origin isolated pages. These two headers turn isolation on.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// The Full network builds are ~100 MB each, over the host's per-file limit, so
// the Lite-only web build (`npm run build:web`) leaves them out of dist/.
const FULL_ENGINE_FILES = ['stockfish-19.js', 'stockfish-19.wasm', 'stockfish-19-single.js', 'stockfish-19-single.wasm']

function dropFullEngine(): Plugin {
  let outDir = 'dist'
  return {
    name: 'drop-full-engine',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      for (const file of FULL_ENGINE_FILES) fs.rmSync(path.join(outDir, 'engine', file), { force: true })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), loadEnv(mode, process.cwd()).VITE_LITE_ONLY === 'true' && dropFullEngine()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
