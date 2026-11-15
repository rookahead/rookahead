import { useEffect, useRef, useState } from 'react'
import { lowTimeMs } from '../lib/clock'
import { playSound } from '../lib/sound'

/** How long your clock's pulse lasts once your time runs low (index.css times it to this). */
const NUDGE_MS = 1200

/**
 * Your clock running low: true while it gives its one pulse, the moment your time left (ms) drops below the
 * game's low-time mark. A soft tick-tock goes with it, once a game. A clock that was already low when the page
 * opened (a reload) doesn't nudge again.
 */
export function useLowTimeNudge(left: number | null, startMs: number, volume: number): boolean {
  const low = left != null && startMs > 0 && left < lowTimeMs(startMs)
  const wasLow = useRef(low)
  const done = useRef(low)
  const [nudging, setNudging] = useState(false)
  useEffect(() => {
    if (low && !wasLow.current && !done.current) {
      done.current = true
      playSound('lowtime', volume)
      setNudging(true)
    }
    wasLow.current = low
  }, [low, volume])
  useEffect(() => {
    if (!nudging) return
    const t = setTimeout(() => setNudging(false), NUDGE_MS)
    return () => clearTimeout(t)
  }, [nudging])
  return nudging
}
