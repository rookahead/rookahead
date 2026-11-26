import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Board } from '../components/Board'
import { FlipIcon, NavIcon } from '../components/NavIcons'
import { PageHeader } from '../components/PageHeader'
import { Flame, PuzzleIcon } from '../components/PuzzleIcons'
import { Link } from '../components/Link'
import { TAB_ICONS } from '../components/Tabs'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { formatDay } from '../lib/home'
import type { RookMood } from '../lib/coach'
import type { Color } from '../lib/evaluation'
import { useImmersive } from '../lib/immersive'
import { canPlayOut, playItOut } from '../lib/practice'
import { dailyLine, nextRatedLine, nextThemeLine } from '../lib/puzzleData'
import { chapterAt, markSeen, seenChapter } from '../lib/puzzlePath'
import { THEME_KEYS } from '../lib/puzzleThemes'
import { dayNumber, DIFFICULTY, localDayNumber, parsePuzzleLine, playerColor, puzzleGoal, solvedLine, themeLabels, themeName, type Difficulty, type Puzzle } from '../lib/puzzles'
import { dayStreak, loadProgress, recordDay, recordRated, saveProgress, startRated, type PuzzleProgress } from '../lib/puzzleStore'
import { isPuzzleHub, puzzleTab, puzzleTheme, usePathname, type PuzzleTab } from '../lib/router'
import { writeSession } from '../lib/session'
import type { Settings } from '../lib/settings'
import { playSound } from '../lib/sound'
import { useStoreVersion } from '../lib/syncBus'
import { logUse } from '../lib/usage'
import { addLine, createTree, mainlineToPgn, ROOT_ID } from '../lib/tree'
import { BoardPath } from './puzzles/BoardPath'
import { PuzzleHub } from './puzzles/Hub'
import { PuzzleStart } from './puzzles/Start'
import { ThemesView } from './puzzles/Themes'
import { MistakesView } from './puzzles/Mistakes'
import { clockFace, DayStreak, lastMoveOf, Placeholder, PuzzleCoach, PuzzleLayout, sideName, usePuzzleSolve, useStepKeys, type Tone, type Update, type ViewProps } from './puzzles/shared'
import { SprintView } from './puzzles/Sprint'

interface Props {
  /** Phones: it's the page sliding away. */
  leaving?: boolean
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  /** A game or position has been put in the session: show it in Analysis. */
  onOpenAnalysis: () => void
}

/** Puzzles: rated Lichess puzzles, Puzzle Sprint, today's daily puzzle, and your own mistakes. */
export function PuzzlesPage({ leaving = false, settings, updateSettings, onOpenAnalysis }: Props) {
  // Sliding away, it stays the list of modes: the address has already moved on.
  const live = usePathname()
  const pathname = leaving ? '/puzzles' : live
  const tab = puzzleTab(pathname)
  // One theme's puzzles (/puzzles/themes/fork); a theme we don't know shows the list.
  const theme = tab === 'themes' ? puzzleTheme(pathname) : null
  const known = theme && THEME_KEYS.has(theme) ? theme : null
  // Plain /puzzles is where the modes start: a phone's path of chapters, the start page on desktop. A mode opens
  // on its own, with Back to it.
  const phone = useMediaQuery('(max-width: 1000px)')
  const hub = isPuzzleHub(pathname)
  useImmersive(phone && !hub)
  const [progress, setProgress] = useState(loadProgress)
  // A sync pass brought progress from the account: carry on from it.
  const version = useStoreVersion('puzzles')
  const [loadedVersion, setLoadedVersion] = useState(version)
  if (version !== loadedVersion) {
    setLoadedVersion(version)
    setProgress(loadProgress())
  }
  const update: Update = useCallback((change) => {
    setProgress((p) => {
      const next = change(p)
      saveProgress(next)
      return next
    })
  }, [])

  // Desktop: the panel's top says which mode this is, with Back to the start page (a phone has its page bar). The
  // start page has no panel, so no top.
  const head = phone || hub ? null : <PanelHead tab={tab} theme={known} />
  const props: ViewProps = { progress, update, settings, updateSettings, head, onOpenAnalysis }
  return (
    <div className="play-page puzzles-page">
      {/* Desktop has the page's name at the top of the panel, so the board gets the height. */}
      <PageHeader phoneOnly title="Puzzles" back={hub ? undefined : known ? '/puzzles/themes' : '/puzzles'} phoneTitle={known ? themeName(known) : MODE_NAMES[tab]} />
      {hub && phone ? (
        <PuzzleHub progress={progress} settings={settings} />
      ) : hub ? (
        <PuzzleStart progress={progress} settings={settings} />
      ) : (
        <>
          {tab === 'rated' && <RatedView {...props} />}
          {tab === 'sprint' && <SprintView {...props} />}
          {tab === 'daily' && <DailyView {...props} />}
          {tab === 'mistakes' && <MistakesView {...props} />}
          {tab === 'themes' && (known ? <RatedView key={known} {...props} theme={known} /> : <ThemesView />)}
        </>
      )}
    </div>
  )
}

