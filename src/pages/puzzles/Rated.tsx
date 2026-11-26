// Rated puzzles' panel: the puzzle and the game it's from, your rating and chapter, and your last ten.
import { useEffect, useState, type ReactNode } from 'react'
import { Flame } from '../../components/PuzzleIcons'
import { Skel } from '../../components/Skeleton'
import { SpeedIcon } from '../../components/SpeedIcon'
import type { Color } from '../../lib/evaluation'
import { PUZZLE_PIECE } from '../../lib/nav'
import { chapterAt } from '../../lib/puzzlePath'
import { puzzleGame, type PuzzleGame } from '../../lib/puzzleGame'
import { themeLabels, themeName, type Puzzle } from '../../lib/puzzles'
import { RECENT_RESULTS, type PuzzleProgress } from '../../lib/puzzleStore'
import { sideName } from './shared'

const num = (n: number) => n.toLocaleString('en-US')
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)

const TICK = 'M5 12.5l4.5 4.5L19 7.5'
const CROSS = 'M6.5 6.5l11 11M17.5 6.5l-11 11'

/** A line with its mark in a column of its own, so every line's words start at the same place. */
function Line({ icon, className = '', children }: { icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <span className={`rp-line ${className}`}>
      <span className="rp-line-icon">{icon}</span>
      <span>{children}</span>
    </span>
  )
}

const Mark = ({ d }: { d: string }) => (
  <svg className="rp-mark" viewBox="0 0 24 24" aria-hidden>
    <path d={d} />
  </svg>
)

/** The puzzle's game from Lichess: undefined while it's on its way, null if Lichess can't say. */
function usePuzzleGame(id: string): PuzzleGame | null | undefined {
  const [state, setState] = useState<{ id: string; game?: PuzzleGame | null }>({ id })
  if (state.id !== id) setState({ id })
  useEffect(() => {
    let live = true
    void puzzleGame(id).then((game) => live && setState({ id, game }))
    return () => {
      live = false
    }
  }, [id])
  return state.id === id ? state.game : undefined
}

/** The game's clock and speed, how often the puzzle's been played, and who played it (White first). */
function GameLines({ game }: { game: PuzzleGame | null | undefined }) {
  // Always three lines' room, so nothing moves when the game arrives.
  if (game === undefined)
    return (
      <span className="rp-game" aria-hidden>
        <Skel w="75%" h="12px" />
        <Skel w="45%" h="12px" />
        <Skel w="50%" h="12px" />
      </span>
    )
  if (!game)
    return (
      <span className="rp-game">
        <Line icon={null}>From a game on Lichess</Line>
      </span>
    )
  return (
    <span className="rp-game">
      <Line icon={<SpeedIcon speed={game.speed} time={game.clock} />}>
        {game.clock} {game.perf} <span className="rp-muted">· played {num(game.plays)} times</span>
      </Line>
      {game.players.map((p) => (
        <Line key={p.color} icon={<i className={`rp-dot ${p.color}`} aria-label={sideName(p.color)} />}>
          {p.title && <b className="rp-title">{p.title} </b>}
          {p.name} {p.rating != null && <span className="rp-muted">{p.rating}</span>}
        </Line>
      ))}
    </span>
  )
}

/**
 * The puzzle: its number (a link to it on Lichess), whose move it is or how it went, and the game it's from. Its
 * rating and themes show once it's over, so they can't give the answer away.
 */
