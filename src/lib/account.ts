// Accounts: signing in through Supabase (Google, or an email with a link and a code) and keeping
// the synced stores in step with the account. The Supabase client loads only once it's needed.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { avatarBlob } from './avatar'
import { googleAuthUrl, randomHex, readGoogleReturn, sha256Hex } from './googleSignIn'
import { afterSignIn, navigate } from './router'
import { forgetLocal, syncOnce, type Remote } from './sync'
import { readMeta, setChangeHook, storesReplaced, SYNCED } from './syncBus'
import type { StoreKey } from './syncMerge'

const SUPABASE_URL: string | undefined = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY: string | undefined = import.meta.env.VITE_SUPABASE_KEY
/** Off when the build has no Supabase project: no sign-up UI at all. */
export const ACCOUNTS_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY)
const AUTH_KEY = 'rookahead.auth'
/** Sign-in callbacks put these in the address; they're removed once read. */
const CALLBACK_PARAMS = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description']
const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID
/** Where Google sends people back. Each host here has <host>/auth/google registered in the Google client. */
const GOOGLE_RETURN_PATH = '/auth/google'
const GOOGLE_HOSTS = ['rookahead.com', 'www.rookahead.com', 'localhost', 'signup.rookahead.pages.dev']
/** A Google sign-in in progress (this tab): its state, raw nonce and the page to come back to. */
const GOOGLE_PENDING_KEY = 'rookahead.googleSignIn'
/** The username asked for on Register, kept across the trip to Google or the email. */
const PENDING_USERNAME_KEY = 'rookahead.pendingUsername'
/** The signed-in account's username and photo, kept so a reload shows them at once instead of waiting for the server. */
const USERNAME_KEY = 'rookahead.username'

interface CachedProfile {
  id?: string
  username?: string
  avatarUrl?: string | null
}

function readProfileCache(): CachedProfile | null {
  try {
    return JSON.parse(localStorage.getItem(USERNAME_KEY) ?? 'null') as CachedProfile | null
  } catch {
    return null
  }
}

function cachedProfile(id: string): { username: string | null; avatarUrl: string | null } {
  const saved = readProfileCache()
  if (saved?.id !== id) return { username: null, avatarUrl: null }
  return { username: typeof saved.username === 'string' ? saved.username : null, avatarUrl: typeof saved.avatarUrl === 'string' ? saved.avatarUrl : null }
}

function rememberedSignIn(): { username: string | null; avatarUrl: string | null } | null {
  if (!ACCOUNTS_ENABLED) return null
  try {
    if (localStorage.getItem(AUTH_KEY) === null) return null
  } catch {
    return null
  }
  const saved = readProfileCache()
  return saved?.id ? cachedProfile(saved.id) : { username: null, avatarUrl: null }
}

/** Remembers the account's username and photo on this device; no id forgets them. */
function cacheProfile(id: string | undefined, profile?: { username: string | null; avatarUrl: string | null }) {
  try {
    if (id && profile?.username) localStorage.setItem(USERNAME_KEY, JSON.stringify({ id, ...profile }))
    else localStorage.removeItem(USERNAME_KEY)
  } catch {
    // Not remembered: the next reload waits for the server again.
  }
}

export interface Account {
  id: string
  email: string
  name: string
  /** The username given when registering by email, until it's claimed. */
  requestedUsername?: string
  /** Signs in with a password (registered by email, or set one later); Google-only accounts don't. */
  hasPassword: boolean
}

export interface AccountState {
  status: 'guest' | 'loading' | 'signed-in'
  account: Account | null
  /** The account's username; null until it's loaded or chosen. */
  username: string | null
  /** The profile photo uploaded here; null shows the username's first letter. */
  avatarUrl: string | null
  /** Signed in without a username yet: the account page asks for one. */
  needsUsername: boolean
  sync: 'synced' | 'syncing' | 'offline'
  /** A sign-in that came back with an error, for the account page to show. */
  error: string | null
}

