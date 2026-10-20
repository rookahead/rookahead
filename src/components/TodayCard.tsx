import { useMemo } from 'react'
import { useMistakes } from '../hooks/useMistakes'
import { useMyGames } from '../hooks/useMyGames'
import { dayNumber } from '../lib/puzzles'
import { loadProgress } from '../lib/puzzleStore'
import { navigate } from '../lib/router'
import type { Settings } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'

/** What's left to do today: the daily puzzle, mistakes waiting, games played. */
function useToday(settings: Settings) {
  const { games } = useMyGames({ chesscom: settings.chesscomUser, lichess: settings.lichessUser })
  const mistakes = useMistakes()
  const puzzlesVersion = useStoreVersion('puzzles')
  const daily = useMemo(() => {
    const p = loadProgress()
    return p.daily?.day === dayNumber(new Date()) ? p.daily.result : undefined
  }, [puzzlesVersion])
  const today = games.filter((g) => g.endedAt > Date.now() - 86400000).length

  return [
    { id: 'daily', label: 'Daily puzzle', value: daily === 'solved' ? 'Solved' : daily === 'failed' ? 'Missed' : 'To do', done: !!daily, to: '/puzzles/daily' },
    {
      id: 'mistakes',
      label: 'Mistakes to fix',
      short: 'Mistakes',
      value: mistakes == null ? '–' : mistakes.length ? String(mistakes.length) : 'All clear',
      tile: mistakes?.length ? `${mistakes.length} to fix` : undefined,
      done: mistakes?.length === 0,
      to: '/puzzles/mistakes',
    },
    { id: 'games', label: 'Games today', value: today ? String(today) : 'None yet', tile: today ? `${today} played` : undefined, done: false, to: '/games' },
  ]
}

/** The sidebar's short to-do list for today. */
export function TodayCard({ settings }: { settings: Settings }) {
  const rows = useToday(settings)
  return (
    <section className="today-card" aria-labelledby="today-title">
      <h2 id="today-title">Today</h2>
      {rows.map((r) => (
        <button key={r.id} className={`today-row ${r.id} ${r.done ? 'done' : ''}`} onClick={() => navigate(r.to)}>
          <span className="today-dot" aria-hidden />
          <span className="today-label">{r.label}</span>
          <span className="today-value">{r.value}</span>
        </button>
      ))}
    </section>
  )
}

/** Phones: the same three things as tiles across the top of Home. */
export function TodayTiles({ settings }: { settings: Settings }) {
  const rows = useToday(settings)
  return (
    <nav className="today-tiles" aria-label="Today">
      {rows.map((r) => (
        <button key={r.id} className={`today-tile ${r.id} ${r.done ? 'done' : ''}`} onClick={() => navigate(r.to)}>
          <span className="today-tile-label">
            <span className="today-dot" aria-hidden />
            {r.short ?? r.label}
          </span>
          <strong>{r.tile ?? r.value}</strong>
        </button>
      ))}
    </nav>
  )
}
