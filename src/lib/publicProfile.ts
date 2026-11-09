import { useSyncExternalStore } from 'react'
import { accountNow, client, subscribeAccount } from './account'
import { NOTE_MAX } from './reports'

// Public profiles: off until you turn it on. Then anyone with the link (rookahead.com/@you) sees your
// username, photo, when you joined, your ratings (online, that is Lichess, and puzzles) and three counts.
// Never your games, so never anyone else's name. Your app copies the numbers in as they change.

/** What a public profile shows besides your name and photo. */
export interface PublicStats {
  /** Your online (Lichess) ratings, most played first. */
  online: { label: string; rating: number; games: number }[]
  puzzles: { rating: number; solved: number }
  games: number
  reviewed: number
  legendary: number
}

export interface PublicProfile {
  username: string
  avatarUrl: string | null
  joined: number
  stats: PublicStats
}

export type ReportReason = 'name' | 'photo' | 'other'

/** The address of a username's public profile, without the site. */
export const profilePath = (username: string) => `/@${username}`

/** Whether your profile is public: null while it isn't known (signed out, or not asked yet). */
let mine: boolean | null = null
let asked: string | null = null
const listeners = new Set<() => void>()
const setMine = (on: boolean | null) => {
  mine = on
  listeners.forEach((l) => l())
}

async function askMine(id: string) {
  asked = id
  try {
    const c = await client()
    const { data, error } = await c.from('public_profiles').select('id').eq('id', id).maybeSingle()
    if (accountNow().account?.id === id && !error) setMine(Boolean(data))
  } catch {
    // Not known yet: asked again next time the account changes.
    asked = null
  }
}

/** Whether your profile is public (null: not known, or signed out). */
export function usePublicProfile(): boolean | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      const check = () => {
        const id = accountNow().status === 'signed-in' ? accountNow().account?.id : undefined
        if (!id) {
          asked = null
          if (mine !== null) setMine(null)
        } else if (asked !== id) void askMine(id)
      }
      check()
      const stop = subscribeAccount(check)
      return () => {
        listeners.delete(l)
        stop()
      }
    },
    () => mine,
  )
}

/** Turns your public profile on (with these numbers) or off. Returns an error message, or null. */
export async function setPublic(on: boolean, stats?: PublicStats): Promise<string | null> {
  const id = accountNow().account?.id
  if (!id) return 'Sign in first.'
  try {
    const c = await client()
    const { error } = on
      ? await c.from('public_profiles').upsert({ id, stats: stats ?? {}, updated_at: new Date().toISOString() })
      : await c.from('public_profiles').delete().eq('id', id)
    if (error) return on ? 'Couldn’t make your profile public. Try again.' : 'Couldn’t make your profile private. Try again.'
    lastSent = on ? JSON.stringify(stats ?? {}) : null
    setMine(on)
    return null
  } catch {
    return 'Couldn’t reach Rookahead. Check your connection and try again.'
  }
}

let lastSent: string | null = null

/** Brings a public profile's numbers up to date; does nothing when they haven't changed or it isn't public. */
export async function updatePublicStats(stats: PublicStats): Promise<void> {
  const id = accountNow().account?.id
  const json = JSON.stringify(stats)
  if (!id || mine !== true || json === lastSent) return
  lastSent = json
  try {
    const c = await client()
    const { error } = await c.from('public_profiles').update({ stats, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) lastSent = null
  } catch {
    lastSent = null
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0)

/** Reads whatever came back as stats, so a row from an older app (or a broken one) still shows. */
export function readStats(raw: unknown): PublicStats {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const online = Array.isArray(s.online) ? s.online : []
  const puzzles = (s.puzzles && typeof s.puzzles === 'object' ? s.puzzles : {}) as Record<string, unknown>
  return {
    online: online
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object' && typeof (r as Record<string, unknown>).label === 'string')
      .slice(0, 6)
      .map((r) => ({ label: String(r.label).slice(0, 20), rating: num(r.rating), games: num(r.games) })),
    puzzles: { rating: num(puzzles.rating) || 1500, solved: num(puzzles.solved) },
    games: num(s.games),
    reviewed: num(s.reviewed),
    legendary: num(s.legendary),
  }
}

/** Someone's public profile; null when there's none by that name (or it's private), undefined when it couldn't be asked. */
export async function fetchPublicProfile(username: string): Promise<PublicProfile | null | undefined> {
  try {
    const c = await client()
    const { data, error } = await c.rpc('public_profile', { name: username })
    if (error) return undefined
    const row = Array.isArray(data) ? data[0] : null
    if (!row) return null
    return { username: row.username, avatarUrl: row.avatar_url ?? null, joined: Date.parse(row.joined), stats: readStats(row.stats) }
  } catch {
    return undefined
  }
}

/** "Report this profile". Returns an error message, or null. */
export async function reportProfile(username: string, reason: ReportReason, note: string): Promise<string | null> {
  try {
    const c = await client()
    const { error } = await c.from('profile_reports').insert({ username, reason, note: note.trim().slice(0, NOTE_MAX) })
    if (error?.code === 'P0001') return 'Lots of reports are coming in right now. Please try again in a while.'
    return error ? 'Couldn’t send the report. Check your connection and try again.' : null
  } catch {
    return 'Couldn’t send the report. Check your connection and try again.'
  }
}
