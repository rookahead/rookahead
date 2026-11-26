import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CoachFace } from '../../components/CoachFace'
import { useDailyPuzzle } from '../../components/DailyCard'
import { FixMark } from '../../components/HomeArt'
import { DailyIcon } from '../../components/HomeWidgets'
import { Link } from '../../components/Link'
import { TILE_ICONS } from '../../components/IconTile'
import { ScrollHandle } from '../../components/ScrollHandle'
import { TypedLine } from '../../components/TypedLine'
import { TAB_ICONS } from '../../components/Tabs'
import { useMistakes } from '../../hooks/useMistakes'
import { formatDay } from '../../lib/home'
import { chapterAt, markSeen, seenChapter } from '../../lib/puzzlePath'
import { localDayNumber } from '../../lib/puzzles'
import { dayStreak, type PuzzleProgress } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'
import { BoardPath } from './BoardPath'
import { PuzzleLayout } from './shared'

const num = (n: number) => n.toLocaleString('en-US')

/**
 * The line under the rated tile's rating: how the last rated puzzle moved it; once you've solved three or more in a
 * row, that run first, the two taking turns.
 */
function RatedLine({ progress }: { progress: PuzzleProgress }) {
  const { lastChange: change, streak, bestStreak, solved } = progress
  const changeLine = change ? (
    <span className={`rated-line ${change > 0 ? 'up' : 'down'}`}>
      {change > 0 ? '▲' : '▼'} {Math.abs(change)} <i>last puzzle</i>
    </span>
  ) : null
  // A run counts from three: it leads, then the change takes its turn. Below that, only the change.
  const runLine =
    streak >= 3 ? (
      <span className="rated-line">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={TILE_ICONS.streak} />
        </svg>
        {num(streak)} in a row {bestStreak > streak && <i>· best {num(bestStreak)}</i>}
      </span>
    ) : null
  const lines: ReactNode[] = [runLine, changeLine].filter((l) => l != null)
  if (!lines.length) lines.push(<span className="rated-line">{solved ? <i>{num(solved)} solved</i> : <i>Picked near your rating</i>}</span>)
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    if (lines.length < 2) return
    const id = setInterval(() => setTurn((t) => t + 1), 4500)
    return () => clearInterval(id)
  }, [lines.length])
  const at = turn % lines.length
  // A fade as each takes its turn (keyed, so it starts again).
  return (
    <span key={at} className="rated-lines">
      {lines[at]}
    </span>
  )
}

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
  // None waiting once some are fixed: all fixed (found and loaded, so it isn't said before they're counted).
  const fixed = mistakes != null && progress.mistakesSolved.length > 0
  const { done } = useDailyPuzzle()
  const days = dayStreak(progress, localDayNumber(new Date()))
  const best = Math.max(0, ...Object.values(progress.sprintBest).map(Number))

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
            <small>Your rating</small>
            {/* Your rating, big, and under it in turn how the last puzzle moved it and your run solved in a row. */}
            <span className="rated-score">
              <strong className="rated-num">{num(progress.rating)}</strong>
              <RatedLine progress={progress} />
            </span>
          </Link>
          <Link to="/puzzles/daily" className="home-card home-tile">
            <strong>Daily puzzle</strong>
            <small>{done === 'solved' ? 'Solved' : done === 'failed' ? 'Missed' : formatDay(Date.now() / 1000)}</small>
            {/* Home's daily-puzzle widget mark: the calendar page shaped like a piece, ticked once it's done. */}
            <span className="home-tile-art tile-daily" aria-hidden>
              <DailyIcon done={!!done} />
            </span>
          </Link>
          <Link to="/puzzles/sprint" className="home-card home-tile">
            <strong>Puzzle Sprint</strong>
            <small>{best ? `Best ${best}` : 'Against the clock'}</small>
            <span className="home-tile-art tile-bolt" aria-hidden>
              <svg viewBox="0 0 24 24">{TAB_ICONS.sprint}</svg>
            </span>
          </Link>
          {/* Its picture keeps still, as every tile's here does: the review's Blunder mark, fixed. */}
          <Link to="/puzzles/mistakes" className="home-card home-tile mistakes-tile">
            <strong>Fix your mistakes</strong>
            <small>{waiting ? `${num(waiting)} waiting` : fixed ? 'All fixed' : 'From your games'}</small>
            <span className="home-tile-art" aria-hidden>
              <FixMark />
            </span>
          </Link>
        </nav>
        {/* Every kind of puzzle, to practise one: the themes page. */}
        <Link to="/puzzles/themes" className="home-card themes-entry">
          {/* In the text's colour, as the sidebar's menus have it. */}
          <svg className="themes-entry-icon" viewBox="0 0 256 256" aria-hidden>
            <path d="M120,56v48a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40h48A16,16,0,0,1,120,56Zm80-16H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm-96,96H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm96,0H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Z" />
          </svg>
          <span>
            <strong>Puzzle themes</strong>
            <small>Forks, pins, mates and more</small>
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
