// What you've done today, counted as it happens: games reviewed, puzzles solved. Home's goals read it. Saved
// reviews can't be counted by date instead, because new verdict rules grade them again and give them a new date.
// Kept on this device only; a new day starts the counts at nothing.

import { localDayNumber } from './puzzles'

export type TallyKind = 'review' | 'puzzle'

const KEY = 'rookahead.today.v1'
const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

interface Tally {
  day: number
  counts: Partial<Record<TallyKind, number>>
}

function read(storage: Storage | undefined, today: number): Tally {
  try {
    const t = JSON.parse(storage?.getItem(KEY) ?? 'null') as Tally | null
    if (t && t.day === today && t.counts && typeof t.counts === 'object') return t
  } catch {
    // Unreadable: a fresh day.
  }
  return { day: today, counts: {} }
}

/** One more of `kind` done today. */
export function tally(kind: TallyKind, storage = defaultStorage(), now = new Date()): void {
  const t = read(storage, localDayNumber(now))
  t.counts[kind] = (t.counts[kind] ?? 0) + 1
  try {
    storage?.setItem(KEY, JSON.stringify(t))
  } catch {
    // Storage full or blocked: the count just doesn't move.
  }
}

/** How many of `kind` you've done today. */
export function tallyToday(kind: TallyKind, storage = defaultStorage(), now = new Date()): number {
  return read(storage, localDayNumber(now)).counts[kind] ?? 0
}
