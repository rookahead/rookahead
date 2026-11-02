// A tiny History-API router: pages switch without a reload, so the engine and the loaded game survive.
import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { startViewTransition } from '../hooks/useSettled'
import { slidesByHand, tabSlide } from './nav'

export type Route = 'home' | 'analysis' | 'board' | 'games' | 'legendary' | 'play' | 'puzzles' | 'settings' | 'you' | 'blog' | 'auth'
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
  // Phones' Blog tab; on desktop these addresses are the blog itself (App.tsx).
  if (/^\/blog(\/[a-z0-9-]+)?\/?$/.test(pathname)) return 'blog'
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
// Analyze is Game review's page without a game: moving between them isn't a change of page.
const pageOf = (pathname: string) => {
  const route = routeFor(pathname)
  return route === 'board' ? 'analysis' : route
}
let shownPage = typeof location === 'undefined' ? 'home' : pageOf(location.pathname)
// The path the app shows. It moves on with the redraw, not with the address: a page that re-renders between the
// two (a dialog closing) would otherwise switch pages early, before the view transition has taken its picture of
// the page you're leaving, and the transition would then fade the new page into itself.
let shownPath = typeof location === 'undefined' ? '/' : location.pathname

// How far down the page you left was scrolled: a page sliding away keeps its place.
let leftAt = 0
export const scrollLeftAt = () => leftAt

/**
 * Tells the app the address changed (running `first` just before it redraws). Going to another page plays
 * as one view transition (index.css, ::view-transition-*(page)): the page fades out and the next rises in,
 * or they slide along together between a phone's tabs, the sidebar staying put. The sign-in pages have their own slide, so they and reduced motion just switch.
 */
function notify(first?: () => void) {
  const from = shownPage
  shownPage = pageOf(location.pathname)
  if (typeof window !== 'undefined') leftAt = window.scrollY
  const update = () => {
    first?.()
    shownPath = location.pathname
    listeners.forEach((l) => l())
  }
  const animate =
    shownPage !== from &&
    from !== 'auth' &&
    shownPage !== 'auth' &&
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches
  const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 1000px)').matches
  if (animate && phone && slidesByHand(shownPath, location.pathname)) flushSync(update)
  else if (animate) {
    // On a phone, going to Analyze slides the two pages along together (index.css, :root[data-slide]).
    const root = document.documentElement
    const slide = phone ? tabSlide(shownPath, location.pathname) : null
    if (slide) root.dataset.slide = slide
    void startViewTransition(() => flushSync(update), 'page-change')
      .finished.catch(() => {})
      .finally(() => delete root.dataset.slide)
  } else update()
}
if (typeof window !== 'undefined') window.addEventListener('popstate', () => notify())

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
  // The page you're leaving is captured where you left it; the next one starts at the top.
  notify(() => window.scrollTo(0, 0))
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
    () => shownPath,
  )
}

export const useRoute = (): Route => routeFor(usePathname())
