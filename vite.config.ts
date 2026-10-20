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

// The Full networks are ~100 MB each, over the host's per-file limit, so the web build
// (`npm run build:web`) leaves them out of dist/: they're served from R2 instead
// (functions/engine/[file].ts). Lite-only, the Full loaders go too.
const FULL_ENGINE_NETS = ['stockfish-19.wasm', 'stockfish-19-single.wasm']
const FULL_ENGINE_LOADERS = ['stockfish-19.js', 'stockfish-19-single.js']

function dropFullEngine(liteOnly: boolean): Plugin {
  let outDir = 'dist'
  return {
    name: 'drop-full-engine',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      for (const file of [...FULL_ENGINE_NETS, ...(liteOnly ? FULL_ENGINE_LOADERS : [])]) fs.rmSync(path.join(outDir, 'engine', file), { force: true })
    },
  }
}

// The browser only fetches a font once text needs it, and React draws the text late, so the page
// would paint in a fallback face first. Preloading the Latin files starts them with the HTML.
const PRELOAD_FONTS = /^assets\/(dm-sans-latin-wght-normal|syne-latin-wght-normal|dm-mono-latin-(400|500)-normal)-[\w-]+\.woff2$/

function preloadFonts(): Plugin {
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((file) => PRELOAD_FONTS.test(file))
          .map((file) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' }, injectTo: 'head-prepend' as const }))
      },
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), preloadFonts(), mode === 'web' && dropFullEngine(loadEnv(mode, process.cwd()).VITE_LITE_ONLY === 'true')],
  // Two pages: the app, and the engine-free viewer other sites embed (rookahead.com/embed).
  build: { rollupOptions: { input: { main: 'index.html', embed: 'embed.html' } } },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
