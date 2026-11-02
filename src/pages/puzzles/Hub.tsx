import type { CSSProperties } from 'react'
import { boardColors } from '../../components/Board'
import { Link } from '../../components/Link'
import { Flame } from '../../components/PuzzleIcons'
import { PER_STOP, puzzlePath, type Stop } from '../../lib/puzzlePath'
import { localDayNumber } from '../../lib/puzzles'
import { dayStreak, type PuzzleProgress } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'

/** Done stops kept on screen under the current one. */
const BEHIND = 8
/** The path's sideways swing, in steps of a tile's width, stop by stop. */
const SWING = [0, 0.8, 1.3, 0.8, 0, -0.8, -1.3, -0.8]

const CHECK = 'M5 12.5 10 17.5 19 7'
// The marker over the chapter you're on.
const ROOK = 'M7 4h2v2h2V4h2v2h2V4h2v4l-2 1.5V14l2 2v3H7v-3l2-2V9.5L7 8z'

/**
 * Phones' Puzzles tab: your streaks and your path of chapters, five rated puzzles each;
 * the tab bar's button goes on from the current one, and its menu has the other modes (TabBar.tsx).
 */
export function PuzzleHub({ progress, settings }: { progress: PuzzleProgress; settings: Settings }) {
  const path = puzzlePath(progress.played)
  const days = dayStreak(progress, localDayNumber(new Date()))
  const { light, dark } = boardColors(settings.boardTheme, settings.palette)
  const shown = path.stops.slice(Math.max(0, path.current - BEHIND)).reverse()
  return (
    <main className="puzzle-hub" style={{ '--sq-light': light, '--sq-dark': dark } as CSSProperties}>
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

      <p className="path-intro">
        Your path: <strong>5 rated puzzles</strong> to a chapter.
      </p>
      <ol className="puzzle-path" aria-label="Your puzzle path">
        {shown.map((stop) => (
          <PathStop key={stop.index} stop={stop} />
        ))}
      </ol>
    </main>
  )
}

function PathStop({ stop }: { stop: Stop }) {
  const lean = SWING[stop.index % SWING.length]
  const swing = { '--swing': lean } as CSSProperties
  const square = stop.index % 2 ? 'dark' : 'light'
  const chapter = stop.index + 1
  // Its five puzzles as dots under the tile, filled as you play them.
  const filled = stop.state === 'done' ? PER_STOP : (stop.inStop ?? 0)
  const tile = (
    <span className={`path-tile ${stop.state} ${square}`}>
      {stop.state === 'done' ? (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d={CHECK} />
        </svg>
      ) : (
        chapter
      )}
      {stop.state === 'current' && (
        <span className="path-marker" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d={ROOK} />
          </svg>
        </span>
      )}
    </span>
  )
  const what = `${stop.inStop ?? 0} of ${PER_STOP} puzzles`
  return (
    <li className={`path-stop ${stop.state} label-${lean > 0 ? 'left' : 'right'}`} style={swing} aria-current={stop.state === 'current' ? 'step' : undefined}>
      {stop.state === 'current' ? (
        <Link to="/puzzles/rated" className="path-tile-link" aria-label={`Chapter ${chapter}: ${what}`}>
          {tile}
        </Link>
      ) : (
        tile
      )}
      <span className="path-dots" aria-hidden>
        {Array.from({ length: PER_STOP }, (_, i) => (
          <i key={i} className={i < filled ? 'on' : undefined} />
        ))}
      </span>
      {stop.state === 'current' && (
        <span className="path-label">
          <strong>Chapter {chapter}</strong>
          <span>{what}</span>
        </span>
      )}
    </li>
  )
}
