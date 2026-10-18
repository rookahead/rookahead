import { useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from '../components/PageHeader'
import { loadGames, type PlayedGame } from '../lib/games'
import { currentGame, playedRow } from '../lib/home'
import { gameKey, loadReviews, type CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { readSession, requestLoadDialog, writeSession } from '../lib/session'
import { decodeShare, fromSharedGame } from '../lib/share'
import { mainline, treeFromPgn } from '../lib/tree'

const SHOWN = 10

/** Each played game with its saved review, if it has been reviewed. */
function withReviews(games: PlayedGame[]): { game: PlayedGame; review?: CachedReview }[] {
  const reviews = loadReviews()
  return games.map((game) => {
    try {
      const { tree, headers } = treeFromPgn(game.pgn)
      return { game, review: reviews[gameKey(headers, mainline(tree))] }
    } catch {
      return { game }
    }
  })
}

interface Props {
  avatar?: ReactNode
  /** The Load dialog has been requested: show Analysis. */
  onOpenAnalysis: () => void
}

/** The home dashboard: your games (once you play here) and the ways into the board. */
export function HomePage({ avatar, onOpenAnalysis }: Props) {
  const current = useMemo(() => currentGame(readSession()), [])
  const games = useMemo(() => withReviews(loadGames()), [])
  const [showAll, setShowAll] = useState(false)

  /** Opens a played game in Analysis: instantly with its saved review, or reviewing it on arrival. */
  const open = async (game: PlayedGame, review?: CachedReview) => {
    const shared = review ? await decodeShare(review.token) : null
    if (shared && !('error' in shared) && shared.review) {
      writeSession({ pgn: game.pgn, orientation: game.color, currentPly: 0, evals: fromSharedGame(shared).evals, classes: shared.review.classes })
    } else {
      writeSession({ pgn: game.pgn, orientation: game.color, currentPly: 0, evals: {}, review: true })
    }
    onOpenAnalysis()
  }
  const loadGame = () => {
    requestLoadDialog()
    onOpenAnalysis()
  }

  return (
    <div className="home-page">
      <PageHeader phoneOnly avatar={avatar} />
      <main className="home">
        <div className="home-main">
          <h1 className="home-welcome">Welcome to Rookahead</h1>

          <section className="home-card games-card" aria-labelledby="recent-games">
            <header className="home-card-head">
              <h2 id="recent-games">My recent games</h2>
            </header>
            {games.length ? (
              <>
                <ul className="played-list">
                  {(showAll ? games : games.slice(0, SHOWN)).map(({ game, review }) => {
                    const row = playedRow(game)
                    const accuracy = review?.accuracy[game.color]
                    return (
                      <li key={game.id} className="played-row">
                        <span className={`played-result ${game.result}`}>{row.result}</span>
                        <span className="played-text">
                          <strong>
                            {row.opponent} <span className="muted">{row.rating}</span>
                          </strong>
                          <span>
                            {row.detail}
                            {row.assists && ` · ${row.assists}`}
                          </span>
                        </span>
                        {accuracy != null && (
                          <span className="played-accuracy" title="Your accuracy">
                            {accuracy.toFixed(1)}
                          </span>
                        )}
                        <button className={`btn small ${review ? 'ghost' : 'primary'}`} onClick={() => void open(game, review)}>
                          {review ? 'Open' : 'Review'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {!showAll && games.length > SHOWN && (
                  <button className="btn ghost small games-more" onClick={() => setShowAll(true)}>
                    Show more
                  </button>
                )}
              </>
            ) : (
              <div className="games-empty">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 4l14 8-14 8z" />
                </svg>
                <p>
                  <strong>Games you play on Rookahead will show up here</strong>
                  <span>with your accuracy and a one-click review.</span>
                </p>
                <button className="btn primary small" onClick={() => navigate('/play')}>
                  Play the computer
                </button>
              </div>
            )}
          </section>
        </div>

        <aside className="home-side" aria-label="Start">
          {current ? (
            <section className="home-card accent-card" aria-labelledby="latest-game">
              <h2 id="latest-game">Continue your game</h2>
              <p>
                {current.title} · {current.moves} {current.moves === 1 ? 'move' : 'moves'}
                {current.reviewed ? ' · reviewed' : ''}
              </p>
              <button className="btn accent-btn" onClick={() => navigate('/analysis')}>
                Continue
              </button>
            </section>
          ) : (
            <section className="home-card accent-card" aria-labelledby="latest-game">
              <h2 id="latest-game">Review a game</h2>
              <p>Paste a game and Stockfish 19 grades every move, from genius to blunder.</p>
              <button className="btn accent-btn" onClick={loadGame}>
                Load a game
              </button>
            </section>
          )}
          <button className="home-card quick-card" onClick={() => navigate('/analysis')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
            </svg>
            <span>
              <strong>Analysis board</strong>
              <small>Explore any position with Stockfish 19</small>
            </span>
            <span className="quick-go" aria-hidden>
              ›
            </span>
          </button>
          <button className="home-card quick-card" onClick={loadGame}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            <span>
              <strong>Load a game</strong>
              <small>Paste a PGN or FEN, or import your games</small>
            </span>
            <span className="quick-go" aria-hidden>
              ›
            </span>
          </button>
        </aside>
      </main>
    </div>
  )
}
