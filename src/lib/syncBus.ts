// What the account syncs, and the signals between the stores, the sync pass and the pages.
// Kept free of the Supabase client so stores can import it without loading anything.
import { useSyncExternalStore } from 'react'
import type { StoreKey } from './syncMerge'

/** The localStorage key behind each synced store. */
export const STORE_KEYS: Record<StoreKey, string> = {
  settings: 'rookahead.settings.v2',
  puzzles: 'rookahead.puzzles.v1',
  games: 'rookahead.games.v1',
  reviews: 'rookahead.reviews.v1',
}
export const SYNCED = Object.keys(STORE_KEYS) as StoreKey[]
export const SYNC_KEY = 'rookahead.sync.v1'

export interface SyncMeta {
  /** The account this device's stores belong to; null for a guest. */
  user: string | null
  /** Each store's rev in the account as of the last sync. */
  revs: Partial<Record<StoreKey, number>>
  /** Stores changed here since then, with when (ms). */
  dirty: Partial<Record<StoreKey, number>>
}

const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

export function readMeta(storage = defaultStorage()): SyncMeta {
  try {
    const m = JSON.parse(storage?.getItem(SYNC_KEY) ?? 'null') as Partial<SyncMeta> | null
    if (m && typeof m === 'object') return { user: typeof m.user === 'string' ? m.user : null, revs: { ...m.revs }, dirty: { ...m.dirty } }
  } catch {
    // Unreadable: as if never synced.
  }
  return { user: null, revs: {}, dirty: {} }
}

export function writeMeta(meta: SyncMeta, storage = defaultStorage()): void {
  try {
    storage?.setItem(SYNC_KEY, JSON.stringify(meta))
  } catch {
    // Unavailable: the next pass merges everything again, which is safe.
  }
}

let changeHook: (() => void) | undefined

/** Called (by the account module) after any synced store changes on a signed-in device. */
export function setChangeHook(hook: (() => void) | undefined): void {
  changeHook = hook
}

/** A store was saved on this device: remember it needs pushing. Guests have nothing to push. */
export function markChanged(key: StoreKey, storage = defaultStorage()): void {
  const meta = readMeta(storage)
  if (!meta.user) return
  meta.dirty[key] = Date.now()
  writeMeta(meta, storage)
  changeHook?.()
}

// Each store's version goes up when a sync pass rewrites it, so pages holding it re-read.
const versions: Record<StoreKey, number> = { settings: 0, puzzles: 0, games: 0, reviews: 0 }
const listeners = new Set<() => void>()

export function storesReplaced(keys: StoreKey[]): void {
  if (!keys.length) return
  for (const k of keys) versions[k]++
  listeners.forEach((l) => l())
}

/** Bumps when a sync pass replaces `key` on this device: put it in the deps of whatever reads it. */
export function useStoreVersion(key: StoreKey): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => versions[key],
  )
}