/** Arriving back from Google or a sign-in link: a sign-in is about to finish. */
function signInReturning(): boolean {
  if (!ACCOUNTS_ENABLED || typeof location === 'undefined') return false
  const params = new URLSearchParams(location.search)
  return location.pathname === GOOGLE_RETURN_PATH || CALLBACK_PARAMS.some((p) => params.has(p))
}

/** Back on Sign in or Register from a sign-in link (or Google through Supabase): before anything is drawn,
 * the address becomes the page you were headed for, sign-in params and all (Supabase reads them from any
 * page), so the account page never shows. `landedOn` is that account page, for showing a failure. */
let landedOn: string | null = null
if (ACCOUNTS_ENABLED && typeof location !== 'undefined' && /^\/(login|signup)\/?$/.test(location.pathname)) {
  const url = new URL(location.href)
  const callback = CALLBACK_PARAMS.filter((p) => url.searchParams.has(p)).map((p) => [p, url.searchParams.get(p)!] as const)
  if (callback.length) {
    callback.forEach(([p]) => url.searchParams.delete(p))
    landedOn = url.pathname + url.search
    const to = new URL(afterSignIn(landedOn), location.origin)
    callback.forEach(([p, v]) => to.searchParams.set(p, v))
    history.replaceState(history.state, '', to.pathname + to.search + url.hash)
  }
}

// A device with a saved sign-in starts as "loading" with the remembered username, so the first frame
// already greets the right person (the session itself is restored a moment later). So does a return
// from Google, so its first frame isn't a guest's sign-in form.
const remembered = rememberedSignIn()
let state: AccountState = {
  status: remembered || signInReturning() ? 'loading' : 'guest',
  account: null,
  username: remembered?.username ?? null,
  avatarUrl: remembered?.avatarUrl ?? null,
  needsUsername: false,
  sync: 'synced',
  error: null,
}
const listeners = new Set<() => void>()
function setState(patch: Partial<AccountState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Opens the account page (Register or Sign in), coming back here afterwards. */
export function openAccountPage(tab: 'signup' | 'login' = 'signup'): void {
  const here = location.pathname + location.search + location.hash
  navigate(`/${tab}${here === '/' ? '' : `?next=${encodeURIComponent(here)}`}`)
}

export const clearAccountError = () => state.error && setState({ error: null })

/** A Google sign-in is being handed to Supabase. Supabase reports "no session" as it starts up, before
 * that lands; it isn't a sign-out, so it mustn't turn the page back into a guest's. */
let finishingSignIn = false

let clientPromise: Promise<SupabaseClient> | null = null
export function client(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const c = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { flowType: 'pkce', storageKey: AUTH_KEY, detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    })
    // Supabase asks that nothing awaits inside this callback, so the work runs just after it.
    c.auth.onAuthStateChange((_event, session) => {
      if (session || !finishingSignIn) setTimeout(() => applySession(session))
    })
    return c
  })
  return clientPromise
}

/** Fetches the client ahead of a likely sign-in (the account page opening), so buttons respond at once. */
export const preloadAccounts = () => void (ACCOUNTS_ENABLED && client())

function accountFrom(session: Session): Account {
  const { id, email = '', user_metadata: meta = {}, app_metadata: app = {} } = session.user
  const name: unknown = meta.full_name ?? meta.name
  const providers: unknown = app.providers
  return {
    id,
    email,
    name: typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0],
    requestedUsername: typeof meta.username === 'string' ? meta.username : undefined,
    hasPassword: meta.has_password === true || (Array.isArray(providers) ? providers.includes('email') : app.provider === 'email'),
  }
}

