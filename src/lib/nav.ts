import type { Route } from './router'

// The app's sections, for the sidebar. `path: null` = not built yet ("Soon").
export interface NavItem {
  id: 'play' | 'puzzles' | 'analysis' | 'games' | 'board'
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
  { id: 'games', label: 'My games', path: '/games', icon: 'M4 5h16M4 12h16M4 19h10' },
  // A clean board for exploring any position (Game review is the same page with a game in it).
  // A lens over two board squares.
  {
    id: 'board',
    label: 'Analyze',
    path: '/board',
    icon: 'M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.6 15.6',
    fill: 'M7 7h3.5v3.5H7zM10.5 10.5H14V14h-3.5z',
  },
  // Rookahead's main thing: set apart and highlighted.
  { id: 'analysis', label: 'Game review', path: '/analysis', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2', featured: true },
]

/** The phone's tab bar: My games, Analyze and Game review share the Review tab; You holds the profile and settings. */
export interface PhoneTab {
  id: 'home' | 'review' | 'puzzles' | 'play' | 'you'
  label: string
  path: string
  icon: string
  /** The pages that light this tab up. */
  routes: Route[]
}

export const PHONE_TABS: PhoneTab[] = [
  { id: 'home', label: 'Home', path: '/', icon: 'M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5', routes: ['home'] },
  { id: 'review', label: 'Review', path: '/games', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2', routes: ['games', 'analysis', 'board'] },
  {
    id: 'puzzles',
    label: 'Puzzles',
    path: '/puzzles',
    icon: 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
    routes: ['puzzles'],
  },
  { id: 'play', label: 'Play', path: '/play', icon: 'M6 4l14 8-14 8z', routes: ['play'] },
  { id: 'you', label: 'You', path: '/you', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0', routes: ['you', 'settings'] },
]
