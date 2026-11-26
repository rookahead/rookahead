import type { TileTone } from '../components/IconTile'
import type { Route } from './router'

// The app's sections, for the sidebar. `path: null` = no page: its menu (Tools), or not built yet ("Soon"). Your profile opens from the user card at its foot.
export interface NavItem {
  id: 'home' | 'play' | 'puzzles' | 'analysis' | 'board' | 'games' | 'legendary'
  label: string
  path: string | null
  /** Solid icon (even-odd, so inner shapes are cut out), 24×24 unless `grid` says otherwise. */
  icon: string
  /** The icon's square, for one drawn on another grid (Phosphor's 256). */
  grid?: number
  /** Lines (with a width) and shapes taken out of the icon, where even-odd can't: they cross its edge. */
  cuts?: { d: string; width?: number }[]
  /** Other pages that light it up (Tools: the board editor too). */
  also?: Route[]
  /** Its own pages, shown beside it when it's pointed at (desktop): straight to one way to play, or one puzzle mode. */
  menu?: NavShortcut[]
}

export interface NavShortcut {
  label: string
  text: string
  /** Where it goes; or, without one, the event it sends (a dialog that opens over the page). */
  path?: string
  event?: string
  tone: TileTone
  /** A solid icon on the tile instead of the tone's line one. */
  solid?: Pick<NavItem, 'icon' | 'grid' | 'cuts'>
}

/** Tools → Import a game: the Load a game dialog, over the page you're on (App.tsx). */
export const IMPORT_GAME_EVENT = 'rookahead:import-game'

/** The Analysis board's icon: a knight in a monocle, studying the position. */
export const KNIGHT: Pick<NavItem, 'icon' | 'cuts'> = {
  icon: 'M6 21H19.5C19.5 17 18.8 15 18.8 12.5C18.8 8.2 16.8 5.2 14 4.1L13.6 2.2L11.8 4C9.6 4.5 7.8 6 6.6 7.8L3.8 11.2C3.3 11.9 3.5 12.8 4.2 13.2L4.9 13.6C5.5 14 6.3 13.9 6.8 13.4L7.8 12.6C8.6 12.2 9.6 12.2 10.6 12.6C10.2 15.6 7 17.5 6 21Z',
  cuts: [
    { d: 'M13.8 7.6A2.6 2.6 0 1 1 8.6 7.6A2.6 2.6 0 1 1 13.8 7.6Z', width: 1 },
    { d: 'M12.1 7.6A0.9 0.9 0 1 1 10.3 7.6A0.9 0.9 0 1 1 12.1 7.6Z' },
    { d: 'M13.2 9.4c.9 1.6 1.2 3.4.8 5.4', width: 0.9 },
  ],
}

