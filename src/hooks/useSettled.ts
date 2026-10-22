import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

// What arrives together (your games, then the Legendary moves read from them a moment later) comes in
// as one transition: a second one started meanwhile would cut the first short. Anything later waits
// for the one on screen to finish, a change of page included.
const BATCH_MS = 60
let queue: (() => void)[] = []
let scheduled = false
let running: Promise<unknown> | null = null

// The transition on screen, if any.
let current: ViewTransition | null = null

type Kind = 'settling' | 'page-change'
const kinds: Record<Kind, number> = { settling: 0, 'page-change': 0 }

/** How long after a transition ends a wheel turn it swallowed waits to see if the browser scrolls anyway. */
const WHEEL_BEAT_MS = 120

// Keys that scroll the page.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/**
 * A view transition that gives way to scrolling. While one runs, its named cards are drawn against the
 * window, not the page, so a scroll would slide the rest of the page under them: scrolling ends it at
 * once instead. Firefox doesn't scroll at all while one runs, so trying to (the wheel, a touch, a key)
 * ends it too, rather than the scroll that never comes, and a wheel turn it swallowed is scrolled by hand.
 * Listening for the scroll itself starts once the animation does, so the update's own layout shift can't
 * end it.
 * `kind` goes on the root as a class while it runs: it's what gives the parts their names (index.css), so
 * a page change animates the page and a settle the cards, never each other's.
 */
export function startViewTransition(update: () => void, kind?: Kind): ViewTransition {
  const root = document.documentElement
  if (kind) {
    kinds[kind]++
    root.classList.add(kind)
  }
  const transition = document.startViewTransition(update)
  current = transition
  const skip = () => transition.skipTransition()
  const key = (e: KeyboardEvent) => SCROLL_KEYS.has(e.key) && skip()
  const wheel = (e: WheelEvent) => {
    skip()
    // Lines and pages, as the browser would count them.
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1)
    // A browser that does scroll meanwhile (smoothly, so a moment later) has started by a beat after it
    // wound up; only one that hasn't gets the turn by hand.
    let moved = false
    const scrolled = () => (moved = true)
    addEventListener('scroll', scrolled, { passive: true })
    void transition.finished.finally(() =>
      setTimeout(() => {
        removeEventListener('scroll', scrolled)
        if (!moved) scrollBy({ top: dy, behavior: 'instant' })
      }, WHEEL_BEAT_MS),
    )
  }
  // A press ends it at once. Chrome then hands that click to the page as a whole (<html>), the press having
  // landed on the transition's pictures, and only once it has ended: so the press waits for its click, however
  // late, and gives it to what's really under the pointer (Settings, pressed as Home loads), once no transition
  // is in the way (one waiting behind this may have started by then: it ends too).
  const press = () => {
    skip()
    addEventListener(
      'click',
      async (e) => {
        if (e.target !== document.documentElement) return
        const { clientX: x, clientY: y } = e
        while (current) {
          current.skipTransition()
          await running
        }
        document.elementFromPoint(x, y)?.closest<HTMLElement>('a, button, [role="button"], label, summary')?.click()
      },
      { capture: true, once: true },
    )
  }
  const input = { capture: true, passive: true }
  addEventListener('pointerdown', press, input)
  addEventListener('wheel', wheel, input)
  addEventListener('touchstart', skip, input)
  addEventListener('keydown', key, input)
  transition.ready.then(() => addEventListener('scroll', skip, { once: true, passive: true }), () => {})
  const done: Promise<unknown> = transition.finished
    .catch(() => {})
    .finally(() => {
      removeEventListener('scroll', skip)
      removeEventListener('pointerdown', press, input)
      removeEventListener('wheel', wheel, input)
      removeEventListener('touchstart', skip, input)
      removeEventListener('keydown', key, input)
      // A quick second click starts the next one before this has wound up: its names stay.
      if (kind && --kinds[kind] === 0) root.classList.remove(kind)
      if (running === done) running = null
      if (current === transition) current = null
    })
  running = done
  return transition
}

function settleSmoothly(update: () => void) {
  queue.push(update)
  if (scheduled) return
  scheduled = true
  setTimeout(async () => {
    while (running) await running
    scheduled = false
    const updates = queue
    queue = []
    startViewTransition(() => flushSync(() => updates.forEach((u) => u())), 'settling')
  }, BATCH_MS)
}

/**
 * `pending`, with its end played as a view transition: when what was loading arrives, each placeholder
 * morphs into the card that takes its place (they share a view-transition-name) and the cards around
 * them slide to where they now sit, instead of everything jumping in one frame. Browsers without view
 * transitions, and reduced motion, just switch.
 */
export function useSettled(pending: boolean): boolean {
  const [shown, setShown] = useState(pending)
  const queued = useRef(false)
  const latest = useRef(pending)
  useLayoutEffect(() => {
    latest.current = pending
    if (pending === shown) {
      queued.current = false
      return
    }
    const smooth = !pending && 'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!smooth) setShown(pending)
    else if (!queued.current) {
      queued.current = true
      // Loading again by the time it runs (a refresh): stay as it is.
      settleSmoothly(() => !latest.current && setShown(false))
    }
  }, [pending, shown])
  return shown
}
