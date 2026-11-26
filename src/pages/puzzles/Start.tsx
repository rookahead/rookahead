import { useEffect, useRef, useState } from 'react'
import { CoachFace } from '../../components/CoachFace'
import { useDailyPuzzle } from '../../components/DailyCard'
import { LegendFlip } from '../../components/HomeArt'
import { Link } from '../../components/Link'
import { MiniBoard } from '../../components/MiniBoard'
import { ScrollHandle } from '../../components/ScrollHandle'
import { TypedLine } from '../../components/TypedLine'
import { TAB_ICONS } from '../../components/Tabs'
import { useMistakes } from '../../hooks/useMistakes'
import { formatDay } from '../../lib/home'
import { chapterAt, markSeen, seenChapter } from '../../lib/puzzlePath'
import { localDayNumber, playerColor, positionAfter } from '../../lib/puzzles'
import { dayStreak, type PuzzleProgress } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'
import { BoardPath } from './BoardPath'
import { PuzzleLayout } from './shared'

const num = (n: number) => n.toLocaleString('en-US')

/**
 * Desktop Puzzles: where the modes start. The coach, over the left side as on Home, says what's worth doing today;
 * under it your chapters climbing a board, where a board would be. Beside it, with no panel round them (like Play's front), the four modes as Home's square tiles.
 */
export function PuzzleStart({ progress, settings }: { progress: PuzzleProgress; settings: Settings }) {
  const column = useRef<HTMLDivElement>(null)
  // Moved on a chapter since the path last showed you (solving, then leaving without a Next): it hops you there now.
  const chapter = chapterAt(progress.xp).index
  const [seen] = useState(seenChapter)
  useEffect(() => {
    if (seen == null || seen >= chapter) markSeen(chapter)
  }, [seen, chapter])
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
      hub
      head={null}
      above={
        // The coach's word for today, as Home greets you: its face, then the line typed out beside it.
        <header className="home-top start-coach">
          <div className="home-coach">
            <span className="home-coach-face">
              <CoachFace happy={false} moodKey={say} />
            </span>
            <div className="home-welcome">
              <h1 aria-label={say}>
                <TypedLine text={say} />
              </h1>
            </div>
          </div>
        </header>
      }
      board={
        // In the board's place, your progress: your chapters climbing a board in your colours.
        <BoardPath progress={progress} settings={settings} from={seen ?? undefined} onHopped={() => markSeen(chapter)} />
      }
    >
      {/* As tall as the board: on a short window it scrolls, with Home's thin handle. */}
      <div ref={column} className="puzzle-start">
        {/* The four modes as Home's tiles, square, two by two: rated puzzles first, in Play online's blues. */}
        <nav className="home-grid start-grid" aria-label="Puzzle modes">
          <Link to="/puzzles/rated" className="home-card home-tile rated-tile">
            <strong>Rated puzzles</strong>
            <small>Picked near your rating</small>
            {/* Your rating, the bar to the next hundred, and how far that is. */}
            <span className="rated-score">
              <strong className="rated-num">{num(progress.rating)}</strong>
              <span className="rated-track" aria-hidden>
                <span style={{ width: `${progress.rating - from}%` }} />
              </span>
              <small>
                {from + 100 - progress.rating} to {num(from + 100)}
              </small>
            </span>
          </Link>
          <Link to="/puzzles/daily" className="home-card home-tile">
            <strong>Daily puzzle</strong>
            <small>{done === 'solved' ? 'Solved' : done === 'failed' ? 'Missed' : formatDay(Date.now() / 1000)}</small>
            <span className="home-tile-art tile-board" aria-hidden>
              {daily ? <MiniBoard fen={daily.fen} orientation={daily.color} theme={settings.boardTheme} lastMove={daily.last} /> : <span className="skel tile-board-blank" />}
            </span>
          </Link>
          <Link to="/puzzles/sprint" className="home-card home-tile">
            <strong>Puzzle Sprint</strong>
            <small>{best ? `Best ${best}` : 'Against the clock'}</small>
            <span className="home-tile-art tile-bolt" aria-hidden>
              <svg viewBox="0 0 24 24">{TAB_ICONS.sprint}</svg>
            </span>
          </Link>
          {/* As on Home: the blunder mark that turns Legendary while you point at it. */}
          <Link to="/puzzles/mistakes" className="home-card home-tile mistakes-tile">
            <strong>Fix your mistakes</strong>
            <small>{!mistakes ? 'From your games' : waiting ? `${num(waiting)} waiting` : 'None waiting'}</small>
            <span className="home-tile-art" aria-hidden>
              <LegendFlip />
            </span>
          </Link>
        </nav>
        {/* Every kind of puzzle, to practise one: the themes page. */}
        <Link to="/puzzles/themes" className="home-card themes-entry">
          <svg className="themes-entry-icon" viewBox="0 0 24 24" aria-hidden>
            {TAB_ICONS.themes}
          </svg>
          <span>
            <strong>Puzzle themes</strong>
            <small>Forks, pins, mates and more: practise one</small>
          </span>
          <svg className="themes-entry-go" viewBox="0 0 24 24" aria-hidden>
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      </div>
      <ScrollHandle target={column} />
    </PuzzleLayout>
  )
}
