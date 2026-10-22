import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ClassIcon } from '../../components/ClassIcon'
import { Link } from '../../components/Link'
import { MiniBoard } from '../../components/MiniBoard'
import { RookLogo } from '../../components/RookLogo'
import { Wordmark } from '../../components/Wordmark'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { Color } from '../../lib/evaluation'
import type { MoveClass } from '../../lib/classify'
import { LEVELS } from '../../lib/levels'

/** How long the big logo holds before it moves to the corner and the tour starts. */
const INTRO_MS = 1900
/** Then the logo's trip to the corner (its CSS transition, 0.95s); the first slide waits until it's nearly there. */
const DOCK_MS = 800

/** A position with a verdict badge on the moved piece's square, the way the app's small boards show one. */
function BoardWithBadge({ fen, orientation, move, cls }: { fen: string; orientation: Color; move: [string, string]; cls?: MoveClass }) {
  return (
    <div className="tour-board">
      <MiniBoard fen={fen} orientation={orientation} theme="theme" lastMove={move} grade={cls} />
    </div>
  )
}

function ReviewScene() {
  return (
    <div className="tour-scene">
      {/* Morphy's Opera Game, 1858: the queen sacrifice before mate. */}
      <BoardWithBadge fen="1Q2kb1r/p2n1ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 b k - 1 16" orientation="white" move={['b3', 'b8']} cls="brilliant" />
      <div className="tour-note">
        <ClassIcon cls="brilliant" size={26} />
        <span>
          <strong>16. Qb8+ is legendary</strong>
          <span>Gives the queen. Rd8 is mate next.</span>
        </span>
      </div>
    </div>
  )
}

function MistakesScene() {
  return (
    <div className="tour-scene">
      <BoardWithBadge fen="r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4" orientation="black" move={['g8', 'f6']} cls="blunder" />
      <div className="tour-note">
        <ClassIcon cls="blunder" size={26} />
        <span>
          <strong>3…Nf6 is a blunder</strong>
          <span>Qxf7 is mate. Find the move that holds.</span>
        </span>
      </div>
    </div>
  )
}

function PuzzleScene() {
  return (
    <div className="tour-scene">
      <BoardWithBadge fen="4r1k1/1r2P2p/5Qp1/8/p7/Bq6/5PPP/R4bK1 w - - 0 31" orientation="white" move={['c4', 'f1']} />
      <div className="tour-note">
        <span className="tour-flame" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2 .8-3.6 2-4.6.2 1.6 1 2.6 2 2.6-.6-3 0-6 1-9z" />
          </svg>
        </span>
        <span>
          <strong>White to play, mate in 2</strong>
          <span>Rated 1003 · day 12 of your puzzle streak</span>
        </span>
      </div>
    </div>
  )
}

function PlayScene() {
  const pick = 5
  return (
    <div className="tour-scene">
      <div className="tour-ladder" role="img" aria-label="Eight computer levels, rated 400 to 2600">
        {LEVELS.map((l) => (
          <span key={l.level} className={l.level === pick ? 'is-pick' : undefined} style={{ '--h': `${22 + l.level * 9.5}%`, '--i': l.level } as CSSProperties}>
            <b>{l.rating}</b>
            <i>{l.level}</i>
          </span>
        ))}
      </div>
      <div className="tour-note">
        <span className="tour-level">{pick}</span>
        <span>
          <strong>Level {pick}, rated {LEVELS[pick - 1].rating}</strong>
          <span>10+5 rapid · takebacks on</span>
        </span>
      </div>
    </div>
  )
}

function Profile() {
  return (
    <span className="tour-profile">
      <span className="tour-avatar" />
      <span className="tour-lines">
        <span />
        <span />
      </span>
      <span className="tour-stat">
        <b>1642</b>
        <span>puzzles</span>
      </span>
      <span className="tour-stat">
        <b>12</b>
        <span>puzzle streak</span>
      </span>
    </span>
  )
}

