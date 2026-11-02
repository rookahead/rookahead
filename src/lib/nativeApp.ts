// The Android app (the rookahead-android repo): this site in Android's WebView, inside a Capacitor shell that
// lends it a few things a WebView can't do on its own. The site doesn't bundle Capacitor's own JavaScript, so it
// talks to the shell's plugins through the bridge the shell puts in the page (window.Capacitor).
import { inApp } from './install'

interface Bridge {
  PluginHeaders?: { name: string }[]
  nativePromise(plugin: string, method: string, options?: object): Promise<unknown>
  addListener(plugin: string, event: string, callback: (data: never) => void): { remove(): Promise<void> }
}

const bridge = (): Bridge | null => (inApp() ? ((window as { Capacitor?: Bridge }).Capacitor ?? null) : null)
const has = (plugin: string) => Boolean(bridge()?.PluginHeaders?.some((h) => h.name === plugin))
const call = <T = unknown>(plugin: string, method: string, options: object = {}) => bridge()!.nativePromise(plugin, method, options) as Promise<T>

/**
 * Which app a sign-in goes back to. Each has its own private link (its package name as the scheme): the Play
 * Store app, or Rookahead Preview, a test build installed beside it.
 */
const APPS = { release: 'com.rookahead.app', preview: 'com.rookahead.app.preview' } as const
type AppKind = keyof typeof APPS

let kind: Promise<AppKind> | null = null
const appKind = () =>
  (kind ??= has('App') ? call<{ id: string }>('App', 'getInfo').then((info) => (info.id === APPS.preview ? 'preview' : 'release')) : Promise.resolve('release'))

/** The status bar's and gesture bar's icons: light on a dark page, dark on a light one. */
export function setBarIcons(darkPage: boolean) {
  if (has('SystemBars')) void call('SystemBars', 'setStyle', { style: darkPage ? 'DARK' : 'LIGHT' }).catch(() => {})
}

/** Android's share sheet: the browser's navigator.share where there is one, the app's own otherwise. */
export const canShare = () => typeof navigator.share === 'function' || has('Share')

export function shareLink(data: { title?: string; text?: string; url?: string }): Promise<unknown> {
  return has('Share') ? call('Share', 'share', data) : navigator.share(data)
}

/*
 * Signing in with Google from the app. Google won't sign in inside a WebView, so its page opens in a Chrome tab.
 * The address it comes back to carries a mark (`?app=` or a state ending in `.app-…`), and there this site hands
 * the whole address on to the app's private link (forwardToApp). The app then loads it in its WebView, where the
 * sign-in was started and finishes as it would on the website.
 */

/** In the app: a Google sign-in state carrying the app to come back to. */
export async function appState(state: string): Promise<string> {
  return `${state}.app-${await appKind()}`
}

/** In the app: Supabase's sign-in return address, marked for the app. */
export async function appReturnUrl(url: string): Promise<string> {
  const u = new URL(url)
  u.searchParams.set('app', await appKind())
  return u.href
}

/**
 * In the app: opens an address in a Chrome tab over the app, and settles once that tab has gone (done with, or
 * closed). False when there's no app to do it.
 */
export async function openInBrowser(url: string): Promise<boolean> {
  if (!has('Browser')) return false
  const closed = new Promise<void>((resolve) => {
    const listener = bridge()!.addListener('Browser', 'browserFinished', () => {
      void listener.remove()
      resolve()
    })
  })
  await call('Browser', 'open', { url })
  await closed
  return true
}

/**
 * In the app: a sign-in finished in the Chrome tab comes back (forwardToApp sent it here) as the address it returned
 * to, which `onReturn` finishes in this page, without loading the site again.
 */
export function listenForReturns(onReturn: (path: string) => void) {
  if (!has('App')) return
  const listener = bridge()!.addListener('App', 'appUrlOpen', ({ url }: { url: string }) => {
    const m = /^[a-z.]+:\/\/return(\/[^]*)$/.exec(url)
    if (!m) return
    if (has('Browser')) void call('Browser', 'close').catch(() => {})
    onReturn(m[1])
  })
  return () => void listener.remove()
}

/** In the Chrome tab, back from a sign-in that started in the app: the app's address to hand it on to. */
export function appReturnTarget(): string | null {
  if (typeof location === 'undefined' || inApp()) return null
  const fromQuery = new URLSearchParams(location.search).get('app')
  const fromState = /\.app-(release|preview)$/.exec(new URLSearchParams(location.hash.slice(1)).get('state') ?? '')?.[1]
  const which = fromQuery ?? fromState
  if (which !== 'release' && which !== 'preview') return null
  return `${APPS[which]}://return${location.pathname}${location.search}${location.hash}`
}

/**
 * In the Chrome tab: a sign-in that started in the app has come back here. Hands it on to the app and says so;
 * true when it did (the site itself mustn't start, or it would use up the sign-in).
 */
export function forwardToApp(): boolean {
  const target = appReturnTarget()
  if (!target) return false
  // If Chrome doesn't follow on its own, a tap does.
  document.title = 'Back to Rookahead'
  const link = document.createElement('a')
  link.href = target
  link.textContent = 'Back to the Rookahead app'
  link.style.cssText = 'display:block;margin:40vh 24px 0;text-align:center;font:16px system-ui,sans-serif;color:#7dd3fc'
  document.getElementById('root')?.replaceChildren(link)
  location.replace(target)
  return true
}
