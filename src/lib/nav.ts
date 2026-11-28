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
  /** Where it goes; or, without one, the event it sends (a dialog that opens over the page). */
  path?: string
  event?: string
  /** Its solid icon, as the sidebar's own. */
  solid: Pick<NavItem, 'icon' | 'grid' | 'cuts'>
}

// The menus' solid icons: Phosphor's fill set (MIT), on its 256 grid, unless drawn here.
const ph = (icon: string): Pick<NavItem, 'icon' | 'grid'> => ({ icon, grid: 256 })
const GLOBE = ph('M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm78.36,64H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM216,128a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM128,43a115.27,115.27,0,0,1,26,45H102A115.11,115.11,0,0,1,128,43ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48Zm50.35,61.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z')
const PEOPLE = ph('M64.12,147.8a4,4,0,0,1-4,4.2H16a8,8,0,0,1-7.8-6.17,8.35,8.35,0,0,1,1.62-6.93A67.79,67.79,0,0,1,37,117.51a40,40,0,1,1,66.46-35.8,3.94,3.94,0,0,1-2.27,4.18A64.08,64.08,0,0,0,64,144C64,145.28,64,146.54,64.12,147.8Zm182-8.91A67.76,67.76,0,0,0,219,117.51a40,40,0,1,0-66.46-35.8,3.94,3.94,0,0,0,2.27,4.18A64.08,64.08,0,0,1,192,144c0,1.28,0,2.54-.12,3.8a4,4,0,0,0,4,4.2H240a8,8,0,0,0,7.8-6.17A8.33,8.33,0,0,0,246.17,138.89Zm-89,43.18a48,48,0,1,0-58.37,0A72.13,72.13,0,0,0,65.07,212,8,8,0,0,0,72,224H184a8,8,0,0,0,6.93-12A72.15,72.15,0,0,0,157.19,182.07Z')
/** Phosphor's puzzle piece (MIT): Puzzles' own icon. */
export const PUZZLE_PIECE = 'M165.78,224H208a16,16,0,0,0,16-16V170.35A8,8,0,0,0,212.94,163a23.37,23.37,0,0,1-8.94,1.77c-13.23,0-24-11.1-24-24.73s10.77-24.73,24-24.73a23.37,23.37,0,0,1,8.94,1.77A8,8,0,0,0,224,109.65V72a16,16,0,0,0-16-16H171.78a35.36,35.36,0,0,0,.22-4,36,36,0,0,0-72,0,35.36,35.36,0,0,0,.22,4H64A16,16,0,0,0,48,72v32.22a35.36,35.36,0,0,0-4-.22,36,36,0,0,0,0,72,35.36,35.36,0,0,0,4-.22V208a16,16,0,0,0,16,16h42.22Z'
/** Rated puzzles: the puzzle piece with a rising arrow cut through it. */
export const RATED_PIECE: Pick<NavItem, 'icon' | 'grid' | 'cuts'> = { icon: PUZZLE_PIECE, grid: 256, cuts: [{ d: 'M92 190L176 106M120 100H182V162', width: 26 }] }
const CALENDAR = ph('M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM128,168a16,16,0,1,1,16-16A16,16,0,0,1,128,168Zm80-88H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24Z')
const BOLT = ph('M213.85,125.46l-112,120a8,8,0,0,1-13.69-7l14.66-73.33L45.19,143.49a8,8,0,0,1-3-13l112-120a8,8,0,0,1,13.69,7L153.18,90.9l57.63,21.61a8,8,0,0,1,3,12.95Z')
const WARNING = ph('M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z')
const SQUARES = ph('M120,56v48a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40h48A16,16,0,0,1,120,56Zm80-16H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-96,96H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm96,0H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Z')
const PENCIL = ph('M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM192,108.68,147.31,64l24-24L216,84.68Z')
const TRAY_IN = ph('M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM90.34,114.34a8,8,0,0,1,11.32,0L120,132.69V72a8,8,0,0,1,16,0v60.69l18.34-18.35a8,8,0,0,1,11.32,11.32l-32,32a8,8,0,0,1-11.32,0l-32-32A8,8,0,0,1,90.34,114.34ZM208,208H48V168H76.69L96,187.32A15.89,15.89,0,0,0,107.31,192h41.38A15.86,15.86,0,0,0,160,187.31L179.31,168H208v40Z')
const TEACHER = ph('M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H53.39a8,8,0,0,0,7.23-4.57,48,48,0,0,1,86.76,0,8,8,0,0,0,7.23,4.57H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM104,168a32,32,0,1,1,32-32A32,32,0,0,1,104,168Zm112,32H159.43a63.93,63.93,0,0,0-13.16-16H192a8,8,0,0,0,8-8V80a8,8,0,0,0-8-8H64a8,8,0,0,0-8,8v96a8,8,0,0,0,6,7.75A63.72,63.72,0,0,0,48.57,200H40V56H216Z')
/** Cassie: a rook with two eyes, as she looks on Play. */
export const CASSIE: Pick<NavItem, 'icon'> = {
  icon: 'M5 3H8V5.2H10.5V3H13.5V5.2H16V3H19V21H5ZM7.7 13.4A2 1.5 0 0 0 11.7 13.4A2 1.5 0 0 0 7.7 13.4ZM12.3 13.4A2 1.5 0 0 0 16.3 13.4A2 1.5 0 0 0 12.3 13.4Z',
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
      { label: 'Play online', path: '/play/online', solid: GLOBE },
      // Until the coach has a page of its own, it opens the computer (as Play's Coach card does).
      { label: 'Coach', path: '/play/computer', solid: TEACHER },
      { label: 'Play Cassie', path: '/play/computer', solid: CASSIE },
      { label: 'Play a friend', path: '/play/friend', solid: PEOPLE },
    ],
  },
  {
    id: 'puzzles',
    label: 'Puzzles',
    path: '/puzzles',
    icon: PUZZLE_PIECE,
    grid: 256,
    menu: [
      { label: 'Rated puzzles', path: '/puzzles/rated', solid: RATED_PIECE },
      { label: 'Puzzle Sprint', path: '/puzzles/sprint', solid: BOLT },
      { label: 'Daily puzzle', path: '/puzzles/daily', solid: CALENDAR },
      { label: 'Fix your mistakes', path: '/puzzles/mistakes', solid: WARNING },
      { label: 'Puzzle themes', path: '/puzzles/themes', solid: SQUARES },
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
      { label: 'Analysis board', path: '/board', solid: KNIGHT },
      { label: 'Board editor', path: '/editor', solid: PENCIL },
      { label: 'Import a game', event: IMPORT_GAME_EVENT, solid: TRAY_IN },
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