function applySession(session: Session | null) {
  if (!session) {
    setChangeHook(undefined)
    if (state.status !== 'guest') setState({ status: 'guest', account: null, username: null, avatarUrl: null, needsUsername: false, sync: 'synced' })
    return
  }
  const account = accountFrom(session)
  const isNew = state.account?.id !== account.id
  setState(isNew ? { status: 'signed-in', account, ...cachedProfile(account.id), needsUsername: false, error: null } : { status: 'signed-in', account })
  setChangeHook(() => scheduleSync())
  watchForSync()
  if (isNew) {
    void runSync()
    void loadUsername(account.id)
  }
}

/** The account's username; a new account claims the one asked for on Register, if it's still free. */
async function loadUsername(id: string) {
  const c = await client()
  const { data } = await c.from('profiles').select('username, avatar_url').eq('id', id).maybeSingle()
  if (state.account?.id !== id) return
  if (data) {
    const profile = { username: data.username as string, avatarUrl: (data.avatar_url as string | null) ?? null }
    cacheProfile(id, profile)
    return setState({ ...profile, needsUsername: false })
  }
  let pending: string | null = null
  try {
    pending = localStorage.getItem(PENDING_USERNAME_KEY)
  } catch {
    // Nothing remembered: ask.
  }
  // Registered by email and confirmed elsewhere: the username travelled with the account.
  pending ??= state.account.requestedUsername ?? null
  const problem = pending ? await chooseUsername(pending) : null
  if (pending && !problem) return
  setState({ needsUsername: true, error: problem })
}

/** Whether a username is free; null when the server can't be asked. */
export async function usernameFree(name: string): Promise<boolean | null> {
  const c = await client()
  const { data, error } = await c.rpc('username_available', { name })
  return error ? null : data === true
}

/** Gives the signed-in account its username. Returns an error message, or null. */
export async function chooseUsername(name: string): Promise<string | null> {
  const c = await client()
  const { error } = await c.from('profiles').insert({ username: name })
  try {
    localStorage.removeItem(PENDING_USERNAME_KEY)
  } catch {
    // Fine.
  }
  if (error?.code === '23505') {
    // Taken by someone else, or this account already has one (another tab): find out which.
    const { data } = await c.from('profiles').select('username').maybeSingle()
    if (data) {
      cacheProfile(state.account?.id, { username: data.username, avatarUrl: state.avatarUrl })
      setState({ username: data.username, needsUsername: false })
      return null
    }
    return `“${name}” is taken. Try another.`
  }
  if (error?.code === '23514') return 'That username isn’t allowed.'
  if (error) return error.message
  cacheProfile(state.account?.id, { username: name, avatarUrl: state.avatarUrl })
  setState({ username: name, needsUsername: false })
  return null
}

/** Renames the signed-in account. Returns an error message, or null. */
export async function changeUsername(name: string): Promise<string | null> {
  const id = state.account?.id
  if (!id) return 'Sign in to change your username.'
  const c = await client()
  const { error } = await c.from('profiles').update({ username: name }).eq('id', id)
  if (error?.code === '23505') return `“${name}” is taken. Try another.`
  if (error?.code === '23514') return 'That username isn’t allowed.'
  if (error?.code === '42501') return 'Usernames can’t be changed yet. Try again soon.'
  if (error) return error.message
  cacheProfile(id, { username: name, avatarUrl: state.avatarUrl })
  setState({ username: name })
  return null
}

let watching = false
/** Syncs when the tab comes back, when it's left with changes, and when the connection returns. */
function watchForSync() {
  if (watching) return
  watching = true
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPass > 30_000) void runSync()
    // Leaving: push now rather than in 2 s, while the page is surely still running.
    if (document.visibilityState === 'hidden' && Object.keys(readMeta().dirty).length) void runSync()
  })
  window.addEventListener('online', () => void runSync())
}