const MODE_NAMES: Record<PuzzleTab, string> = { rated: 'Rated puzzles', sprint: 'Puzzle Sprint', daily: 'Daily puzzle', mistakes: 'Fix your mistakes', themes: 'Puzzle themes' }

/** The top of the panel: the mode's name with Back to the start page; a theme's name with Back to the themes. */
function PanelHead({ tab, theme }: { tab: PuzzleTab; theme: string | null }) {
  return (
    <div className="panel-top">
      <div className="panel-top-side">
        <Link to={theme ? '/puzzles/themes' : '/puzzles'} className="icon-btn" aria-label={theme ? 'Back to Puzzle themes' : 'Back to Puzzles'} title={theme ? 'Back to Puzzle themes' : 'Back to Puzzles'}>
          <NavIcon name="back" />
        </Link>
      </div>
      <h1 className="panel-title">
        <svg className="line-icon panel-title-icon" viewBox="0 0 24 24" aria-hidden>
          {TAB_ICONS[tab]}
        </svg>
        {theme ? themeName(theme) : MODE_NAMES[tab]}
      </h1>
      <div className="panel-top-side end" />
    </div>
  )
}

/** Opens a puzzle in Analysis: its start position with the moves played so far. */
function analysePuzzle(puzzle: Puzzle, played: string[], onOpenAnalysis: () => void) {
  const { tree } = addLine(createTree(puzzle.fen), ROOT_ID, played)
  // The side you played is "You"; the board faces it.
  const you = playerColor(puzzle)
  const pgn = mainlineToPgn(tree, {
    Event: 'Lichess puzzle',
    Site: `https://lichess.org/training/${puzzle.id}`,
    White: you === 'white' ? 'You (White)' : 'White',
    Black: you === 'black' ? 'You (Black)' : 'Black',
  })
  writeSession({ pgn, orientation: you, currentPly: Math.min(1, played.length), evals: {} })
  onOpenAnalysis()
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)

