import type { ReactNode } from 'react'
import { ClassIcon } from '../../components/ClassIcon'
import { Link } from '../../components/Link'
import { RookLogo } from '../../components/RookLogo'
import { NAV_ITEMS } from '../../lib/nav'

const navIcon = (id: string) => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d={NAV_ITEMS.find((n) => n.id === id)!.icon} />
  </svg>
)

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <ClassIcon cls="brilliant" size={28} />, title: 'Every move graded', text: 'Stockfish 19 marks each move, from Genius to Blunder, so you see where the game turned.' },
  { icon: navIcon('puzzles'), title: 'Puzzles at your level', text: '185,000 rated puzzles, Puzzle Sprint, a daily puzzle and your own mistakes.' },
  { icon: navIcon('play'), title: 'Play the computer', text: 'Eight levels, from 400 to 2600.' },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9zM9.5 13.5l2 2 3.5-4" />
      </svg>
    ),
    title: 'Your progress, everywhere',
    text: 'With an account, your rating, streaks, games and reviews follow you to every device.',
  },
]

/** The left half: what Rookahead is. */
export function Brand() {
  return (
    <aside className="auth-brand">
      <Link to="/" className="auth-brand-home" aria-label="Rookahead home">
        <RookLogo />
        <span>Rookahead</span>
      </Link>
      <div className="auth-pitch">
        <h1>Review every game. Train every day.</h1>
        <p>Free chess game reviews, puzzles and play, right in your browser.</p>
        <ul className="auth-features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <span className="auth-feature-icon">{f.icon}</span>
              <span>
                <strong>{f.title}</strong>
                <span>{f.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="auth-brand-foot">Free and open source · Everything works without an account</p>
    </aside>
  )
}
