import '@fontsource-variable/dm-sans'
import '@fontsource-variable/syne'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import './embed.css'
import { EmbedApp } from './EmbedApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EmbedApp />
  </StrictMode>,
)
