import type { CSSProperties } from 'react'
import { boardColors } from '../../components/Board'
import { Link } from '../../components/Link'
import { Flame } from '../../components/PuzzleIcons'
import { chapterAt, puzzlePath, type Stop } from '../../lib/puzzlePath'
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
 * Phones' Puzzles tab: your streaks and your path of chapters, reached with XP from every puzzle;
 * the tab bar's button goes on from the current one, and its menu has the other modes (TabBar.tsx).
 */
export function PuzzleHub({ progress, settings }: { progress: PuzzleProgress; settings: Settings }) {
  return (
    <main className="puzzle-hub" style={squareColors(settings)}>
      <header className="puzzle-hub-head">
        <h1>Puzzles</h1>
        <span>
          Rating <strong>{progress.rating}</strong>
        </span>
      </header>
      <HubStreaks progress={progress} />
      <PuzzlePath progress={progress} />
    </main>
  )
}

/** Your board's two square colours, for the path's tiles. */
export function squareColors(settings: Settings) {
  const { light, dark } = boardColors(settings.boardTheme, settings.palette)
  return { '--sq-light': light, '--sq-dark': dark } as CSSProperties
}

/** Days in a row with a puzzle solved, rated puzzles solved in a row, and your best run. */
export function HubStreaks({ progress }: { progress: PuzzleProgress }) {
  const days = dayStreak(progress, localDayNumber(new Date()))
  return (
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
  )
}

/** Your path of chapters, five rated puzzles each: the ones ahead at the top, the one you're on, the ones done under it. */
export function PuzzlePath({ progress }: { progress: PuzzleProgress }) {
  const path = puzzlePath(progress.xp)
  const at = chapterAt(progress.xp)
  const shown = path.stops.slice(Math.max(0, path.current - BEHIND)).reverse()
  return (
    <>
      <p className="path-intro">
        Your path: <strong>every puzzle earns XP</strong> toward the next chapter.
      </p>
      <ol className="puzzle-path" aria-label="Your puzzle path">
        {shown.map((stop) => (
          <PathStop key={stop.index} stop={stop} into={at.into} need={at.need} />
        ))}
      </ol>
    </>
  )
}

/** Its XP as five dots under the tile, filling as you earn. */
const DOTS = 5

function PathStop({ stop, into, need }: { stop: Stop; into: number; need: number }) {
  const lean = SWING[stop.index % SWING.length]
  const swing = { '--swing': lean } as CSSProperties
  const square = stop.index % 2 ? 'dark' : 'light'
  const chapter = stop.index + 1
  const filled = stop.state === 'done' ? DOTS : stop.state === 'current' ? Math.floor((into / need) * DOTS) : 0
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
  const what = `${into} of ${need} XP`
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
        {Array.from({ length: DOTS }, (_, i) => (
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
