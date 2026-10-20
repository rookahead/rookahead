import { DailyCard } from '../../components/DailyCard'
import { Link } from '../../components/Link'
import { Flame } from '../../components/PuzzleIcons'
import { TAB_ICONS } from '../../components/Tabs'
import { useMistakes } from '../../hooks/useMistakes'
import { localDayNumber } from '../../lib/puzzles'
import { dayStreak, type PuzzleProgress } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'

/** Phones' Puzzles tab: your streaks, today's puzzle, and the ways in. Each mode then opens full screen. */
export function PuzzleHub({ progress, settings }: { progress: PuzzleProgress; settings: Settings }) {
  const mistakes = useMistakes()
  const waiting = mistakes?.filter((m) => !progress.mistakesSolved.includes(m.id)).length ?? 0
  const days = dayStreak(progress, localDayNumber(new Date()))
  const sprintBest = Math.max(0, ...Object.values(progress.sprintBest).map(Number))
  const modes = [
    { to: '/puzzles/rated', tone: 'sky', icon: TAB_ICONS.rated, title: 'Rated puzzles', sub: `At your level · rating ${progress.rating}` },
    { to: '/puzzles/sprint', tone: 'amber', icon: TAB_ICONS.sprint, title: 'Puzzle Sprint', sub: sprintBest ? `3 min · 5 min · Survival · best ${sprintBest}` : '3 min · 5 min · Survival' },
    { to: '/puzzles/mistakes', tone: 'rose', icon: TAB_ICONS.mistakes, title: 'Your mistakes', sub: 'Positions from your own games', badge: waiting },
  ]
  return (
    <main className="puzzle-hub">
      <header className="puzzle-hub-head">
        <h1>Puzzles</h1>
        <span>
          Rating <strong>{progress.rating}</strong>
        </span>
      </header>

      <section className="hub-streaks" aria-label="Streaks">
        <div className={`hub-streak ${days ? 'hot' : ''}`}>
          <strong>
            <Flame size={20} lit={days > 0} />
            {days}
          </strong>
          <span>Day streak</span>
        </div>
        <div className="hub-streak">
          <strong>{progress.streak}</strong>
          <span>In a row</span>
        </div>
        <div className="hub-streak">
          <strong>{progress.bestStreak}</strong>
          <span>Best run</span>
        </div>
      </section>

      <DailyCard theme={settings.boardTheme} />

      <nav className="home-card you-list hub-modes" aria-label="Puzzle modes">
        {modes.map((m) => (
          <Link key={m.to} to={m.to} className={`you-row hub-mode ${m.tone}`}>
            <span className="hub-mode-icon" aria-hidden>
              <svg viewBox="0 0 24 24">{m.icon}</svg>
            </span>
            <span className="hub-mode-text">
              <strong>{m.title}</strong>
              <span>{m.sub}</span>
            </span>
            {m.badge ? <span className="hub-badge">{m.badge}</span> : null}
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        ))}
      </nav>
    </main>
  )
}
