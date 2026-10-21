import { useEffect, useState } from 'react'
import { legendaryMoves, type LegendaryMove } from '../lib/legendary'
import type { MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import { decodeShare, type SharedGame } from '../lib/share'

/** A Legendary move of yours, with the game it's from. */
export interface LegendaryEntry extends LegendaryMove {
  /** Unique across games: the game's key and the move. */
  id: string
  game: MyGame
  review: CachedReview
}

// Each review's token decoded once: the page comes back instantly, and new reviews add to it.
const decoded = new Map<string, SharedGame | null>()

async function decode(token: string): Promise<SharedGame | null> {
  if (!decoded.has(token)) {
    const shared = await decodeShare(token)
    decoded.set(token, 'error' in shared ? null : shared)
  }
  return decoded.get(token)!
}

/** Every Legendary move you played in your reviewed games, newest game first. */
export function useLegendaryMoves(games: MyGame[], reviews: Record<string, CachedReview>): { moves: LegendaryEntry[]; loading: boolean } {
  const [state, setState] = useState<{ moves: LegendaryEntry[]; loading: boolean }>({ moves: [], loading: true })

  useEffect(() => {
    let live = true
    // Only games whose review counted a Legendary move of yours need opening up.
    const candidates = games.filter((g) => (reviews[g.key]?.brilliant[g.color] ?? 0) > 0).sort((a, b) => b.endedAt - a.endedAt)
    void Promise.all(
      candidates.map(async (game) => {
        const review = reviews[game.key]
        const shared = await decode(review.token)
        return shared ? legendaryMoves(shared, game.color).map((m) => ({ ...m, id: `${game.key}#${m.ply}`, game, review })) : []
      }),
    ).then((found) => {
      if (live) setState({ moves: found.flat(), loading: false })
    })
    return () => {
      live = false
    }
  }, [games, reviews])

  return state
}
