import { Board } from '../../components/Board'
import { useDailyPuzzle } from '../../components/DailyCard'
import { Link } from '../../components/Link'
import { MiniBoard } from '../../components/MiniBoard'
import { RookCoach } from '../../components/RookCoach'
import { TAB_ICONS } from '../../components/Tabs'
import { useMistakes } from '../../hooks/useMistakes'
import { formatDay } from '../../lib/home'
import { localDayNumber, playerColor, positionAfter } from '../../lib/puzzles'
import { dayStreak, type PuzzleProgress } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'
import { EmptyBoard, PuzzleLayout } from './shared'

const num = (n: number) => n.toLocaleString('en-US')
const noMove = () => {}

/**
 * Desktop Puzzles: where the modes start. The coach says what's worth doing today, then rated puzzles, the main
 * thing, as one big card; under it the other modes as picture tiles, each with its own number. The board beside
 * shows today's puzzle.
 */
export function PuzzleStart({ progress, settings, head }: { progress: PuzzleProgress; settings: Settings; head: React.ReactNode }) {
  const mistakes = useMistakes()
  const waiting = mistakes?.filter((m) => !progress.mistakesSolved.includes(m.id)).length ?? 0
  const { puzzle, done } = useDailyPuzzle()
  const days = dayStreak(progress, localDayNumber(new Date()))
  const best = Math.max(0, ...Object.values(progress.sprintBest).map(Number))
  const first = puzzle?.moves[0]
  const daily = puzzle && first ? { fen: positionAfter(puzzle, [first]).fen(), color: playerColor(puzzle), last: [first.slice(0, 2), first.slice(2, 4)] as [string, string] } : null
  // How far the next hundred is.
  const from = Math.floor(progress.rating / 100) * 100

  // One thing worth doing today, in the coach's words: keep the streak, else your own mistakes, else rated puzzles.
  const say = !done
    ? days
      ? `Keep your ${days}-day streak going: today's puzzle is waiting.`
      : "Today's puzzle is waiting. Solve it and start a streak."
    : waiting
      ? `${num(waiting)} of your own mistakes are waiting. Fix a few?`
      : 'Ready? Rated puzzles are picked near your rating.'

  return (
    <PuzzleLayout
      head={head}
      board={
        daily ? (
          <Board fen={daily.fen} orientation={daily.color} lastMove={daily.last as never} shapes={[]} theme={settings.boardTheme} coordinates={settings.coordinates} onMove={noMove} viewOnly />
        ) : (
          <EmptyBoard settings={settings} />
        )
      }
    >
      <div className="puzzle-start">
        <div className="start-coach">
          <span className="start-coach-rook">
            <RookCoach mood={done ? 'neutral' : 'pleased'} moodKey={`start:${done ?? ''}`} />
          </span>
          <p className="start-bubble">{say}</p>
        </div>

        <section className="home-card home-play start-solve" aria-labelledby="start-solve">
          <header className="home-play-head">
            <div className="quick-lines">
              <h2 id="start-solve">Rated puzzles</h2>
              <small>Picked near your rating</small>
            </div>
          </header>
          <div className="start-score">
            <strong className="start-rating">{num(progress.rating)}</strong>
            <small className="start-to">
              {from + 100 - progress.rating} to {num(from + 100)}
            </small>
          </div>
          <div className="start-track" aria-hidden>
            <span style={{ width: `${progress.rating - from}%` }} />
          </div>
          <Link to="/puzzles/rated" className="btn accent-btn home-play-go">
            Solve puzzles
          </Link>
        </section>

        <nav className="home-tiles start-tiles" aria-label="Other puzzle modes">
          <Link to="/puzzles/daily" className="home-card home-tile">
            <strong>Daily</strong>
            <small>{done === 'solved' ? 'Solved' : done === 'failed' ? 'Missed' : formatDay(Date.now() / 1000)}</small>
            <span className="home-tile-art tile-board" aria-hidden>
              {daily ? <MiniBoard fen={daily.fen} orientation={daily.color} theme={settings.boardTheme} lastMove={daily.last} /> : <span className="skel tile-board-blank" />}
            </span>
          </Link>
          <Link to="/puzzles/sprint" className="home-card home-tile">
            <strong>Sprint</strong>
            <small>{best ? `Best ${best}` : 'Against the clock'}</small>
            <span className="home-tile-art tile-bolt" aria-hidden>
              <svg viewBox="0 0 24 24">{TAB_ICONS.sprint}</svg>
            </span>
          </Link>
          <Link to="/puzzles/mistakes" className="home-card home-tile">
            <strong>Mistakes</strong>
            <small>{mistakes && !waiting ? 'None waiting' : 'From your games'}</small>
            {waiting > 0 && (
              <b className="tile-count" aria-label={`${waiting} waiting`}>
                {num(waiting)}
              </b>
            )}
          </Link>
        </nav>
      </div>
    </PuzzleLayout>
  )
}
