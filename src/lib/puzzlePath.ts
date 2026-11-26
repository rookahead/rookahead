// The puzzle path: chapters you move through by earning XP from rated puzzles (Rated, and a theme's puzzles). The
// daily puzzle, Sprint and your own mistakes don't count toward it. XP is apart from your rating, which says how strong
// you are, while XP says how much you've done.

/** What earns XP. */
export const XP = {
  /** A rated or theme puzzle solved without a slip, and more for one rated above you. */
  solve: 10,
  harder: 5,
  /** A puzzle missed still taught you something. */
  miss: 2,
}

/** The XP a chapter (from 0) takes to finish: 100 for the first, 25 more each one after. */
export const chapterNeed = (index: number) => 100 + 25 * index

/** Where `xp` puts you: the chapter you're on, the XP you have in it, and what it takes. */
export function chapterAt(xp: number): { index: number; into: number; need: number } {
  let index = 0
  let left = Math.max(0, xp)
  while (left >= chapterNeed(index)) left -= chapterNeed(index++)
  return { index, into: left, need: chapterNeed(index) }
}

/** XP for progress from before there was XP: a fair start from the puzzles already solved and played. */
export const xpFromHistory = (solved: number, played: number) => solved * 8 + Math.max(0, played - solved) * XP.miss

export interface Stop {
  index: number
  state: 'done' | 'current' | 'ahead'
}

/** The path: every chapter so far, the one you're on, and a few ahead. */
export function puzzlePath(xp: number, ahead = 4): { stops: Stop[]; current: number } {
  const current = chapterAt(xp).index
  const stops: Stop[] = []
  for (let i = 0; i <= current + ahead; i++) stops.push({ index: i, state: i < current ? 'done' : i === current ? 'current' : 'ahead' })
  return { stops, current }
}

const SEEN_KEY = 'rookahead.pathSeen.v1'

/** The chapter the path last showed you on (null before it ever has), so a move to the next one can be shown once. */
export function seenChapter(): number | null {
  try {
    const n = Number(localStorage.getItem(SEEN_KEY) ?? NaN)
    return Number.isInteger(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function markSeen(chapter: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(chapter))
  } catch {
    // Storage blocked: the move shows again next time.
  }
}
