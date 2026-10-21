import { useEffect, useMemo, useState } from 'react'
import { formatDay } from '../lib/home'
import { dailyLine } from '../lib/puzzleData'
import { dayNumber, localDayNumber, parsePuzzleLine, playerColor, positionAfter, type Puzzle } from '../lib/puzzles'
import { dayStreak, loadProgress } from '../lib/puzzleStore'
import { navigate } from '../lib/router'
import type { BoardTheme } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'
import { DayStreak } from '../pages/puzzles/shared'
import { MiniBoard } from './MiniBoard'

/** Today's puzzle: the position to solve, and whether it's done. Hidden until it loads (or if it can't). */
export function DailyCard({ theme }: { theme: BoardTheme }) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  useEffect(() => {
    dailyLine().then(
      (l) => setPuzzle(parsePuzzleLine(l)),
      () => {},
    )
  }, [])
  const version = useStoreVersion('puzzles')
  const { done, days } = useMemo(() => {
    const progress = loadProgress()
    const now = new Date()
    return { done: progress.daily?.day === dayNumber(now) ? progress.daily.result : undefined, days: dayStreak(progress, localDayNumber(now)) }
  }, [version])
  if (!puzzle) return null
  const color = playerColor(puzzle)
  const first = puzzle.moves[0]
  const open = () => navigate('/puzzles/daily')
  return (
    <section className="home-card daily-card" aria-labelledby="daily-puzzle">
      <header className="daily-head">
        <h2 id="daily-puzzle">
          Daily puzzle <span className="muted">{formatDay(Date.now() / 1000)}</span>
        </h2>
        <DayStreak days={days} />
      </header>
      <button className="daily-board" onClick={open} aria-label="Solve the daily puzzle">
        <MiniBoard fen={positionAfter(puzzle, [first]).fen()} orientation={color} theme={theme} lastMove={[first.slice(0, 2), first.slice(2, 4)]} />
      </button>
      <div className="daily-foot">
        <p>
          <strong>{color === 'white' ? 'White' : 'Black'} to play</strong>
          <span className="muted">
            {done === 'solved'
              ? 'Solved · next one tomorrow'
              : done === 'failed'
                ? 'Missed · next one tomorrow'
                : `Rated ${puzzle.rating} · ${days ? `keeps your ${days}-day streak` : 'starts a streak'}`}
          </span>
        </p>
        <button className={`btn small ${done ? 'ghost' : 'primary'}`} onClick={open}>
          {done ? 'See it' : 'Solve'}
        </button>
      </div>
    </section>
  )
}
