import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Board } from '../components/Board'
import { PageHeader } from '../components/PageHeader'
import { Flame } from '../components/PuzzleIcons'
import { TAB_ICONS, Tabs } from '../components/Tabs'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMistakes } from '../hooks/useMistakes'
import { formatDay } from '../lib/home'
import { useImmersive } from '../lib/immersive'
import { dailyLine, nextRatedLine } from '../lib/puzzleData'
import { dayNumber, DIFFICULTY, localDayNumber, parsePuzzleLine, playerColor, themeLabels, type Difficulty, type Puzzle } from '../lib/puzzles'
import { dayStreak, loadProgress, recordDay, recordRated, saveProgress, startRated, type PuzzleProgress } from '../lib/puzzleStore'
import { isPuzzleHub, puzzleTab, usePathname, type PuzzleTab } from '../lib/router'
import { writeSession } from '../lib/session'
import type { Settings } from '../lib/settings'
import { playSound } from '../lib/sound'
import { useStoreVersion } from '../lib/syncBus'
import { addLine, createTree, mainlineToPgn, ROOT_ID } from '../lib/tree'
import { PuzzleHub } from './puzzles/Hub'
import { MistakesView } from './puzzles/Mistakes'
import { DayStreak, Feedback, lastMoveOf, Placeholder, PuzzleLayout, sideName, StepNav, usePuzzleSolve, useStepKeys, type Update, type ViewProps } from './puzzles/shared'
import { SprintView } from './puzzles/Sprint'

interface Props {
  settings: Settings
  /** A game or position has been put in the session: show it in Analysis. */
  onOpenAnalysis: () => void
}

