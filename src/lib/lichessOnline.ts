// How many people are on Lichess right now, for Home's Play online card: asked of our own /api/lichess-online
// (functions/api/lichess-online.ts, which reads Lichess's lobby and keeps it a minute), once a minute while Home is
// on screen and its tab in front. Null until it's known, or when it can't be (offline, or in development, where there's no function).
import { useEffect, useState } from 'react'

const EVERY_MS = 60_000
let last: number | null = null

export function useLichessOnline(active: boolean): number | null {
  const [players, setPlayers] = useState(last)
  useEffect(() => {
    if (!active) return
    let stop = false
    const ask = async () => {
      // A tab in the background doesn't ask (each ask is a call to our function); it asks again on coming back.
      if (document.hidden) return
      try {
        const res = await fetch('/api/lichess-online')
        const data = res.ok ? ((await res.json()) as { players?: unknown }) : null
        if (!stop && typeof data?.players === 'number') setPlayers((last = data.players))
      } catch {
        // Not known this time: the card keeps its other line.
      }
    }
    void ask()
    const timer = setInterval(() => void ask(), EVERY_MS)
    const onShow = () => !document.hidden && void ask()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      stop = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [active])
  return players
}