/** Reads the address once for a sign-in callback. A device that's signed in gets its session. */
let started = false
export async function startAccounts(): Promise<void> {
  if (!ACCOUNTS_ENABLED || started) return
  started = true
  if (location.pathname === GOOGLE_RETURN_PATH) return finishGoogle()
  const params = new URLSearchParams(location.search)
  const callback = CALLBACK_PARAMS.some((p) => params.has(p))
  let signedIn = false
  try {
    signedIn = localStorage.getItem(AUTH_KEY) !== null
  } catch {
    // No storage: no session either.
  }
  if (!callback && !signedIn) return
  setState({ status: 'loading' })
  const c = await client()
  const { data, error } = await c.auth.getSession()
  if (callback) {
    const url = new URL(location.href)
    CALLBACK_PARAMS.forEach((p) => url.searchParams.delete(p))
    history.replaceState(history.state, '', url)
    if (!data.session) setState({ error: callbackError(params.get('error_description') ?? error?.message ?? '') })
  }
  applySession(data.session)
  // It didn't work: back to the account page this came from, which says why.
  if (callback && !data.session && landedOn) navigate(landedOn, { replace: true })
}

/** Back from Google: hand its ID token to Supabase. The page you were headed for opens at once (signing in
 * shows there); only a failure goes back to the account page, to say what went wrong. */
async function finishGoogle(): Promise<void> {
  const returned = readGoogleReturn(location.hash)
  let pending: { state: string; nonce: string; back: string } | null = null
  try {
    pending = JSON.parse(sessionStorage.getItem(GOOGLE_PENDING_KEY) ?? 'null')
    sessionStorage.removeItem(GOOGLE_PENDING_KEY)
  } catch {
    // Nothing to go on.
  }
  const back = pending?.back.startsWith('/') ? pending.back : '/login'
  setState({ status: 'loading' })
  navigate(afterSignIn(back), { replace: true })
  finishingSignIn = true
  const c = await client()
  let error: string | null = null
  if (!returned || !pending || returned.state !== pending.state) {
    error = 'Google sign-in didn’t finish. Try again.'
  } else if ('error' in returned) {
    error = returned.error === 'access_denied' ? 'Sign-in was cancelled.' : `Google said: ${returned.error}`
  } else {
    const result = await c.auth.signInWithIdToken({ provider: 'google', token: returned.idToken, nonce: pending.nonce })
    error = result.error?.message ?? null
  }
  const { data } = await c.auth.getSession()
  finishingSignIn = false
  applySession(data.session)
  if (error && !data.session) {
    setState({ error })
    navigate(back, { replace: true })
  }
}

function callbackError(message: string): string {
  if (/expired|invalid/i.test(message)) return 'That sign-in link has expired or was already used. Ask for a new one.'
  if (/access_denied|denied/i.test(message)) return 'Sign-in was cancelled.'
  // A link opened in another browser can't finish (PKCE: the code verifier stays where you asked).
  return message && !/code verifier/i.test(message)
    ? message
    : 'That link didn’t work here: it works once, in the browser where you asked for it. Type the code from the email there, or ask for a new email here.'
}

