// Installing Rookahead as an app: the browser's own offer (Chrome, Edge, Samsung Internet on Android)
// is kept until the You page asks for it; iPhones have no offer, only Share → Add to Home Screen.
import { useSyncExternalStore } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let offer: InstallEvent | null = null
let version = 0
const listeners = new Set<() => void>()
const changed = () => {
  version++
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    offer = e as InstallEvent
    changed()
  })
  window.addEventListener('appinstalled', () => {
    offer = null
    changed()
  })
}

/** Already running as the installed app (from the home screen). */
export const runningInstalled = () =>
  typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

const ios = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

export interface InstallState {
  /** How it can be installed here: the browser's offer, the iPhone's Share menu, or not at all (or already is). */
  how: 'prompt' | 'ios' | null
  install: () => Promise<void>
}

export function useInstall(): InstallState {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  const how = runningInstalled() ? null : offer ? 'prompt' : ios() ? 'ios' : null
  return {
    how,
    install: async () => {
      if (!offer) return
      await offer.prompt()
      const { outcome } = await offer.userChoice
      if (outcome === 'accepted') offer = null
      changed()
    },
  }
}
