import { useEffect, useState } from 'react'
import { loadMistakes, type MistakePuzzle } from '../lib/mistakes'
import { loadProgress } from '../lib/puzzleStore'
import { loadReviews } from '../lib/reviewCache'
import { useStoreVersion } from '../lib/syncBus'

// Decoding every saved review is the slow part: Home and the sidebar share one pass until
// the reviews or the solved mistakes change.
let cached: { key: string; list: Promise<MistakePuzzle[]> } | null = null

/** Your unsolved mistake puzzles (null while they load). Re-reads on mount and after a sync pass. */
export function useMistakes(): MistakePuzzle[] | null {
  const reviewsVersion = useStoreVersion('reviews')
  const puzzlesVersion = useStoreVersion('puzzles')
  const [list, setList] = useState<MistakePuzzle[] | null>(null)
  useEffect(() => {
    const reviews = loadReviews()
    const solved = loadProgress().mistakesSolved
    const key = `${Object.keys(reviews).length}:${Math.max(0, ...Object.values(reviews).map((r) => r.at))}:${solved.length}`
    if (cached?.key !== key) cached = { key, list: loadMistakes(solved).catch(() => []) }
    let live = true
    void cached.list.then((m) => live && setList(m))
    return () => {
      live = false
    }
  }, [reviewsVersion, puzzlesVersion])
  return list
}
