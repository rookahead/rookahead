// Finished reviews, kept in the browser so the home page can show accuracy and reopen a game
// instantly. Each entry holds the review as a share-link token (~0.5 KB).
import type { Color } from './evaluation'
import { isChesscomUrl } from './chesscom'
import { isLichessUrl } from './lichess'
import { markChanged, STORE_KEYS } from './syncBus'
import type { MoveNode, PgnHeaders } from './tree'

export interface CachedReview {
  /** Share-link token: the game and its review. */
  token: string
  white: string
  black: string
  accuracy: Record<Color, number | null>
  brilliant: Record<Color, number>
  /** When it was saved (ms). */
  at: number
}

const KEY = STORE_KEYS.reviews
export const REVIEWS_LIMIT = 300

const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

/** Chess.com and Lichess games are keyed by their URL; anything else by a hash of its moves. */
export function gameKey(headers: PgnHeaders, line: MoveNode[]): string {
  if (headers.Link && isChesscomUrl(headers.Link)) return headers.Link
  if (headers.Site && isLichessUrl(headers.Site)) return headers.Site
  let h = 0x811c9dc5 // FNV-1a
  for (const ch of line[0].fen + ' ' + line.slice(1).map((n) => n.uci).join(' ')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return 'pgn:' + h.toString(16).padStart(8, '0')
}

export function loadReviews(storage = defaultStorage()): Record<string, CachedReview> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, CachedReview>) : {}
  } catch {
    return {}
  }
}

export function saveReview(key: string, entry: CachedReview, storage = defaultStorage()): void {
  try {
    const all = { ...loadReviews(storage), [key]: entry }
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at)
    const kept = Object.fromEntries(keys.slice(0, REVIEWS_LIMIT).map((k) => [k, all[k]]))
    storage?.setItem(KEY, JSON.stringify(kept))
    markChanged('reviews', storage)
  } catch {
    // Storage full or unavailable: the review just won't be remembered.
  }
}
