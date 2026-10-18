import '@fontsource-variable/dm-sans'
import '@fontsource-variable/syne'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
