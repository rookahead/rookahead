// The app's sections, for the sidebar and the phone tab bar. `path: null` = not built yet ("Soon").
export interface NavItem {
  id: 'play' | 'puzzles' | 'analysis' | 'games'
  label: string
  path: string | null
  /** Stroke icon, 24×24. */
  icon: string
}

// Review first: Rookahead is where you get better at the games you play anywhere.
export const NAV_ITEMS: NavItem[] = [
  { id: 'analysis', label: 'Review', path: '/analysis', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2' },
  { id: 'games', label: 'Games', path: '/games', icon: 'M4 5h16M4 12h16M4 19h10' },
  {
    id: 'puzzles',
    label: 'Puzzles',
    path: '/puzzles',
    icon: 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z',
  },
  { id: 'play', label: 'Play', path: '/play', icon: 'M6 4l14 8-14 8z' },
]
