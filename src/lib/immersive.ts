// Phones: a page with a board shows it full screen, without the tab bar, while it's in use.
import { useEffect } from 'react'

/** While `on`, the tab bar steps aside (index.css, :root[data-immersive]); only phones take notice. */
export function useImmersive(on: boolean): void {
  useEffect(() => {
    if (!on) return
    const root = document.documentElement
    root.dataset.immersive = ''
    return () => {
      delete root.dataset.immersive
    }
  }, [on])
}
