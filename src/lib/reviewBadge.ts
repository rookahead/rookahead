// The number on the sidebar's Game review: your games from the last week not reviewed yet. Home works it out (it has
// your games and reviews, and stays mounted once opened); the sidebar shows it.
import { useSyncExternalStore } from 'react'

let count = 0
const listeners = new Set<() => void>()

export function setReviewBadge(n: number): void {
  if (n === count) return
  count = n
  listeners.forEach((l) => l())
}

export function useReviewBadge(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => count,
  )
}
