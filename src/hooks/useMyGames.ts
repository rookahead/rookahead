import { useEffect, useMemo, useState } from 'react'
import { cachedFor, importGames, isFresh, loadImportCache, myGames, type ImportSite, type MyGame, type Usernames } from '../lib/myGames'
import { loadOpeningBook } from '../lib/openings'
import { isStale, regrade } from '../lib/regrade'
import { loadReviews, saveReview, type CachedReview } from '../lib/reviewCache'
import { writeSession } from '../lib/session'
import { decodeShare, fromSharedGame } from '../lib/share'
import { useStoreVersion } from '../lib/syncBus'

const SITES: ImportSite[] = ['chesscom', 'lichess']

// One fetch per site and username at a time, shared by every page that asks.
const inFlight = new Map<string, Promise<void>>()

function refresh(site: ImportSite, user: string): Promise<void> {
  const id = `${site}:${user.trim().toLowerCase()}`
  let p = inFlight.get(id)
  if (!p) {
    p = importGames(site, user).finally(() => inFlight.delete(id))
    inFlight.set(id, p)
  }
  return p
}

/** My games (played here + imported), their saved reviews, and the state of the imports. Refetches stale imports. */
export function useMyGames(users: Usernames) {
  const gamesVersion = useStoreVersion('games')
  const reviewsVersion = useStoreVersion('reviews')
  const [cacheVersion, setCacheVersion] = useState(0)
  // Loading from the first frame for each site the effect below will fetch, so Home never takes an empty
  // cache for a first visit before the fetch starts.
  const [loading, setLoading] = useState<Partial<Record<ImportSite, boolean>>>(() => {
    const cache = loadImportCache()
    return Object.fromEntries(SITES.map((site) => [site, !!users[site].trim() && !isFresh(cachedFor(cache, site, users[site].trim()))]))
  })
  const [errors, setErrors] = useState<Partial<Record<ImportSite, string>>>({})

  useEffect(() => {
    let live = true
    const cache = loadImportCache()
    for (const site of SITES) {
      const user = users[site].trim()
      if (!user || isFresh(cachedFor(cache, site, user))) continue
      setLoading((l) => ({ ...l, [site]: true }))
      refresh(site, user).then(
        () => {
          if (!live) return
          setErrors((e) => ({ ...e, [site]: undefined }))
          setCacheVersion((v) => v + 1)
        },
        (err: unknown) => {
          if (live) setErrors((e) => ({ ...e, [site]: err instanceof Error ? err.message : 'Could not load your games.' }))
        },
      ).finally(() => live && setLoading((l) => ({ ...l, [site]: false })))
    }
    return () => {
      live = false
    }
  }, [users.chesscom, users.lichess])

  const games = useMemo(() => myGames(users, loadImportCache()), [users.chesscom, users.lichess, cacheVersion, gamesVersion])
  const reviews = useMemo(() => loadReviews(), [reviewsVersion])
  const busy = SITES.some((s) => loading[s])
  return { games, reviews, loading: busy, errors, reload: () => setCacheVersion((v) => v + 1) }
}

/**
 * Puts a game in the session for Analysis: with its saved review if it has one (opening at move `ply`,
 * e.g. a Legendary move), else reviewing it on arrival. A review graded under older rules is graded
 * again first, from what it saved; one too old for that is reviewed again on arrival.
 */
export async function openMyGame(game: MyGame, review?: CachedReview, { ply = 0 } = {}): Promise<void> {
  if (review && isStale(review)) {
    const regraded = await regrade(review, (await loadOpeningBook()).isBook)
    if (regraded) saveReview(game.key, regraded.review)
    review = regraded?.review
  }
  const shared = review ? await decodeShare(review.token) : null
  if (shared && !('error' in shared) && shared.review) {
    const classes = shared.review.classes
    writeSession({ pgn: game.pgn, orientation: game.color, currentPly: ply, evals: fromSharedGame(shared).evals, classes })
  } else {
    writeSession({ pgn: game.pgn, orientation: game.color, currentPly: 0, evals: {}, review: true })
  }
}
