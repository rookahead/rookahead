import { useMemo } from 'react'
import { useMistakes } from '../hooks/useMistakes'
import { useMyGames } from '../hooks/useMyGames'
import { dayNumber } from '../lib/puzzles'
import { loadProgress } from '../lib/puzzleStore'
import { navigate } from '../lib/router'
import type { Settings } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'

/** The sidebar's short to-do list for today: the daily puzzle, mistakes waiting, games played. */
export function TodayCard({ settings }: { settings: Settings }) {
  const { games } = useMyGames({ chesscom: settings.chesscomUser, lichess: settings.lichessUser })
  const mistakes = useMistakes()
  const puzzlesVersion = useStoreVersion('puzzles')
  const daily = useMemo(() => {
    const p = loadProgress()
    return p.daily?.day === dayNumber(new Date()) ? p.daily.result : undefined
  }, [puzzlesVersion])
  const today = games.filter((g) => g.endedAt > Date.now() - 86400000).length

  const rows = [
    { id: 'daily', label: 'Daily puzzle', value: daily === 'solved' ? 'Solved' : daily === 'failed' ? 'Missed' : 'To do', done: !!daily, to: '/puzzles/daily' },
    { id: 'mistakes', label: 'Mistakes to fix', value: mistakes == null ? '–' : mistakes.length ? String(mistakes.length) : 'All clear', done: mistakes?.length === 0, to: '/puzzles/mistakes' },
    { id: 'games', label: 'Games today', value: today ? String(today) : 'None yet', done: false, to: '/games' },
  ]
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
