// A tiny History-API router: pages switch without a reload, so the engine and the loaded game survive.
import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'analysis'

export function routeFor(pathname: string): Route {
  return /^\/(analysis|r)\/?$/.test(pathname) ? 'analysis' : 'home'
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
if (typeof window !== 'undefined') window.addEventListener('popstate', notify)

export function navigate(path: string): void {
  if (path === location.pathname + location.search + location.hash) return
  history.pushState(null, '', path)
  window.scrollTo(0, 0)
  notify()
}

/** Re-renders when the address changes through `navigate` or Back/Forward. */
export function useRoute(): Route {
  const pathname = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => location.pathname,
  )
  return routeFor(pathname)
}
