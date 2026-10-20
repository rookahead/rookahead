import { useEffect, useState } from 'react'
import { loadMistakes, type MistakePuzzle } from '../lib/mistakes'
import { loadProgress } from '../lib/puzzleStore'
import { loadReviews } from '../lib/reviewCache'
import { useStoreVersion } from '../lib/syncBus'

// Decoding every saved review is the slow part: Home and the sidebar share one pass until
// the reviews or the solved mistakes change. `value` is the finished list, for pages that mount later.
let cached: { key: string; version: string; list: Promise<MistakePuzzle[]>; value?: MistakePuzzle[] } | null = null

/** Your unsolved mistake puzzles; null while they load, and again while a sync pass brings new reviews,
 * rather than showing a count from before it. */
export function useMistakes(): MistakePuzzle[] | null {
  const version = `${useStoreVersion('reviews')}:${useStoreVersion('puzzles')}`
  const [result, setResult] = useState<{ version: string; list: MistakePuzzle[] } | null>(() =>
    cached?.value && cached.version === version ? { version, list: cached.value } : null,
  )
  useEffect(() => {
    const reviews = loadReviews()
    const solved = loadProgress().mistakesSolved
    const key = `${Object.keys(reviews).length}:${Math.max(0, ...Object.values(reviews).map((r) => r.at))}:${solved.length}`
    if (cached?.key !== key) {
      const entry: NonNullable<typeof cached> = { key, version, list: loadMistakes(solved).catch(() => []) }
      void entry.list.then((m) => (entry.value = m))
      cached = entry
    }
    cached.version = version
    let live = true
    void cached.list.then((list) => live && setResult({ version, list }))
    return () => {
      live = false
    }
  }, [version])
  return result?.version === version ? result.list : null
}
