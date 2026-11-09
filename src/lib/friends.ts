import { useSyncExternalStore } from 'react'
import { accountNow, client, subscribeAccount } from './account'

// Friends: you add someone by their Rookahead username, they accept, and you're friends until either of you
// removes it. Friends see each other's username, photo, Lichess username and when they last opened Rookahead,
// and can send each other games. Everything goes through the database's own functions (supabase/schema.sql:
// request_friend, my_friends, my_inbox), so nobody reads another account's rows.

export interface Friend {
  /** The friendship (or request). */
  id: number
  userId: string
  username: string
  avatarUrl: string | null
  /** Their Lichess username, once you're friends and they've connected Lichess. */
  lichess: string | null
  status: 'pending' | 'accepted'
  /** A request to you (pending), rather than one you sent. */
  incoming: boolean
  since: number
  /** When they last opened Rookahead (friends only). */
  activeAt: number | null
}

export interface InboxGame {
  id: number
  from: string
  fromAvatar: string | null
  /** A share-link token: the game, with its review when it had one. */
  token: string
  ply: number | null
  title: string
  note: string
  at: number
  seen: boolean
}

export type RequestResult = 'sent' | 'accepted' | 'already' | 'self' | 'not-found' | 'busy' | 'error'

interface State {
  friends: Friend[]
  inbox: InboxGame[]
  /** Not asked yet (or signed out). */
  loaded: boolean
}

let state: State = { friends: [], inbox: [], loaded: false }
const listeners = new Set<() => void>()
const setState = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

const time = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : NaN)

/** Asks the database for your friends and the games they sent you. */
export async function refreshFriends(): Promise<void> {
  if (accountNow().status !== 'signed-in') return setState({ friends: [], inbox: [], loaded: false })
  try {
    const c = await client()
    const [f, g] = await Promise.all([c.rpc('my_friends'), c.rpc('my_inbox')])
    if (f.error || g.error) return
    setState({
      loaded: true,
      friends: ((f.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id),
        userId: String(r.user_id),
        username: String(r.username),
        avatarUrl: (r.avatar_url as string | null) ?? null,
        lichess: (r.lichess as string | null) ?? null,
        status: r.status === 'accepted' ? 'accepted' : 'pending',
        incoming: r.incoming === true,
        since: time(r.since),
        activeAt: Number.isNaN(time(r.active_at)) ? null : time(r.active_at),
      })),
      inbox: ((g.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id),
        from: String(r.sender_name),
        fromAvatar: (r.sender_avatar as string | null) ?? null,
        token: String(r.token),
        ply: typeof r.ply === 'number' ? r.ply : null,
        title: String(r.title ?? ''),
        note: String(r.note ?? ''),
        at: time(r.created_at),
        seen: r.seen_at != null,
      })),
    })
  } catch {
    // Offline: keep what's shown.
  }
}

/** Kept up to date while the app is open: on sign-in, when the tab comes back, and every couple of minutes. */
let started = false
const POLL_MS = 120_000
function start() {
  if (started || typeof window === 'undefined') return
  started = true
  subscribeAccount(() => void refreshFriends())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void refreshFriends())
  setInterval(() => document.visibilityState === 'visible' && void refreshFriends(), POLL_MS)
  void refreshFriends()
}

export function useFriends(): State {
  start()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Requests to you and games you haven't opened: the dot by your avatar. */
export const unseenCount = (s: State) => s.friends.filter((f) => f.status === 'pending' && f.incoming).length + s.inbox.filter((g) => !g.seen).length

export async function requestFriend(name: string): Promise<RequestResult> {
  try {
    const c = await client()
    const { data, error } = await c.rpc('request_friend', { name: name.trim().replace(/^@/, '') })
    if (error) return 'error'
    void refreshFriends()
    return (['sent', 'accepted', 'already', 'self', 'not-found', 'busy'] as const).find((r) => r === data) ?? 'error'
  } catch {
    return 'error'
  }
}

export async function acceptFriend(id: number): Promise<boolean> {
  try {
    const c = await client()
    const { error } = await c.from('friendships').update({ status: 'accepted' }).eq('id', id)
    void refreshFriends()
    return !error
  } catch {
    return false
  }
}

/** Declines a request, cancels yours, or ends a friendship. */
export async function removeFriend(id: number): Promise<boolean> {
  setState({ friends: state.friends.filter((f) => f.id !== id) })
  try {
    const c = await client()
    const { error } = await c.from('friendships').delete().eq('id', id)
    void refreshFriends()
    return !error
  } catch {
    return false
  }
}

/** Sends a friend a game. Returns an error message, or null. */
export async function sendGame(to: Friend, game: { token: string; ply: number | null; title: string; note: string }): Promise<string | null> {
  try {
    const c = await client()
    const { error } = await c.from('shared_games').insert({ recipient: to.userId, token: game.token, ply: game.ply, title: game.title.slice(0, 120), note: game.note.trim().slice(0, 280) })
    if (error?.code === 'P0001') return 'You’ve sent a lot of games this hour. Try again later.'
    if (error?.code === '42501') return `You and ${to.username} aren’t friends any more.`
    return error ? 'Couldn’t send it. Check your connection and try again.' : null
  } catch {
    return 'Couldn’t send it. Check your connection and try again.'
  }
}

export async function markSeen(id: number): Promise<void> {
  setState({ inbox: state.inbox.map((g) => (g.id === id ? { ...g, seen: true } : g)) })
  try {
    const c = await client()
    await c.from('shared_games').update({ seen_at: new Date().toISOString() }).eq('id', id)
  } catch {
    // It shows as new again next time; fine.
  }
}

export async function deleteInboxGame(id: number): Promise<void> {
  setState({ inbox: state.inbox.filter((g) => g.id !== id) })
  try {
    const c = await client()
    await c.from('shared_games').delete().eq('id', id)
  } catch {
    // Comes back next refresh; fine.
  }
}

/** Puts your Lichess username on your account (or takes it off), so friends can challenge you there. */
export async function shareLichessName(name: string | null): Promise<void> {
  const id = accountNow().account?.id
  if (!id) return
  try {
    const c = await client()
    await c.from('profiles').update({ lichess: name }).eq('id', id)
  } catch {
    // Tried again next time the app opens.
  }
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "Active 5 minutes ago", "Active yesterday". */
export function activeText(at: number | null, now = Date.now()): string {
  if (!at) return 'Not seen yet'
  const mins = Math.round((now - at) / 60000)
  if (mins < 15) return 'Active now'
  if (mins < 60) return `Active ${RELATIVE.format(-mins, 'minute')}`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `Active ${RELATIVE.format(-hours, 'hour')}`
  return `Active ${RELATIVE.format(-Math.round(hours / 24), 'day')}`
}