/** Puzzles: rated Lichess puzzles, Puzzle Sprint, today's daily puzzle, and your own mistakes. */
export function PuzzlesPage({ settings, onOpenAnalysis }: Props) {
  const pathname = usePathname()
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
  const props: ViewProps = { progress, update, settings, tabs, onOpenAnalysis }
  return (
    <div className="play-page puzzles-page">
      <PageHeader title="Puzzles" back={hub ? undefined : '/puzzles'} phoneTitle={MODE_NAMES[tab]} />
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

const MODE_NAMES: Record<PuzzleTab, string> = { rated: 'Rated puzzles', sprint: 'Puzzle Sprint', daily: 'Daily puzzle', mistakes: 'Your mistakes' }

function PuzzleTabs({ tab, solved }: { tab: PuzzleTab; solved: string[] }) {
  const mistakes = useMistakes()
  // Mistakes solved on this page don't reach the shared list until it re-reads: leave them out here.
  const waiting = mistakes?.filter((m) => !solved.includes(m.id)).length
  return (
    <Tabs
      label="Puzzle modes"
      value={tab}
      items={[
        { id: 'rated', to: '/puzzles', label: 'Rated', icon: TAB_ICONS.rated, tone: 'sky' },
        { id: 'sprint', to: '/puzzles/sprint', label: 'Sprint', icon: TAB_ICONS.sprint, tone: 'amber' },
        { id: 'daily', to: '/puzzles/daily', label: 'Daily', icon: TAB_ICONS.daily, tone: 'violet' },
        { id: 'mistakes', to: '/puzzles/mistakes', label: 'Your mistakes', icon: TAB_ICONS.mistakes, tone: 'rose', badge: waiting },
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
  // This visit's results, as chips under the board.
  const [session, setSession] = useState<{ id: string; delta: number }[]>([])
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

  const onResult = (won: boolean) => {
    const after = recordRated(progressRef.current, won)
    update(() => after)
    const d = after.current?.delta
    if (d != null) setSession((s) => [...s, { id: puzzle.id, delta: d }])
  }

  return (
    <Solver
      puzzle={puzzle}
      settings={settings}
      tabs={tabs}
      counted={Boolean(current?.result)}
      onResult={onResult}
      onNext={next}
      autoNext={progress.prefs.autoNext}
      onAnalyse={(played) => analysePuzzle(puzzle, played, onOpenAnalysis)}
      solvedDetail={delta != null ? `${signed(delta)} · ${progress.streak > 1 ? `${progress.streak} in a row` : `rating ${progress.rating}`}` : undefined}
      hints
      head={
        <div className="puzzle-head">
          <div className="puzzle-rating">
            <span className="muted">Puzzle rating</span>
            <strong>{progress.rating}</strong>
            {delta != null && <span className={`rating-delta ${delta >= 0 ? 'up' : 'down'}`}>{signed(delta)}</span>}
          </div>
          <div className="streak-tiles">
            <div className={`streak-tile ${progress.streak ? 'hot' : ''}`} title="Rated puzzles solved in a row">
              <Flame size={20} lit={progress.streak > 0} />
              <strong key={progress.streak}>{progress.streak}</strong>
              <span>in a row</span>
            </div>
            <div className="streak-tile" title="Your longest run">
              <svg viewBox="0 0 24 24" className="tile-icon" aria-hidden>
                <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" />
              </svg>
              <strong>{progress.bestStreak}</strong>
              <span>best run</span>
            </div>
            <div className={`streak-tile ${days ? 'hot' : ''}`} title="Days in a row with a puzzle solved">
              <svg viewBox="0 0 24 24" className="tile-icon" aria-hidden>
                <path d="M5 6h14v14H5zM5 10h14M9 3v4M15 3v4" />
              </svg>
              <strong key={days}>{days}</strong>
              <span>day streak</span>
            </div>
          </div>
          <span className="muted">
            {progress.solved} solved of {progress.played}
          </span>
        </div>
      }
      below={
        session.length > 0 && (
          <ul className="session-chips" aria-label="This session">
            {session.map((c, i) => (
              <li key={i}>
                <a className={c.delta >= 0 ? 'up' : 'down'} href={`https://lichess.org/training/${c.id}`} target="_blank" rel="noreferrer" title={`Puzzle ${c.id} on Lichess`}>
                  {signed(c.delta)}
                </a>
              </li>
            ))}
          </ul>
        )
      }
      prefs={<RatedPrefs prefs={progress.prefs} onChange={(prefs) => update((p) => ({ ...p, prefs }))} />}
    />
  )
}

function RatedPrefs({ prefs, onChange }: { prefs: PuzzleProgress['prefs']; onChange: (p: PuzzleProgress['prefs']) => void }) {
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
      key={puzzle.id}
      puzzle={puzzle}
      settings={settings}
      tabs={tabs}
      counted={Boolean(done)}
      onResult={(won) => update((p) => (p.daily?.day === day ? p : { ...p, daily: { day, result: won ? 'solved' : 'failed' } }))}
      onSolved={() => update((p) => recordDay(p, localDayNumber(new Date())))}
      onAnalyse={(played) => analysePuzzle(puzzle, played, onOpenAnalysis)}
      solvedDetail="A new puzzle every day. Come back tomorrow."
      head={
        <div className="puzzle-head">
          <div className="puzzle-rating">
            <span className="muted">Daily puzzle</span>
            <strong className="date">{formatDay(today.getTime() / 1000)}</strong>
            {done && <span className={`rating-delta ${done === 'solved' ? 'up' : 'down'}`}>{done === 'solved' ? 'Solved' : 'Missed'}</span>}
            <DayStreak days={dayStreak(progress, day)} />
          </div>
          <span className="muted">The same puzzle for everyone today.</span>
        </div>
      }
    />
  )
}

interface SolverProps {
  puzzle: Puzzle
  settings: Settings
  tabs: ReactNode
  head: ReactNode
  /** The result has already counted (a refresh after a wrong move, or today's daily done). */
  counted: boolean
  /** The first outcome: a wrong move, a hint or the solution shown (false), or solved cleanly (true). */
  onResult: (won: boolean) => void
  /** Solved, cleanly or not (for the day streak). */
  onSolved?: () => void
  /** Another puzzle (rated); none for the daily. */
  onNext?: () => void
  /** Go to the next puzzle by itself after a solve. */
  autoNext?: boolean
  onAnalyse: (played: string[]) => void
  /** The line under "Solved!". */
  solvedDetail?: string
  /** Offer a hint (it counts as a miss). */
  hints?: boolean
  below?: ReactNode
  /** Settings at the foot of the panel. */
  prefs?: ReactNode
}

/** Solving a Lichess puzzle at your own pace (Rated and Daily). */
function Solver({ puzzle, settings, tabs, head, counted, onResult, onSolved, onNext, autoNext, onAnalyse, solvedDetail, hints, below, prefs }: SolverProps) {
  const color = playerColor(puzzle)
  const s = usePuzzleSolve(puzzle, settings.soundVolume)
  const [flipped, setFlipped] = useState(false)
  const [hint, setHint] = useState<number | null>(null)
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
    }
  }

  const reveal = () => {
    report(false)
    setHint(null)
    s.reveal()
  }

  const showHint = () => {
    report(false)
    setHint(s.solve.played.length)
  }

  const feedback = s.wrong
    ? { kind: 'bad' as const, title: 'Not the move', detail: 'Try something else.' }
    : s.solve.solved
      ? s.solve.failed
        ? { kind: 'good' as const, title: 'Solved', detail: 'Counted as a miss after the wrong move or hint.' }
        : { kind: 'good' as const, title: 'Solved!', detail: solvedDetail }
      : s.solve.revealed
        ? { kind: 'neutral' as const, title: 'Solution shown', detail: 'Step through it, then try the next one.' }
        : s.lastResult === 'correct' && !s.viewing
          ? { kind: 'good' as const, title: 'Best move!', detail: 'Keep going…' }
          : { kind: 'turn' as const, title: 'Your turn', detail: `Find the best move for ${sideName(color)}.` }

  const hintSquare = hint !== null && hint === s.solve.played.length && s.yourTurn ? puzzle.moves[hint].slice(0, 2) : null
  const shapes: DrawShape[] = hintSquare ? [{ orig: hintSquare as Key, brush: 'suggest' }] : []
  const themes = themeLabels(puzzle.themes)
  return (
    <PuzzleLayout
      tabs={tabs}
      below={below}
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
        />
      }
    >
      {head}
      <Feedback {...feedback} color={color} />
      <div className="panel-body puzzle-body">
        {s.over && (
          <div className="puzzle-info">
            <p>
              Puzzle rated <strong>{puzzle.rating}</strong>
            </p>
            {themes.length > 0 && (
              <ul className="theme-chips" aria-label="Themes">
                {themes.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            <a className="puzzle-source" href={`https://lichess.org/training/${puzzle.id}`} target="_blank" rel="noreferrer">
              Puzzle {puzzle.id} from Lichess ↗
            </a>
          </div>
        )}
        {prefs}
      </div>
      <StepNav at={s.ply} last={s.lastPly} onStep={s.step} onFlip={flip} />
      <div className="play-actions">
        {s.over ? (
          <>
            {onNext && (
              <button className="btn accent-btn puzzle-next" onClick={onNext}>
                Next puzzle
              </button>
            )}
            <button className="btn ghost" onClick={() => onAnalyse(s.solve.played)}>
              Analyse
            </button>
          </>
        ) : (
          <>
            {hints && (
              <button className="btn ghost" onClick={showHint} disabled={!s.yourTurn || hintSquare !== null} title="Shows the piece to move. The puzzle counts as a miss.">
                Hint
              </button>
            )}
            <button className="btn ghost" onClick={reveal} disabled={!s.settled && s.solve.played.length === 1}>
              View solution
            </button>
            {onNext && s.solve.failed && (
              <button className="btn ghost" onClick={onNext}>
                Next puzzle
              </button>
            )}
          </>
        )}
      </div>
    </PuzzleLayout>
  )
}
