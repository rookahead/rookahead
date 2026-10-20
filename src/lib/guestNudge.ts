// The one sign-up nudge a guest may see on Home: shown when there's something to lose, and gone for good once dismissed.

export type GuestNudgeKind = 'streak' | 'reviews'

export interface GuestNudge {
  kind: GuestNudgeKind
  title: string
  text: string
}

const KEY = 'rookahead.nudges'
/** From here on there's enough to be worth keeping. */
export const NUDGE_STREAK = 3
export const NUDGE_REVIEWS = 3

/** Which nudge to show, if any: a streak worth saving first, then a pile of reviews. */
export function pickGuestNudge({ streak, reviews, dismissed }: { streak: number; reviews: number; dismissed: GuestNudgeKind[] }): GuestNudge | null {
  if (streak >= NUDGE_STREAK && !dismissed.includes('streak'))
    return { kind: 'streak', title: `Keep your ${streak}-day puzzle streak safe`, text: 'It lives only in this browser. Sign up free and it follows you to every device.' }
  if (reviews >= NUDGE_REVIEWS && !dismissed.includes('reviews'))
    return { kind: 'reviews', title: `Your ${reviews} reviews live only in this browser`, text: 'Sign up free to keep them, and your puzzle rating, on every device.' }
  return null
}

export function dismissedNudges(): GuestNudgeKind[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((k): k is GuestNudgeKind => k === 'streak' || k === 'reviews') : []
  } catch {
    return []
  }
}

export function dismissNudge(kind: GuestNudgeKind): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...dismissedNudges(), kind])]))
  } catch {
    // Shows again next visit; harmless.
  }
}
