import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
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
