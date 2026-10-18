import { useMemo, type ReactNode } from 'react'
import { PageHeader } from '../components/PageHeader'
import { currentGame } from '../lib/home'
import { navigate } from '../lib/router'
import { readSession, requestLoadDialog } from '../lib/session'

interface Props {
  avatar?: ReactNode
  /** The Load dialog has been requested: show Analysis. */
  onOpenAnalysis: () => void
}

/** The home dashboard: your games (once you play here) and the ways into the board. */
export function HomePage({ avatar, onOpenAnalysis }: Props) {
  const current = useMemo(() => currentGame(readSession()), [])
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
            <div className="games-empty">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M6 4l14 8-14 8z" />
              </svg>
              <p>
                <strong>Games you play on Rookahead will show up here</strong>
                <span>with your accuracy and a one-click review. Playing is coming soon.</span>
              </p>
            </div>
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
