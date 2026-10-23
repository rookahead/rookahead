// Each page's title and description, for the browser tab (App.tsx) and for search engines: the build writes
// a copy of the app's page per address with these in its head (vite.config.ts, routePages).

export const SITE = 'https://rookahead.com'

export interface PageMeta {
  title: string
  description: string
}

/** The pages search engines should know, by address. */
export const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: 'Rookahead · Free chess game review',
    description:
      'Free, unlimited chess game review with Stockfish 19 in your browser. Every move graded from Legendary to Blunder, with accuracy and key moments. Paste a PGN and go. No sign-up.',
  },
  '/games': {
    title: 'My chess games · Rookahead',
    description:
      'Your Chess.com and Lichess games in one place, newest first, each with its accuracy. Review any of them free with Stockfish 19, with no limit and no sign-up.',
  },
  '/puzzles': {
    title: 'Free chess puzzles · Rookahead',
    description:
      'Rated chess puzzles, a daily puzzle and Puzzle Sprint, free with no daily limit. The mistakes from your own reviewed games come back as puzzles too.',
  },
  '/puzzles/daily': {
    title: 'Daily chess puzzle · Rookahead',
    description: 'A new chess puzzle every day, the same for everyone. Solve it to keep your puzzle streak going. Free, no sign-up.',
  },
  '/play': {
    title: 'Play chess against the computer · Rookahead',
    description:
      'Play the computer at 8 levels, from 400 to 2600, at any time control. The lower levels make the mistakes people make at that rating. Review the game free afterwards.',
  },
  '/legendary': {
    title: 'Legendary moves · Rookahead',
    description: 'Your Legendary moves: the sound sacrifices Stockfish 19 found in your reviewed games, the moves only you saw.',
  },
  '/board': {
    title: 'Chess analysis board · Rookahead',
    description: 'A free chess analysis board with Stockfish 19 in your browser. Set up any position, paste a PGN or FEN, and explore lines with the engine.',
  },
}

/** The browser tab's title for an address the app shows (pages without their own entry get the plain name). */
export function titleFor(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (PAGE_META[path]) return PAGE_META[path].title
  if (/^\/puzzles\//.test(path)) return PAGE_META['/puzzles'].title
  if (/^\/settings/.test(path)) return 'Settings · Rookahead'
  if (/^\/(analysis|r)$/.test(path)) return 'Game review · Rookahead'
  if (path === '/you') return 'You · Rookahead'
  if (/^\/(signup|login|reset-password)$/.test(path)) return 'Sign in · Rookahead'
  return PAGE_META['/'].title
}
