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

// Only games whose review counted a Legendary move of yours need opening up.
const candidates = (games: MyGame[], reviews: Record<string, CachedReview>) =>
  games.filter((g) => (reviews[g.key]?.brilliant[g.color] ?? 0) > 0).sort((a, b) => b.endedAt - a.endedAt)

const entries = (game: MyGame, review: CachedReview, shared: SharedGame | null): LegendaryEntry[] =>
  shared ? legendaryMoves(shared, game.color).map((m) => ({ ...m, id: `${game.key}#${m.ply}`, game, review })) : []

/** The moves straight away when every game they're in has been opened before; null when one still needs decoding. */
function known(games: MyGame[], reviews: Record<string, CachedReview>): LegendaryEntry[] | null {
  const list = candidates(games, reviews)
  if (!list.every((g) => decoded.has(reviews[g.key].token))) return null
  return list.flatMap((g) => entries(g, reviews[g.key], decoded.get(reviews[g.key].token)!))
}

/** Every Legendary move you played in your reviewed games, newest game first. */
export function useLegendaryMoves(games: MyGame[], reviews: Record<string, CachedReview>): { moves: LegendaryEntry[]; loading: boolean } {
  // Coming back to a page, they're usually all known already: shown at once, with no placeholder in between.
  const [state, setState] = useState<{ moves: LegendaryEntry[]; loading: boolean }>(() => {
    const moves = known(games, reviews)
    return moves ? { moves, loading: false } : { moves: [], loading: true }
  })

  useEffect(() => {
    let live = true
    void Promise.all(
      candidates(games, reviews).map(async (game) => {
        const review = reviews[game.key]
        return entries(game, review, await decode(review.token))
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
