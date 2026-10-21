// A tiny History-API router: pages switch without a reload, so the engine and the loaded game survive.
import { useSyncExternalStore } from 'react'

export type Route = 'home' | 'analysis' | 'board' | 'games' | 'legendary' | 'play' | 'puzzles' | 'settings' | 'you' | 'auth'
export type PuzzleTab = 'rated' | 'sprint' | 'daily' | 'mistakes'
export type SettingsSection = 'profile' | 'linked' | 'board' | 'appearance' | 'account'

const SECTIONS = 'profile|linked|board|appearance|account'

export function routeFor(pathname: string): Route {
  if (/^\/(analysis|r)\/?$/.test(pathname)) return 'analysis'
  if (/^\/play\/?$/.test(pathname)) return 'play'
  if (/^\/games\/?$/.test(pathname)) return 'games'
  if (/^\/legendary\/?$/.test(pathname)) return 'legendary'
  if (/^\/board\/?$/.test(pathname)) return 'board'
  if (/^\/puzzles(\/(rated|sprint|daily|mistakes))?\/?$/.test(pathname)) return 'puzzles'
  if (/^\/you\/?$/.test(pathname)) return 'you'
  if (new RegExp(`^/settings(/(${SECTIONS}))?/?$`).test(pathname)) return 'settings'
  if (/^\/(signup|login|reset-password|auth\/google)\/?$/.test(pathname)) return 'auth'
  return 'home'
}

/** The Puzzles page's tab: /puzzles (or /puzzles/rated), /puzzles/sprint, /puzzles/daily, /puzzles/mistakes. */
export function puzzleTab(pathname: string): PuzzleTab {
  const m = /^\/puzzles\/(rated|sprint|daily|mistakes)\/?$/.exec(pathname)
  return m ? (m[1] as PuzzleTab) : 'rated'
}

/** Plain /puzzles: on phones the list of modes, on desktop rated puzzles. */
export const isPuzzleHub = (pathname: string) => /^\/puzzles\/?$/.test(pathname)

/** The Settings page's section: /settings/board and so on; plain /settings is none (phones show the list). */
export function settingsSection(pathname: string): SettingsSection | null {
  const m = new RegExp(`^/settings/(${SECTIONS})/?$`).exec(pathname)
  return m ? (m[1] as SettingsSection) : null
}

/** Where a sign-in started at `back` ends up: an account page's `?next=` (a path on this site, else Home); any other page is itself. */
export function afterSignIn(back: string): string {
  const url = new URL(back, 'https://x.invalid')
  if (!/^\/(login|signup|reset-password)\/?$/.test(url.pathname)) return back
  const next = url.searchParams.get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
if (typeof window !== 'undefined') window.addEventListener('popstate', notify)

const reselectListeners = new Set<(path: string) => void>()

/** Runs when a link to the page already showing is clicked (e.g. Play during a finished game). */
export function onReselect(listener: (path: string) => void): () => void {
  reselectListeners.add(listener)
  return () => reselectListeners.delete(listener)
}

/** Goes to `path`; `replace` swaps the current history entry (Back skips it). */
export function navigate(path: string, { replace = false } = {}): void {
  if (path === location.pathname + location.search + location.hash) {
    reselectListeners.forEach((l) => l(path))
    return
  }
  // Pages reached inside the app are marked, so a Back button knows there's somewhere to go back to.
  if (replace) history.replaceState(history.state, '', path)
  else history.pushState({ inApp: true }, '', path)
  window.scrollTo(0, 0)
  notify()
}

/** Phones' Back button: the page you came from, or `fallback` when this page was opened directly. */
export function goBack(fallback: string): void {
  if ((history.state as { inApp?: boolean } | null)?.inApp) history.back()
  else navigate(fallback, { replace: true })
}

/** The address's path; re-renders when it changes through `navigate` or Back/Forward. */
export function usePathname(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => location.pathname,
  )
}

export const useRoute = (): Route => routeFor(usePathname())