function supabaseRemote(c: SupabaseClient, userId: string): Remote {
  const table = () => c.from('user_stores')
  return {
    async revs() {
      const { data, error } = await table().select('key, rev')
      if (error) throw error
      return Object.fromEntries((data as { key: StoreKey; rev: number }[]).map((r) => [r.key, r.rev]))
    },
    async get(key) {
      const { data, error } = await table().select('data, rev, updated_at').eq('key', key).maybeSingle()
      if (error) throw error
      return data && { data: data.data, rev: data.rev, updatedAt: Date.parse(data.updated_at) }
    },
    async insert(key, data) {
      const { error } = await table().insert({ key, data })
      if (error?.code === '23505') return false // Another device inserted it first.
      if (error) throw error
      return true
    },
    async update(key, data, baseRev) {
      const { data: rows, error } = await table()
        .update({ data, rev: baseRev + 1, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('key', key)
        .eq('rev', baseRev)
        .select('rev')
      if (error) throw error
      return rows.length === 1
    },
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false
let lastPass = 0

function scheduleSync(delay = 2000) {
  clearTimeout(timer)
  timer = setTimeout(() => void runSync(), delay)
}

/** One pass now (or straight after the one running). */
async function runSync(): Promise<void> {
  const account = state.account
  if (!account) return
  if (running) {
    again = true
    return running
  }
  clearTimeout(timer)
  setState({ sync: 'syncing' })
  running = (async () => {
    try {
      const changed = await syncOnce(supabaseRemote(await client(), account.id), account.id)
      lastPass = Date.now()
      storesReplaced(changed)
      setState({ sync: 'synced' })
    } catch {
      setState({ sync: 'offline' })
    }
  })()
  await running
  running = null
  if (again) {
    again = false
    await runSync()
  }
}

/** Sign-ins come back to this page (the account page, with its ?next). */
const returnUrl = () => location.origin + location.pathname + location.search

export async function signInWithGoogle(): Promise<string | null> {
  if (GOOGLE_CLIENT_ID && GOOGLE_HOSTS.includes(location.hostname)) {
    const nonce = randomHex()
    const state = randomHex(16)
    try {
      sessionStorage.setItem(GOOGLE_PENDING_KEY, JSON.stringify({ state, nonce, back: location.pathname + location.search }))
    } catch {
      return 'Your browser is blocking storage, which signing in needs.'
    }
    location.assign(googleAuthUrl({ clientId: GOOGLE_CLIENT_ID, redirectUri: location.origin + GOOGLE_RETURN_PATH, nonce: await sha256Hex(nonce), state }))
    return null
  }
  // Elsewhere (other previews): Supabase's own Google sign-in.
  const c = await client()
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } })
  return error?.message ?? null
}

export const PASSWORD_MIN = 8

/** Supabase's messages, in our words. */
function authMessage(error: { message: string; status?: number; code?: string }): string {
  const text = `${error.code ?? ''} ${error.message}`
  if (error.status === 429 || /rate limit/i.test(text)) return 'Too many tries for now. Wait a minute and try again.'
  if (/invalid.?credentials|invalid login/i.test(text)) return 'Wrong email or password.'
  if (/otp_expired|token has expired|expired or is invalid/i.test(text)) return 'That code is wrong or has expired.'
  if (/weak_password|password should/i.test(text)) return `Use a stronger password: at least ${PASSWORD_MIN} characters.`
  if (/same_password|should be different/i.test(text)) return 'That’s your current password. Choose a new one.'
  return error.message
}

export type RegisterResult = { error: string } | { confirm: true } | { exists: true }

/** Makes an email account. Supabase then emails a code (and link) to confirm the address; the username comes after. */
export async function registerWithEmail(email: string, password: string): Promise<RegisterResult> {
  const c = await client()
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: returnUrl() } })
  if (error) return /already registered|user_already_exists/i.test(`${error.code} ${error.message}`) ? { exists: true } : { error: authMessage(error) }
  // An address that already has an account comes back as a user with no identities (so nobody
  // can probe which emails are registered); no email is sent.
  if (data.user && data.user.identities?.length === 0) return { exists: true }
  return { confirm: true }
}

/** The 6-digit code from the confirmation email: confirms the address and signs in. */
export async function confirmEmail(email: string, code: string): Promise<string | null> {
  const c = await client()
  const { error } = await c.auth.verifyOtp({ email, token: code, type: 'signup' })
  return error ? authMessage(error) : null
}

export async function resendConfirmation(email: string): Promise<string | null> {
  const c = await client()
  const { error } = await c.auth.resend({ type: 'signup', email, options: { emailRedirectTo: returnUrl() } })
  return error ? authMessage(error) : null
}

/** Signs in with email and password. `unconfirmed`: the address still needs its code. */
export async function signInWithPassword(email: string, password: string): Promise<{ error: string; unconfirmed?: boolean } | null> {
  const c = await client()
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (!error) return null
  if (/email.?not.?confirmed/i.test(`${error.code} ${error.message}`)) return { error: 'Confirm your email first: enter the code we sent you.', unconfirmed: true }
  return { error: authMessage(error) }
}

