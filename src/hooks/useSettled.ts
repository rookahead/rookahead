import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

// What arrives together (your games, then the Legendary moves read from them a moment later) comes in
// as one transition: a second one started meanwhile would cut the first short. Anything later waits
// for the one on screen to finish.
const BATCH_MS = 60
let queue: (() => void)[] = []
let scheduled = false
let running: Promise<unknown> | null = null

function settleSmoothly(update: () => void) {
  queue.push(update)
  if (scheduled) return
  scheduled = true
  setTimeout(async () => {
    if (running) await running
    scheduled = false
    const updates = queue
    queue = []
    const transition = document.startViewTransition(() => flushSync(() => updates.forEach((u) => u())))
    running = transition.finished.finally(() => (running = null))
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