/** Rated puzzles: the steps of your chapter; with a `theme`, puzzles of that kind near your rating instead. */
function RatedView({ progress, update, settings, head, onOpenAnalysis, theme }: ViewProps & { theme?: string }) {
  // Resume the puzzle on the board if it hasn't counted yet; otherwise fetch the next one.
  const [line, setLine] = useState<string | null>(() => (progress.current && !progress.current.result ? progress.current.line : null))
  const [error, setError] = useState(false)
  const progressRef = useRef(progress)
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  // The next puzzle is fetched while you solve this one, so Next puzzle is instant: near your rating (moved by the
  // difficulty you picked), and of the theme if there is one.
  const upcoming = useRef<{ line: Promise<string>; difficulty: Difficulty } | null>(null)
  const fetchNext = useCallback(
    (exclude: string[]) => {
      const { rating, seen, prefs } = progressRef.current
      const base = rating + DIFFICULTY[prefs.difficulty].offset
      const line = theme ? nextThemeLine(theme, base, [...seen, ...exclude]) : nextRatedLine(base, [...seen, ...exclude])
      line.catch(() => {})
      upcoming.current = { line, difficulty: prefs.difficulty }
    },
    [theme],
  )

  const next = useCallback(() => {
    setError(false)
    // Fetched ahead for another difficulty (changed since): fetch again.
    if (upcoming.current?.difficulty !== progressRef.current.prefs.difficulty) fetchNext([])
    const line = upcoming.current!.line
    upcoming.current = null
    line.then(
      (l) => {
        update((p) => startRated(p, l))
        setLine(l)
        fetchNext([l.split(' ')[0]])
      },
      () => {
        setLine(null)
        setError(true)
      },
    )
  }, [update, fetchNext])

  // Moving on from a chapter's last puzzle: the board turns to your path, you hop to the next chapter, then the next
  // puzzle comes. `hop` is the chapter you're hopping from.
  const [hop, setHop] = useState<number | null>(null)
  const hopping = useRef(false)
  useEffect(() => {
    if (seenChapter() == null) markSeen(chapterAt(progressRef.current.xp).index)
  }, [])
  const goNext = useCallback(() => {
    if (hopping.current) return
    // A theme's puzzles aren't your path: the hop waits for the path (Rated, or the start page).
    if (theme) return next()
    const chapter = chapterAt(progressRef.current.xp).index
    const seen = seenChapter()
    if (seen != null && seen < chapter) {
      hopping.current = true
      setHop(seen)
      return
    }
    markSeen(chapter)
    next()
  }, [next, theme])
  const landed = useCallback(() => {
    markSeen(chapterAt(progressRef.current.xp).index)
    hopping.current = false
    setHop(null)
    next()
  }, [next])

  // First visit: fetch a puzzle, or (resuming one) fetch the one after it.
  const fetched = useRef(false)
  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    if (line) fetchNext([line.split(' ')[0]])
    else next()
  }, [line, next, fetchNext])

  const puzzle = line ? parsePuzzleLine(line) : null
  if (!puzzle) return <Placeholder head={head} settings={settings} error={error} onRetry={next} />
  const current = progress.current?.line === line ? progress.current : undefined
  const delta = current?.delta
  const days = dayStreak(progress, localDayNumber(new Date()))
  // Where you are: the theme you picked, or your chapter and the XP you have in it.
  const { index, into, need } = chapterAt(progress.xp)
  const unrated = progress.prefs.rated ? null : 'Unrated'
  const where = (theme ? [themeName(theme), unrated] : [`Chapter ${index + 1}`, `${into} of ${need} XP`, unrated]).filter(Boolean).join(' · ')

  return (
    <Solver
      kind="rated"
      puzzle={puzzle}
      settings={settings}
      head={head}
      counted={Boolean(current?.result)}
      onResult={(won) => update(() => recordRated(progressRef.current, won))}
      onNext={goNext}
      autoNext={progress.prefs.autoNext}
      boardOverride={hop != null ? <BoardPath progress={progress} settings={settings} from={hop} onHopped={landed} /> : undefined}
      onAnalyse={(played) => analysePuzzle(puzzle, played, onOpenAnalysis)}
      points={delta != null && delta > 0 ? signed(delta) : undefined}
      missNote="This puzzle now counts as a miss."
      score={(clock) => <RatedScore progress={progress} delta={delta} clock={clock} where={where} />}
      prefs={
        <RatedPrefs prefs={progress.prefs} onChange={(prefs) => update((p) => ({ ...p, prefs }))}>
          Best run {progress.bestStreak} · {days}-day streak · {num(progress.solved)} solved of {num(progress.played)}
        </RatedPrefs>
      }
    />
  )
}

const num = (n: number) => n.toLocaleString('en-US')

/** Your puzzle rating with the last change, the run you're on, where you are in your chapter, and how far the next hundred is. */
function RatedScore({ progress, delta, clock, where }: { progress: PuzzleProgress; delta?: number; clock: ReactNode; where: string }) {
  const from = Math.floor(progress.rating / 100) * 100
  return (
    <div className="puzzle-score">
      <div className={`puzzle-score-top ${clock ? 'with-clock' : ''}`}>
        <strong className="puzzle-num">{num(progress.rating)}</strong>
        {delta != null && (
          <span key={progress.played} className={`puzzle-delta ${delta >= 0 ? 'up' : 'down'}`}>
            {signed(delta)}
          </span>
        )}
        <span className={`puzzle-run ${progress.streak ? 'lit' : ''}`} title="Rated puzzles solved in a row">
          <Flame size={18} lit={progress.streak > 0} />
          <strong key={progress.streak}>{progress.streak}</strong>
        </span>
        {clock}
      </div>
      <div className="puzzle-track">
        <span style={{ width: `${progress.rating - from}%` }} />
      </div>
      <div className="puzzle-to">
        <span>{where}</span>
        <span>
          {from + 100 - progress.rating} to {num(from + 100)}
        </span>
      </div>
    </div>
  )
}

