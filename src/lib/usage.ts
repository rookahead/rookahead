import { ACCOUNTS_ENABLED, accountNow, client, subscribeAccount } from './account'
import { inApp } from './install'

// The usage log: what signed-in accounts do, so we can see who comes back and what they use. Each
// event is a name, a short tag and the kind of device; never moves, games or anything typed. Guests
// send nothing. Events wait a moment and go up together, and a failed send is simply dropped.

export type UsageEvent = 'open' | 'review_start' | 'review_done' | 'puzzle_solved' | 'explain' | 'bot_game'

export interface UsageRow {
  event: UsageEvent
  detail: string
  platform: 'app' | 'phone' | 'desktop'
}

/** Coming back to a tab left this long counts as opening the app again. */
export const OPEN_AGAIN_MS = 30 * 60_000
const SEND_AFTER_MS = 3000
const QUEUE_MAX = 50

let queue: UsageRow[] = []
let timer: ReturnType<typeof setTimeout> | undefined

/** The app, a touch screen (phones and tablets), or a computer with a mouse, whatever the window's width. */
export function platform(): UsageRow['platform'] {
  if (inApp()) return 'app'
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'phone' : 'desktop'
}

/** Notes an event. `detail` is a short lowercase tag such as "daily" or "batch". */
export function logUse(event: UsageEvent, detail = ''): void {
  if (!ACCOUNTS_ENABLED) return
  // A guest's events are dropped, except the open: they may sign in a moment later, and that's a visit too.
  if (accountNow().status === 'guest' && event !== 'open') return
  queue = keepQueued([...queue, { event, detail: tag(detail), platform: platform() }])
  timer ??= setTimeout(send, SEND_AFTER_MS)
}

/** At most one open waits, and the queue has a ceiling. */
export function keepQueued(rows: UsageRow[]): UsageRow[] {
  const lastOpen = rows.findLastIndex((r) => r.event === 'open')
  return rows.filter((r, i) => r.event !== 'open' || i === lastOpen).slice(-QUEUE_MAX)
}

/** Lowercase letters, digits and dashes, at most 20: what the table accepts. */
export const tag = (detail: string) => detail.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20)

async function send() {
  timer = undefined
  const { status } = accountNow()
  // Still restoring the session: the account listener sends once it's known.
  if (status !== 'signed-in' || !queue.length) return
  const rows = queue
  queue = []
  try {
    const c = await client()
    await c.from('usage_events').insert(rows)
  } catch {
    // Offline or blocked: these few events are lost, which is fine.
  }
}

let started = false
/** Logs this visit, and another whenever the tab comes back after a long while. */
export function startUsage(): void {
  if (!ACCOUNTS_ENABLED || started) return
  started = true
  logUse('open')
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      if (timer) {
        clearTimeout(timer)
        void send()
      }
    } else if (hiddenAt && Date.now() - hiddenAt >= OPEN_AGAIN_MS) logUse('open')
  })
  subscribeAccount(() => {
    const { status } = accountNow()
    if (status === 'signed-in' && queue.length) timer ??= setTimeout(send, SEND_AFTER_MS)
    // Signed out: a later sign-in shouldn't send the old account's events. Only an open is kept.
    if (status === 'guest') queue = queue.filter((r) => r.event === 'open')
  })
}
