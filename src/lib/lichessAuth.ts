import { useSyncExternalStore } from 'react'
import { inApp } from './install'
import { appReturnUrl, openInBrowser } from './nativeApp'
import { navigate } from './router'

// Connect Lichess: you sign in on lichess.org itself (OAuth with PKCE, made for apps with no server of their
// own), and Lichess hands back a token that stays in this browser only. Rookahead never sees your password,
// and the token never reaches our database. It opens Lichess's opening explorer (which wants a signed-in
// player) and online play, which goes through Lichess's Board API (the board:play permission).

const LICHESS = 'https://lichess.org'
/** Lichess asks for any name that's ours; it shows on its "allow access" page. */
const CLIENT_ID = 'rookahead.com'
export const LICHESS_RETURN_PATH = '/connect/lichess'
const KEY = 'rookahead.lichess'
const PENDING_KEY = 'rookahead.lichess.pending'

/** What Rookahead asks Lichess to allow: playing games for you (Board API). The explorer needs no permission. */
export const LICHESS_SCOPES = ['board:play']

export interface LichessLink {
  username: string
  token: string
  /** The permissions it was given; a connection from before online play has none. */
  scopes: string[]
}

/** Whether the connection can play games (connected before online play, it can't until you allow it again). */
export const canPlay = (link: LichessLink | null) => Boolean(link?.scopes.includes('board:play'))

interface State {
  link: LichessLink | null
  /** Connecting: on the way to Lichess, or back and finishing. */
  busy: boolean
  error: string | null
}

function saved(): LichessLink | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return raw && typeof raw.token === 'string' && typeof raw.username === 'string'
      ? { token: raw.token, username: raw.username, scopes: Array.isArray(raw.scopes) ? raw.scopes.filter((x: unknown) => typeof x === 'string') : [] }
      : null
  } catch {
    return null
  }
}

let state: State = { link: typeof localStorage === 'undefined' ? null : saved(), busy: false, error: null }
const listeners = new Set<() => void>()
function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function keep(link: LichessLink | null) {
  try {
    if (link) localStorage.setItem(KEY, JSON.stringify(link))
    else localStorage.removeItem(KEY)
  } catch {
    // Not kept past this visit; fine.
  }
  setState({ link })
}

/** Your Lichess connection, and whether one is being made. */
export function useLichess(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const lichessNow = () => state.link

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)))

/** Sends you to Lichess to allow Rookahead, coming back to the page you're on. Returns an error message, or null. */
export async function connectLichess(): Promise<string | null> {
  const verifier = random(48)
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const stateToken = random(16)
  // In the Android app, Lichess opens in a Chrome tab; its return is marked so this site hands it on to the app.
  const redirectUri = inApp() ? await appReturnUrl(location.origin + LICHESS_RETURN_PATH) : location.origin + LICHESS_RETURN_PATH
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state: stateToken, redirectUri, back: location.pathname + location.search, scopes: LICHESS_SCOPES }))
  } catch {
    return 'Your browser is blocking storage, which connecting needs.'
  }
  const url = new URL(`${LICHESS}/oauth`)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: LICHESS_SCOPES.join(' '),
    state: stateToken,
  }).toString()
  setState({ busy: true, error: null })
  if (!(await openInBrowser(url.href))) location.assign(url.href)
  // The app's Chrome tab closed: either the return arrived (finishing now), or it was given up.
  else if (!sessionStorage.getItem(PENDING_KEY)?.includes(stateToken)) return null
  else setState({ busy: false })
  return null
}

/** Whether an address is Lichess coming back from Connect. */
export const isLichessReturn = (pathname: string) => pathname.replace(/\/$/, '') === LICHESS_RETURN_PATH

/** Back from Lichess (at `path`, with its code or error): takes you back where you were and finishes connecting. */
export async function finishLichess(path: string): Promise<void> {
  const url = new URL(path, location.origin)
  let pending: { verifier: string; state: string; redirectUri: string; back: string; scopes?: string[] } | null = null
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null')
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Treated as no connect in progress.
  }
  navigate(pending?.back && pending.back.startsWith('/') ? pending.back : '/', { replace: true })
  const code = url.searchParams.get('code')
  if (!pending || url.searchParams.get('state') !== pending.state) return setState({ busy: false, error: pending ? 'Connecting didn’t finish. Try again.' : null })
  if (!code) return setState({ busy: false, error: url.searchParams.get('error') === 'access_denied' ? null : 'Lichess didn’t connect. Try again.' })
  setState({ busy: true, error: null })
  try {
    const res = await fetch(`${LICHESS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri, client_id: CLIENT_ID }),
    })
    if (!res.ok) throw new Error(`token ${res.status}`)
    const { access_token: token } = (await res.json()) as { access_token?: string }
    if (!token) throw new Error('no token')
    const me = await fetch(`${LICHESS}/api/account`, { headers: { Authorization: `Bearer ${token}` } })
    if (!me.ok) throw new Error(`account ${me.status}`)
    const { username } = (await me.json()) as { username?: string }
    if (!username) throw new Error('no username')
    keep({ token, username, scopes: pending.scopes ?? [] })
    setState({ busy: false })
  } catch {
    setState({ busy: false, error: 'Couldn’t finish connecting to Lichess. Try again.' })
  }
}

/** Disconnects: Lichess forgets the token, and so does this browser. */
export async function disconnectLichess(): Promise<void> {
  const link = state.link
  keep(null)
  setState({ error: null })
  if (!link) return
  try {
    await fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${link.token}` } })
  } catch {
    // Offline: the token stays valid on Lichess until it expires, but nothing here has it any more.
  }
}

/** Lichess turned the token down (revoked there, or expired): connect again. */
export function lichessTokenRefused() {
  keep(null)
  setState({ error: 'Your Lichess connection ended. Connect again to keep using it.' })
}
