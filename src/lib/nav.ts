// The app's sections, for the sidebar and the phone tab bar. `path: null` = not built yet ("Soon").
export interface NavItem {
  id: 'play' | 'puzzles' | 'analysis' | 'games' | 'board'
  label: string
  /** The phone tab bar's shorter label. */
  short: string
  path: string | null
  /** Stroke icon, 24×24. */
  icon: string
  /** The one item set apart and tinted in the brand colour. */
  featured?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'play', label: 'Play', short: 'Play', path: '/play', icon: 'M6 4l14 8-14 8z' },
  {
    id: 'puzzles',
    label: 'Puzzles',
    short: 'Puzzles',
    path: '/puzzles',
    icon: 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
  },
  { id: 'games', label: 'My games', short: 'Games', path: '/games', icon: 'M4 5h16M4 12h16M4 19h10' },
  // A clean board for exploring any position (Game review is the same page with a game in it).
  { id: 'board', label: 'Analyze', short: 'Analyze', path: '/board', icon: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 16 16' },
  // Rookahead's main thing: set apart and highlighted.
  { id: 'analysis', label: 'Game review', short: 'Review', path: '/analysis', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2', featured: true },
]