/** Emails a code (and a link to /reset-password) for choosing a new password. */
export async function sendPasswordReset(email: string): Promise<string | null> {
  const c = await client()
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password${location.search}` })
  return error ? authMessage(error) : null
}

/** The code from the reset email plus a new password: signs in with the new password set. */
export async function resetPasswordWithCode(email: string, code: string, password: string): Promise<string | null> {
  const c = await client()
  const { error } = await c.auth.verifyOtp({ email, token: code, type: 'recovery' })
  if (error) return authMessage(error)
  return setPassword(password)
}

/** Sets the signed-in account's password (after a reset link, or a reset code). */
export async function setPassword(password: string): Promise<string | null> {
  const c = await client()
  // The flag remembers it for a Google account, whose providers list stays just Google.
  const { error } = await c.auth.updateUser({ password, data: { has_password: true } })
  if (error) return authMessage(error)
  // A Google account that just set one can now sign in with its email too.
  if (state.account && !state.account.hasPassword) setState({ account: { ...state.account, hasPassword: true } })
  return null
}

/** Whether this device has changes the account doesn't have yet. */
export const hasUnsynced = () => Object.keys(readMeta().dirty).length > 0

/** Logs out on this device. Its copies of the account's data go too; the account keeps them. */
export async function logOut(): Promise<void> {
  await runSync()
  const c = await client()
  await c.auth.signOut({ scope: 'local' })
  leave()
}

/** Deletes the account and everything in it. */
export async function deleteAccount(): Promise<string | null> {
  const c = await client()
  // Storage files don't go with the user row: remove the photo first.
  if (state.account) await c.storage.from(AVATARS).remove([avatarPath(state.account.id)])
  const { error } = await c.rpc('delete_account')
  if (error) return error.message
  await c.auth.signOut({ scope: 'local' })
  leave()
  return null
}

function leave() {
  setChangeHook(undefined)
  cacheProfile(undefined)
  forgetLocal()
  storesReplaced(SYNCED)
  setState({ status: 'guest', account: null, username: null, avatarUrl: null, needsUsername: false, sync: 'synced' })
}

const AVATARS = 'avatars'
const avatarPath = (id: string) => `${id}/avatar.webp`

/** Uploads a picked image as the profile photo. Returns an error message, or null. */
export async function uploadAvatar(file: File): Promise<string | null> {
  const id = state.account?.id
  if (!id) return 'Sign in to add a photo.'
  let blob: Blob
  try {
    blob = await avatarBlob(file)
  } catch (err) {
    return err instanceof Error ? err.message : 'Couldn’t read that image.'
  }
  const c = await client()
  const path = avatarPath(id)
  const { error } = await c.storage.from(AVATARS).upload(path, blob, { upsert: true, contentType: 'image/webp', cacheControl: '31536000' })
  if (error) return 'Couldn’t upload the photo. Try again in a moment.'
  // Same file name every time; ?v= makes each upload a new address, so caches can keep it for good.
  const avatarUrl = `${c.storage.from(AVATARS).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
  return saveAvatarUrl(id, avatarUrl)
}

/** Back to the username's letter. Returns an error message, or null. */
export async function removeAvatar(): Promise<string | null> {
  const id = state.account?.id
  if (!id) return null
  const c = await client()
  await c.storage.from(AVATARS).remove([avatarPath(id)])
  return saveAvatarUrl(id, null)
}

async function saveAvatarUrl(id: string, avatarUrl: string | null): Promise<string | null> {
  const c = await client()
  const { error } = await c.from('profiles').update({ avatar_url: avatarUrl }).eq('id', id)
  if (error) return 'Couldn’t save the photo to your account.'
  if (state.account?.id === id) {
    cacheProfile(id, { username: state.username, avatarUrl })
    setState({ avatarUrl })
  }
  return null
}
