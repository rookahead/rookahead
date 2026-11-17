import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Board } from '../components/Board'
import { FlipIcon, NavIcon } from '../components/NavIcons'
import { PageHeader } from '../components/PageHeader'
import { Flame, PuzzleIcon } from '../components/PuzzleIcons'
import { TAB_ICONS, Tabs } from '../components/Tabs'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMistakes } from '../hooks/useMistakes'
import { formatDay } from '../lib/home'
import type { RookMood } from '../lib/coach'
import { useImmersive } from '../lib/immersive'
import { dailyLine, nextRatedLine } from '../lib/puzzleData'
import { dayNumber, DIFFICULTY, localDayNumber, parsePuzzleLine, playerColor, puzzleGoal, solvedLine, themeLabels, type Difficulty, type Puzzle } from '../lib/puzzles'
import { dayStreak, loadProgress, recordDay, recordRated, saveProgress, startRated, type PuzzleProgress } from '../lib/puzzleStore'
import { isPuzzleHub, puzzleTab, usePathname, type PuzzleTab } from '../lib/router'
import { writeSession } from '../lib/session'
import type { Settings } from '../lib/settings'
import { playSound } from '../lib/sound'
import { useStoreVersion } from '../lib/syncBus'
import { logUse } from '../lib/usage'
import { addLine, createTree, mainlineToPgn, ROOT_ID } from '../lib/tree'
import { PuzzleHub } from './puzzles/Hub'
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
  // Phones: plain /puzzles lists the modes; a mode opens full screen, with Back to that list.
  const phone = useMediaQuery('(max-width: 1000px)')
  const hub = phone && isPuzzleHub(pathname)
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

  const tabs = phone ? null : <PuzzleTabs tab={tab} solved={progress.mistakesSolved} />
  const props: ViewProps = { progress, update, settings, updateSettings, tabs, onOpenAnalysis }
  return (
    <div className="play-page puzzles-page">
      {/* Desktop has the page's name at the top of the panel, so the board gets the height. */}
      <PageHeader phoneOnly title="Puzzles" back={hub ? undefined : '/puzzles'} phoneTitle={MODE_NAMES[tab]} />
      {hub ? (
        <PuzzleHub progress={progress} settings={settings} />
      ) : (
        <>
          {tab === 'rated' && <RatedView {...props} />}
          {tab === 'sprint' && <SprintView {...props} />}
          {tab === 'daily' && <DailyView {...props} />}
          {tab === 'mistakes' && <MistakesView {...props} />}
        </>
      )}
    </div>
  )
}

const MODE_NAMES: Record<PuzzleTab, string> = { rated: 'Rated puzzles', sprint: 'Puzzle Sprint', daily: 'Daily puzzle', mistakes: 'Fix your mistakes' }

function PuzzleTabs({ tab, solved }: { tab: PuzzleTab; solved: string[] }) {
  const mistakes = useMistakes()
  // Mistakes solved on this page don't reach the shared list until it re-reads: leave them out here.
  const waiting = mistakes?.filter((m) => !solved.includes(m.id)).length
  return (
    <Tabs
      label="Puzzle modes"
      value={tab}
      items={[
        { id: 'rated', to: '/puzzles', label: 'Rated', icon: TAB_ICONS.rated },
        { id: 'sprint', to: '/puzzles/sprint', label: 'Sprint', icon: TAB_ICONS.sprint },
        { id: 'daily', to: '/puzzles/daily', label: 'Daily', icon: TAB_ICONS.daily },
        { id: 'mistakes', to: '/puzzles/mistakes', label: 'Mistakes', icon: TAB_ICONS.mistakes, badge: waiting },
      ]}
    />
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

function RatedView({ progress, update, settings, tabs, onOpenAnalysis }: ViewProps) {
  // Resume the puzzle on the board if it hasn't counted yet; otherwise fetch the next one.
  const [line, setLine] = useState<string | null>(() => (progress.current && !progress.current.result ? progress.current.line : null))
  const [error, setError] = useState(false)
  const progressRef = useRef(progress)
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  // The next puzzle is fetched while you solve this one, so Next puzzle is instant.
  const upcoming = useRef<{ line: Promise<string>; difficulty: Difficulty } | null>(null)
  const fetchNext = useCallback((exclude: string[]) => {
    const { rating, seen, prefs } = progressRef.current
    const line = nextRatedLine(rating + DIFFICULTY[prefs.difficulty].offset, [...seen, ...exclude])
    line.catch(() => {})
    upcoming.current = { line, difficulty: prefs.difficulty }
  }, [])

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

  // First visit: fetch a puzzle, or (resuming one) fetch the one after it.
  const fetched = useRef(false)
  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    if (line) fetchNext([line.split(' ')[0]])
    else next()
  }, [line, next, fetchNext])

  const puzzle = line ? parsePuzzleLine(line) : null
  if (!puzzle) return <Placeholder tabs={tabs} settings={settings} error={error} onRetry={next} />
  const current = progress.current?.line === line ? progress.current : undefined
  const delta = current?.delta
  const days = dayStreak(progress, localDayNumber(new Date()))

  return (
    <Solver
      kind="rated"
      puzzle={puzzle}
      settings={settings}
      tabs={tabs}
      counted={Boolean(current?.result)}
      onResult={(won) => update(() => recordRated(progressRef.current, won))}
      onNext={next}
      autoNext={progress.prefs.autoNext}
      onAnalyse={(played) => analysePuzzle(puzzle, played, onOpenAnalysis)}
      points={delta != null && delta > 0 ? signed(delta) : undefined}
      missNote="This puzzle now counts as a miss."
      score={(clock) => <RatedScore progress={progress} delta={delta} clock={clock} />}
      prefs={
        <RatedPrefs prefs={progress.prefs} onChange={(prefs) => update((p) => ({ ...p, prefs }))}>
          Best run {progress.bestStreak} · {days}-day streak · {num(progress.solved)} solved of {num(progress.played)}
        </RatedPrefs>
      }
    />
  )
}

const num = (n: number) => n.toLocaleString('en-US')

/** Your puzzle rating with the last change, the run you're on, and how far the next hundred is. */
function RatedScore({ progress, delta, clock }: { progress: PuzzleProgress; delta?: number; clock: ReactNode }) {
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
        <span>Puzzle rating</span>
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

function DailyView({ progress, update, settings, tabs, onOpenAnalysis }: ViewProps) {
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
  if (!puzzle) return <Placeholder tabs={tabs} settings={settings} error={error} onRetry={retry} />
  const done = progress.daily?.day === day ? progress.daily.result : undefined
  return (
    <Solver
      kind="daily"
      key={puzzle.id}
      puzzle={puzzle}
      settings={settings}
      tabs={tabs}
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
  tabs: ReactNode
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
function Solver({ kind, puzzle, settings, tabs, score, counted, onResult, onSolved, onNext, autoNext, onAnalyse, points, missNote, prefs }: SolverProps) {
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
      {!phone && steps}
    </div>
  )

  return (
    <PuzzleLayout
      tabs={tabs}
      above={phone && coach}
      board={
        <Board
          key={puzzle.id}
          fen={s.node.fen}
          orientation={flipped ? (color === 'white' ? 'black' : 'white') : color}
          lastMove={lastMoveOf(s.node)}
          shapes={shapes}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={onMove}
          locked={!s.yourTurn}
          mark={s.mark}
          markNote={s.solve.solved && !s.solve.failed ? points : undefined}
        />
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