export const NAV_ITEMS: NavItem[] = [
  // The logo goes Home too, but a row of its own is easier to find. A rook with a door: a rook you live in.
  {
    id: 'home',
    label: 'Home',
    path: '/',
    icon: 'M5 3H8V5H10.5V3H13.5V5H16V3H19V11H15.5C15.5 15 16.5 17 19.5 18V21H4.5V18C7.5 17 8.5 15 8.5 11H5ZM10.4 21V17.9A1.6 1.6 0 0 1 13.6 17.9V21Z',
  },
  {
    id: 'play',
    label: 'Play',
    path: '/play',
    // A chess clock: two faces, a button on top for each side.
    icon:
      'M4.5 8.1H19.5A2.4 2.4 0 0 1 21.9 10.5V17.5A2.4 2.4 0 0 1 19.5 19.9H4.5A2.4 2.4 0 0 1 2.1 17.5V10.5A2.4 2.4 0 0 1 4.5 8.1ZM8.2 10.6A3.4 3.4 0 0 0 8.2 17.4A3.4 3.4 0 0 0 8.2 10.6ZM8.2 12.2A1.8 1.8 0 0 1 8.2 15.8A1.8 1.8 0 0 1 8.2 12.2ZM15.8 10.6A3.4 3.4 0 0 0 15.8 17.4A3.4 3.4 0 0 0 15.8 10.6ZM15.8 12.2A1.8 1.8 0 0 1 15.8 15.8A1.8 1.8 0 0 1 15.8 12.2ZM5.5 6.1H8.5A0.9 0.9 0 0 1 8.5 7.9H5.5A0.9 0.9 0 0 1 5.5 6.1ZM6.1 7.9H7.9V8.1H6.1ZM15.5 5.1H18.5A0.9 0.9 0 0 1 18.5 6.9H15.5A0.9 0.9 0 0 1 15.5 5.1ZM16.1 6.9H17.9V8.1H16.1Z',
    menu: [
      { label: 'Play online', text: 'A real player near your rating', path: '/play/online', tone: 'online' },
      { label: 'Play Cassie', text: '8 levels, with takebacks and hints', path: '/play/computer', tone: 'computer' },
      { label: 'Play a friend', text: 'Challenge them on Lichess', path: '/play/friend', tone: 'friend' },
    ],
  },
  {
    id: 'puzzles',
    label: 'Puzzles',
    path: '/puzzles',
    // Phosphor's puzzle piece (MIT).
    icon: 'M165.78,224H208a16,16,0,0,0,16-16V170.35A8,8,0,0,0,212.94,163a23.37,23.37,0,0,1-8.94,1.77c-13.23,0-24-11.1-24-24.73s10.77-24.73,24-24.73a23.37,23.37,0,0,1,8.94,1.77A8,8,0,0,0,224,109.65V72a16,16,0,0,0-16-16H171.78a35.36,35.36,0,0,0,.22-4,36,36,0,0,0-72,0,35.36,35.36,0,0,0,.22,4H64A16,16,0,0,0,48,72v32.22a35.36,35.36,0,0,0-4-.22,36,36,0,0,0,0,72,35.36,35.36,0,0,0,4-.22V208a16,16,0,0,0,16,16h42.22Z',
    grid: 256,
    menu: [
      { label: 'Rated puzzles', text: 'Puzzles at your rating', path: '/puzzles/rated', tone: 'accuracy' },
      { label: 'Puzzle Sprint', text: 'Against the clock, three lives', path: '/puzzles/sprint', tone: 'clock' },
      { label: 'Daily puzzle', text: 'The same one for everyone today', path: '/puzzles/daily', tone: 'puzzles' },
      { label: 'Fix your mistakes', text: 'Puzzles from your own games', path: '/puzzles/mistakes', tone: 'mistakes' },
    ],
  },
  // Tools: a menu of its own, no page (clicking it opens the menu). Lit up on the pages it holds. A wrench whose
  // head is a rook's battlements: our rook, made into a tool.
  {
    id: 'board',
    label: 'Tools',
    path: null,
    icon: 'M16.67 1.96L22.04 7.33A1.6 1.6 0 0 1 22.04 9.6L18.36 13.27A1.6 1.6 0 0 1 16.1 13.27L14.69 11.86L7.05 19.5A1.8 1.8 0 0 1 4.5 16.95L12.14 9.31L10.73 7.9A1.6 1.6 0 0 1 10.73 5.64L14.4 1.96A1.6 1.6 0 0 1 16.67 1.96Z',
    cuts: [{ d: 'M18.65 1.68L19.92 2.95L16.95 5.92L15.68 4.65Z' }, { d: 'M21.05 4.08L22.32 5.35L19.35 8.32L18.08 7.05Z' }],
    also: ['editor'],
    menu: [
      { label: 'Analysis board', text: 'Any position, with the engine', path: '/board', tone: 'analyze', solid: KNIGHT },
      { label: 'Board editor', text: 'Set up a position piece by piece', path: '/editor', tone: 'editor' },
      { label: 'Import a game', text: 'Chess.com, Lichess, PGN or FEN', event: IMPORT_GAME_EVENT, tone: 'import' },
    ],
  },
  // Rookahead's main thing, one click from any page. The coach's speech bubble, a verdict's star cut out of it.
  {
    id: 'analysis',
    label: 'Game review',
    path: '/analysis',
    icon: 'M5 3.1h14a2.9 2.9 0 0 1 2.9 2.9v9a2.9 2.9 0 0 1-2.9 2.9h-6.7l-4.8 3.7a.6.6 0 0 1-1-.5v-3.2H5a2.9 2.9 0 0 1-2.9-2.9V6A2.9 2.9 0 0 1 5 3.1zM12 6.5L13.06 9.24L15.99 9.4L13.71 11.26L14.47 14.1L12 12.5L9.53 14.1L10.29 11.26L8.01 9.4L10.94 9.24Z',
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
  home: { label: 'Play', to: '/play' },
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