/** The rated puzzles' options, with your numbers (`children`) under them. */
function RatedPrefs({ prefs, onChange, children }: { prefs: PuzzleProgress['prefs']; onChange: (p: PuzzleProgress['prefs']) => void; children: ReactNode }) {
  return (
    <div className="puzzle-prefs">
      <label className="pref-row">
        <span>Rated</span>
        <span className="switch">
          <input type="checkbox" checked={prefs.rated} onChange={(e) => onChange({ ...prefs, rated: e.target.checked })} />
          <span className="switch-track" />
        </span>
      </label>
      <label className="pref-row">
        <span>Jump to next puzzle</span>
        <span className="switch">
          <input type="checkbox" checked={prefs.autoNext} onChange={(e) => onChange({ ...prefs, autoNext: e.target.checked })} />
          <span className="switch-track" />
        </span>
      </label>
      <label className="pref-row">
        <span>Difficulty</span>
        <select className="pref-select" value={prefs.difficulty} onChange={(e) => onChange({ ...prefs, difficulty: e.target.value as Difficulty })}>
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY[d].label}
            </option>
          ))}
        </select>
      </label>
      <p className="puzzle-stats">{children}</p>
    </div>
  )
}

function DailyView({ progress, update, settings, head, onOpenAnalysis }: ViewProps) {
  const [today] = useState(() => new Date())
  const day = dayNumber(today)
  const [line, setLine] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(() => void dailyLine(today).then(setLine, () => setError(true)), [today])
  useEffect(load, [load])
  const retry = () => {
    setError(false)
    load()
  }

  const puzzle = line ? parsePuzzleLine(line) : null
  if (!puzzle) return <Placeholder head={head} settings={settings} error={error} onRetry={retry} />
  const done = progress.daily?.day === day ? progress.daily.result : undefined
  return (
    <Solver
      kind="daily"
      key={puzzle.id}
      puzzle={puzzle}
      settings={settings}
      head={head}
      counted={Boolean(done)}
      onResult={(won) => update((p) => (p.daily?.day === day ? p : { ...p, daily: { day, result: won ? 'solved' : 'failed' } }))}
      onSolved={() => update((p) => recordDay(p, localDayNumber(new Date())))}
      onAnalyse={(played) => analysePuzzle(puzzle, played, onOpenAnalysis)}
      missNote="Today’s puzzle now counts as a miss."
      score={(clock) => (
        <div className="puzzle-score">
          <div className={`puzzle-score-top ${clock ? 'with-clock' : ''}`}>
            <strong className="puzzle-num date">{formatDay(today.getTime() / 1000)}</strong>
            {done && <span className={`puzzle-delta ${done === 'solved' ? 'up' : 'down'}`}>{done === 'solved' ? 'Solved' : 'Missed'}</span>}
            <DayStreak days={dayStreak(progress, day)} />
            {clock}
          </div>
          <div className="puzzle-to">
            <span>Daily puzzle</span>
            <span>The same for everyone today</span>
          </div>
        </div>
      )}
    />
  )
}

interface SolverProps {
  kind: 'rated' | 'daily'
  puzzle: Puzzle
  settings: Settings
  head: ReactNode
  /** The mode's numbers (the rating, or the day), with the clock beside them where it's handed one (phones). */
  score: (clock: ReactNode) => ReactNode
  /** The result has already counted (a refresh after a wrong move, or today's daily done). */
  counted: boolean
  /** The first outcome: a wrong move or a hint (false), or solved cleanly (true). */
  onResult: (won: boolean) => void
  /** Solved by you, cleanly or not (for the day streak). */
  onSolved?: () => void
  /** Another puzzle (rated); none for the daily. */
  onNext?: () => void
  /** Go to the next puzzle by itself after a solve. */
  autoNext?: boolean
  onAnalyse: (played: string[]) => void
  /** What a clean solve earned ("+12"): it pops on the board with the tick. */
  points?: string
  /** What a wrong move costs, said after "Try again." */
  missNote?: string
  /** Options, opened from the foot of the panel. */
  prefs?: ReactNode
  /** Shown in the board's place for a moment (your path, as you move on a chapter). */
  boardOverride?: ReactNode
}

/** How long this puzzle has been on the board, in seconds, counting while `running`; and a way to start it again. */
function useSolveSeconds(id: string, running: boolean): [number, () => void] {
  const [clock, setClock] = useState({ id, seconds: 0 })
  if (clock.id !== id) setClock({ id, seconds: 0 })
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setClock((c) => ({ ...c, seconds: c.seconds + 1 })), 1000)
    return () => clearInterval(t)
  }, [id, running])
  const reset = useCallback(() => setClock((c) => ({ ...c, seconds: 0 })), [])
  return [clock.id === id ? clock.seconds : 0, reset]
}