export function RatedInfo({ puzzle, color, over, clean }: { puzzle: Puzzle; color: Color; over: boolean; clean: boolean }) {
  const game = usePuzzleGame(puzzle.id)
  const themes = themeLabels(puzzle.themes)
  return (
    <section className="rp-info" aria-label="This puzzle">
      <div className="rp-info-top">
        <svg className="rp-info-icon" viewBox="16 16 224 224" aria-hidden>
          <path d={PUZZLE_PIECE} />
        </svg>
        <div className="rp-lines">
          <h2 className="rp-head">
            Puzzle{' '}
            <a href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer" title="Open on Lichess">
              #{puzzle.id}
            </a>
          </h2>
          {over ? (
            <Line className={`rp-turn ${clean ? 'good' : 'bad'}`} icon={<Mark d={clean ? TICK : CROSS} />}>
              {clean ? 'Solved' : 'Missed'} <span className="rp-muted">· rating {num(puzzle.rating)}</span>
            </Line>
          ) : (
            <Line
              className="rp-turn"
              icon={
                <span className="rp-king">
                  <span className={`card-piece king ${color}`} />
                </span>
              }
            >
              {sideName(color)} to move
            </Line>
          )}
          <GameLines game={game} />
        </div>
      </div>
      {over && themes.length > 0 && (
        <ul className="theme-chips rp-chips" aria-label="Themes">
          {themes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Your rating with the last change and Rated; under it the bar of your chapter's XP, the run you're on and where you
 * are (or the theme you picked).
 */
export function RatedScore({ progress, delta, theme, onRated }: { progress: PuzzleProgress; delta?: number; theme?: string; onRated: (rated: boolean) => void }) {
  const { index, into, need } = chapterAt(progress.xp)
  const where = theme ? themeName(theme) : `Chapter ${index + 1}`
  return (
    <section className="rp-score" aria-label="Your rating">
      <div className="rp-score-top">
        <strong className="puzzle-num">{num(progress.rating)}</strong>
        {delta != null && (
          <span key={progress.played} className={`rp-delta ${delta >= 0 ? 'up' : 'down'}`}>
            {signed(delta)}
          </span>
        )}
        <label className="rp-switch">
          Rated
          <span className="switch">
            <input type="checkbox" checked={progress.prefs.rated} onChange={(e) => onRated(e.target.checked)} />
            <span className="switch-track" />
          </span>
        </label>
      </div>
      <div className="rp-bar" role="progressbar" aria-label={`${where}: XP`} aria-valuemin={0} aria-valuemax={need} aria-valuenow={into}>
        <span style={{ width: `${(into / need) * 100}%` }} />
      </div>
      <div className="rp-under">
        <span className={`rp-run ${progress.streak ? 'lit' : ''}`} title="Rated puzzles solved in a row">
          <Flame size={16} lit={progress.streak > 0} />
          <strong>{progress.streak}</strong> in a row
        </span>
        <span>
          {where} · {into} / {need} XP
        </span>
      </div>
    </section>
  )
}

/** Your last ten rated puzzles: a tick or a cross each (pointed at, the rating change); the one on the board waits. */
export function RecentResults({ recent, playing }: { recent: PuzzleProgress['recent']; playing: boolean }) {
  const shown = recent.slice(-(playing ? RECENT_RESULTS - 1 : RECENT_RESULTS))
  const won = shown.filter((r) => r.won).length
  const empty = RECENT_RESULTS - shown.length - (playing ? 1 : 0)
  return (
    <section className="rp-recent" aria-label="Your last ten">
      <div className="rp-recent-head">
        <span>Last {RECENT_RESULTS}</span>
        {shown.length > 0 && (
          <span>
            {won} of {shown.length}
          </span>
        )}
      </div>
      <ol>
        {shown.map((r, i) => (
          <li key={`${r.id}-${i}`} className={r.won ? 'won' : 'lost'} title={`${r.won ? 'Solved' : 'Missed'}${r.delta != null ? ` · ${signed(r.delta)}` : ''}`}>
            <Mark d={r.won ? TICK : CROSS} />
          </li>
        ))}
        {playing && <li className="now" aria-label="This puzzle" />}
        {Array.from({ length: Math.max(0, empty) }, (_, i) => (
          <li key={`e${i}`} className="empty" aria-hidden />
        ))}
      </ol>
    </section>
  )
}
