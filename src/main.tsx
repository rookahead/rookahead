import '@fontsource-variable/dm-sans'
import '@fontsource-variable/syne'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'
import { StrictMode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startViewTransition } from './hooks/useSettled'
import { startPixelGrid } from './lib/pixelGrid'
import './index.css'

// The app used to be called Outpost: carry its saved settings and game over to the new keys.
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('outpost.')) continue
    const renamed = 'rookahead.' + key.slice('outpost.'.length)
    if (localStorage.getItem(renamed) === null) localStorage.setItem(renamed, localStorage.getItem(key)!)
    localStorage.removeItem(key)
  }
} catch {
  // Storage unavailable — nothing to migrate.
}

// Installable as an app, and quick to open from the home screen (public/sw.js). Not in development,
// where a cached bundle would hide your edits.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Boards line up with the screen's pixels (src/lib/pixelGrid.ts).
startPixelGrid()

const container = document.getElementById('root')!
const root = createRoot(container)
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)
// The placeholder page from index.html fades into the app rather than cutting to it.
const fade = container.querySelector('.boot') && 'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches
if (fade) startViewTransition(() => flushSync(() => root.render(app)))
else root.render(app)