const PIECES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/**
 * Solving a Lichess puzzle at your own pace (Rated and Daily). The rook says what to look for and how each
 * move went; the numbers, the clock and one clear next step follow. On a phone the rook's line sits over the
 * board and the rest under it, in the same order.
 */
function Solver({ kind, puzzle, settings, head, score, counted, onResult, onSolved, onNext, autoNext, onAnalyse, points, missNote, prefs, boardOverride }: SolverProps) {
  const phone = useMediaQuery('(max-width: 1000px)')
  const color = playerColor(puzzle)
  const s = usePuzzleSolve(puzzle, settings.soundVolume)
  const [flipped, setFlipped] = useState(false)
  const [hint, setHint] = useState<number | null>(null)
  const [options, setOptions] = useState(false)
  const [seconds, resetClock] = useSolveSeconds(puzzle.id, !s.over)
  // The puzzle whose result has been reported (it counts once).
  const [reported, setReported] = useState<string | null>(counted ? puzzle.id : null)
  const [puzzleId, setPuzzleId] = useState(puzzle.id)
  if (puzzleId !== puzzle.id) {
    setPuzzleId(puzzle.id)
    setHint(null)
    setReported(counted ? puzzle.id : null)
  }
  const report = (won: boolean) => {
    if (reported === puzzle.id) return
    setReported(puzzle.id)
    onResult(won)
  }
  const flip = useCallback(() => setFlipped((f) => !f), [])
  useStepKeys(s.step, flip)

  // After a solve, the next puzzle comes by itself when that's switched on.
  useEffect(() => {
    if (!s.solve.solved || !autoNext || !onNext) return
    const t = setTimeout(onNext, 1000)
    return () => clearTimeout(t)
  }, [s.solve.solved, autoNext, onNext])

  const onMove = (move: { from: string; to: string; promotion?: string }) => {
    const result = s.play(move.from + move.to + (move.promotion ?? ''))
    if (!result) return
    setHint(null)
    if (result === 'wrong') {
      playSound('fail', settings.soundVolume)
      report(false)
    } else if (result === 'solved') {
      playSound('success', settings.soundVolume)
      report(true)
      onSolved?.()
      logUse('puzzle_solved', kind)
    }
  }

  const hintSquare = hint !== null && hint === s.solve.played.length && s.yourTurn ? puzzle.moves[hint].slice(0, 2) : null
  // Hint, twice: first the piece to move, then the move itself (one move, and you carry on from there).
  const onHint = () => {
    report(false)
    if (!hintSquare) return setHint(s.solve.played.length)
    setHint(null)
    s.show()
  }

  const again = () => {
    setHint(null)
    resetClock()
    s.restart()
  }

  const orientation: Color = flipped ? (color === 'white' ? 'black' : 'white') : color
  const toMove = `${sideName(color)} to move`
  const hintPiece = hintSquare ? new Chess(s.node.fen).get(hintSquare as Square)?.type : undefined
  const say: { tone: Tone; label: string; line: string; mood: RookMood } = s.solve.solved
    ? { tone: 'good', label: 'Solved', line: solvedLine(puzzle), mood: s.solve.failed ? 'pleased' : 'proud' }
    : hintSquare
      ? { tone: 'turn', label: toMove, line: `This ${hintPiece ? PIECES[hintPiece] : 'piece'} has the move.`, mood: 'thinking' }
      : s.wrong || s.lastResult === 'wrong'
        ? { tone: 'bad', label: 'Not that one', line: missNote ? `Try again. ${missNote}` : 'Try again.', mood: 'ouch' }
        : s.lastResult === 'correct' && !s.viewing
          ? { tone: 'good', label: 'Best move', line: 'Keep going.', mood: 'pleased' }
          : { tone: 'turn', label: toMove, line: puzzleGoal(puzzle), mood: 'neutral' }
  const coach = <PuzzleCoach {...say} color={color} moodKey={`${puzzle.id}:${s.solve.played.length}:${say.label}:${hintSquare ?? ''}`} />

  const clock = (
    <span className="puzzle-time" title="Time on this puzzle">
      <PuzzleIcon name="clock" />
      {clockFace(seconds)}
    </span>
  )
  const steps = (
    <>
      <button className={phone ? 'ctrl' : 'icon-btn panel-strip-end'} onClick={() => s.step('prev')} disabled={s.ply === 0} aria-label="Previous move" title="Previous move (←)">
        <NavIcon name="prev" />
      </button>
      <button className={phone ? 'ctrl' : 'icon-btn'} onClick={() => s.step('next')} disabled={s.ply >= s.lastPly} aria-label="Next move" title="Next move (→)">
        <NavIcon name="next" />
      </button>
    </>
  )
  const themes = themeLabels(puzzle.themes)
  const shapes: DrawShape[] = hintSquare ? [{ orig: hintSquare as Key, brush: 'suggest' }] : []

  const body = (s.over || (options && prefs)) && (
    <>
      {s.over && (
        <div className="puzzle-info">
          <ul className="theme-chips" aria-label="About this puzzle">
            {themes.map((t) => (
              <li key={t}>{t}</li>
            ))}
            <li>Rated {num(puzzle.rating)}</li>
          </ul>
          <a className="puzzle-source" href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer">
            Puzzle {puzzle.id} from Lichess ↗
          </a>
        </div>
      )}
      {options && prefs}
    </>
  )
  const actions = (
    <div className="puzzle-acts">
      {s.over ? (
        <>
          <button className="ctrl" onClick={again} aria-label="Try it again" title="Try it again">
            <PuzzleIcon name="retry" />
          </button>
          {onNext && (
            <button className="ctrl" onClick={() => onAnalyse(s.solve.played)} aria-label="Analyse" title="Analyse">
              <PuzzleIcon name="analyse" />
            </button>
          )}
          {phone && steps}
          {onNext ? (
            <button className="btn accent-btn" onClick={onNext}>
              Next
              <NavIcon name="next" />
            </button>
          ) : (
            <button className="btn ghost" onClick={() => onAnalyse(s.solve.played)}>
              Analyse
            </button>
          )}
        </>
      ) : (
        <>
          <button className="btn ghost" onClick={onHint} disabled={!s.yourTurn} title={hintSquare ? 'Plays this one move for you.' : 'Shows the piece to move. The puzzle counts as a miss.'}>
            <PuzzleIcon name="hint" />
            {hintSquare ? 'Show the move' : 'Hint'}
          </button>
          {onNext && s.solve.failed && (
            <button className="btn ghost puzzle-skip" onClick={onNext}>
              Skip
            </button>
          )}
          {phone && steps}
        </>
      )}
    </div>
  )
  const strip = (
    <div className="panel-strip puzzle-strip">
      {prefs && (
        <button className={`icon-btn ${options ? 'active' : ''}`} onClick={() => setOptions((o) => !o)} aria-pressed={options} aria-label="Puzzle options" title="Puzzle options">
          <PuzzleIcon name="options" />
        </button>
      )}
      <button className="icon-btn" onClick={flip} aria-label="Flip board" title="Flip board (F)">
        <FlipIcon />
      </button>
      {s.over && canPlayOut(s.node.fen) && (
        <button className="icon-btn strip-label" onClick={() => playItOut(s.node.fen, orientation)} title="Play this position on against the coach">
          <PuzzleIcon name="playout" />
          Play it out
        </button>
      )}
      {!phone && steps}
    </div>
  )

  return (
    <PuzzleLayout
      head={head}
      above={phone && coach}
      board={
        boardOverride ?? (
          <Board
            key={puzzle.id}
            fen={s.node.fen}
            orientation={orientation}
            lastMove={lastMoveOf(s.node)}
            shapes={shapes}
            theme={settings.boardTheme}
            coordinates={settings.coordinates}
            onMove={onMove}
            // Premoves on: your next move can be queued while the reply comes, and plays as it lands.
            locked={s.over || s.viewing || Boolean(s.wrong) || (!settings.premoves && !s.yourTurn)}
            premove={settings.premoves ? color : undefined}
            mark={s.mark}
            markNote={s.solve.solved && !s.solve.failed ? points : undefined}
          />
        )
      }
    >
      {phone ? (
        <>
          {score(clock)}
          {actions}
          {strip}
          {body && <div className="puzzle-body">{body}</div>}
        </>
      ) : (
        <>
          {coach}
          {score(null)}
          <div className="panel-body puzzle-body">{body}</div>
          <div className="puzzle-time-row">{clock}</div>
          {actions}
          {strip}
        </>
      )}
    </PuzzleLayout>
  )
}
