import type { Route } from './router'

// The app's sections, for the sidebar. `path: null` = not built yet ("Soon"). Your profile opens from the user card at its foot.
export interface NavItem {
  id: 'play' | 'puzzles' | 'analysis' | 'board'
  label: string
  path: string | null
  /** Stroke icon, 24×24. */
  icon: string
  /** Solid shapes drawn over the strokes. */
  fill?: string
  /** The one item set apart and tinted in the brand colour. */
  featured?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'play', label: 'Play', path: '/play', icon: 'M6 4l14 8-14 8z' },
  {
    id: 'puzzles',
    label: 'Puzzles',
    path: '/puzzles',
    icon: 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
  },
  // A clean board for exploring any position (Game review is the same page with a game in it).
  // A lens over two board squares.
  {
    id: 'board',
    label: 'Analyze',
    path: '/board',
    icon: 'M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.6 15.6',
    fill: 'M7 7h3.5v3.5H7zM10.5 10.5H14V14h-3.5z',
  },
  // Rookahead's main thing: set apart and highlighted. The coach's speech bubble, with a verdict's solid star.
  {
    id: 'analysis',
    label: 'Game review',
    path: '/analysis',
    icon: 'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    fill: 'M12 6.5L13.06 9.24L15.99 9.4L13.71 11.26L14.47 14.1L12 12.5L9.53 14.1L10.29 11.26L8.01 9.4L10.94 9.24Z',
    featured: true,
  },
]

/** The phone's tab bar. You is your profile, its settings behind a gear. Playing starts from Home's button. */
export interface PhoneTab {
  id: 'home' | 'puzzles' | 'analyze' | 'blog' | 'you'
  label: string
  path: string
  icon: string
  /** The pages that light this tab up. */
  routes: Route[]
}

export const PHONE_TABS: PhoneTab[] = [
  { id: 'home', label: 'Home', path: '/', icon: 'M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5', routes: ['home', 'legendary', 'play', 'analysis'] },
  {
    id: 'puzzles',
    label: 'Puzzles',
    path: '/puzzles',
    icon: 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
    routes: ['puzzles'],
  },
  { id: 'analyze', label: 'Analyze', path: '/board', icon: 'M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.6 15.6M7 7h3.5v3.5H7zM10.5 10.5H14V14h-3.5z', routes: ['board'] },
  { id: 'blog', label: 'Blog', path: '/blog', icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h11M9 8h6M9 11h4', routes: ['blog'] },
  { id: 'you', label: 'You', path: '/profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0', routes: ['games', 'you', 'settings'] },
]

/** Review's Load a game, asked for from the tab bar. */
export const LOAD_GAME_EVENT = 'rookahead:load-game'

/** Each phone tab's main thing to do, as a big button in the tab bar above the tabs. */
export const PHONE_ACTIONS: Partial<Record<Route, { label: string; to?: string; event?: string }>> = {
  home: { label: 'Play the computer', to: '/play' },
  games: { label: 'Load a game', event: LOAD_GAME_EVENT },
}

/** The tabs whose pages slide as real elements (App.tsx). Analyze is full screen and has its bar to send away. */
const HAND_SLID = new Set(['/', '/puzzles', '/blog', '/profile'])

/** The tab an address belongs to: the profile, its Stats and Friends are the You tab; All games is a page you go into. */
const tabPath = (path: string) => (/^\/profile(\/(stats|friends))?\/?$/.test(path) ? '/profile' : path)

/**
 * Whether going from one tab to another slides the real pages rather than a view transition. A view transition
 * stops all drawing until the next page is painted, and with it the tab bar's pill; Review's boards take long
 * enough on a phone for that to show.
 */
export const slidesByHand = (from: string, to: string) => HAND_SLID.has(tabPath(from)) && HAND_SLID.has(tabPath(to)) && tabPath(from) !== tabPath(to)

/** Which way the pages slide going straight from one tab to another; anything else has no slide. */
export function tabSlide(from: string, to: string): 'forward' | 'back' | null {
  const a = PHONE_TABS.findIndex((t) => t.path === tabPath(from))
  const b = PHONE_TABS.findIndex((t) => t.path === tabPath(to))
  if (a < 0 || b < 0 || a === b) return null
  return b > a ? 'forward' : 'back'
}