function SyncScene() {
  return (
    <div className="tour-scene">
      <div className="tour-devices" role="img" aria-label="The same profile on a laptop and a phone">
        <span className="tour-laptop">
          <Profile />
        </span>
        <span className="tour-phone">
          <Profile />
        </span>
      </div>
      <div className="tour-note">
        <span className="tour-check" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span>
          <strong>Synced a moment ago</strong>
          <span>Games, reviews and puzzles</span>
        </span>
      </div>
    </div>
  )
}

const SLIDES: { id: string; title: string; text: string; scene: ReactNode }[] = [
  { id: 'review', title: 'Every move graded', text: 'Stockfish marks each move, from Legendary to Blunder, so you see where the game turned.', scene: <ReviewScene /> },
  { id: 'mistakes', title: 'Your mistakes come back', text: 'Each blunder from your reviews returns as a puzzle, until you find the better move.', scene: <MistakesScene /> },
  { id: 'puzzles', title: 'Puzzles at your level', text: '185,000 rated puzzles, a daily puzzle, and Puzzle Sprint against the clock.', scene: <PuzzleScene /> },
  { id: 'play', title: 'Play the computer', text: 'Eight levels from 400 to 2600, at any time control, with takebacks and hints when you want them.', scene: <PlayScene /> },
  { id: 'sync', title: 'Your progress, everywhere', text: 'Sign in and your games, reviews, rating and streaks follow you to every device.', scene: <SyncScene /> },
]

/** The left half: the big logo, which moves to the corner; once it's there, what Rookahead offers slides by.
 * It plays each time the page opens; switching between Sign in and Register keeps it where it is. */
export function Brand() {
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')
  // intro: the big logo; dock: it moves to the corner; tour: the slides, one by one.
  const [phase, setPhase] = useState<'intro' | 'dock' | 'tour'>('intro')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (phase === 'tour') return
    const t = setTimeout(() => setPhase(phase === 'intro' ? 'dock' : 'tour'), still ? 0 : phase === 'intro' ? INTRO_MS : DOCK_MS)
    return () => clearTimeout(t)
  }, [phase, still])

  return (
    <aside className="auth-brand" data-phase={phase}>
      <Link to="/" className="auth-mark" aria-label="Rookahead home">
        <RookLogo />
        <Wordmark />
      </Link>
      <div className="auth-intro" aria-hidden={phase !== 'intro'}>
        <p className="auth-intro-line">Play anywhere. Improve here.</p>
        <p className="auth-intro-sub">Free chess game reviews, puzzles and play, right in your browser.</p>
      </div>

      <section className="tour" aria-roledescription="carousel" aria-label="What Rookahead offers">
        <div className="tour-stage">
          {SLIDES.map((s, i) => (
            <div key={s.id} className={`tour-slide${phase === 'tour' && i === index ? ' is-active' : ''}`} aria-hidden={i !== index} aria-roledescription="slide">
              {s.scene}
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Phones: no room for the scenes; the same five points as cards you swipe through. */}
      <ul className="tour-cards" aria-label="What Rookahead offers">
        {SLIDES.map((s) => (
          <li key={s.id} className={`tour-card ${s.id}`}>
            <strong>{s.title}</strong>
            <span>{s.text}</span>
          </li>
        ))}
      </ul>

      <footer className="auth-brand-foot">
        <div className="tour-steps">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`tour-step${i === index ? ' is-active' : i < index ? ' is-done' : ''}`}
              aria-label={s.title}
              aria-current={i === index}
              onClick={() => setIndex(i)}
            >
              {/* The active step's fill runs for the slide's time; when it ends, the next slide comes. */}
              <span key={phase === 'tour' && i === index ? index : 'idle'} onAnimationEnd={() => setIndex((index + 1) % SLIDES.length)} />
            </button>
          ))}
        </div>
        <p>Free and open source. Everything works without an account.</p>
      </footer>
    </aside>
  )
}
