import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { nextRatedLine } from '../../lib/puzzleData'
import { dayNumber, parsePuzzleLine, playerColor, sprintRating, SPRINT_MODES, SPRINT_STRIKES, type Puzzle, type SprintMode } from '../../lib/puzzles'
import { dayStreak, recordSprint } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'
import { playSound } from '../../lib/sound'
import { DayStreak, EmptyBoard, Feedback, lastMoveOf, PuzzleLayout, sideName, usePuzzleSolve, type SolveTiming, type ViewProps } from './shared'

interface RunEntry {
  id: string
  rating: number
  solved: boolean
}

interface Finished {
  mode: SprintMode
  history: RunEntry[]
  newBest: boolean
  best: number
}

/** Quick replies: in a sprint the clock is running. */
const QUICK: SolveTiming = { first: 250, reply: 150, wrong: 450 }
const MODES = Object.keys(SPRINT_MODES) as SprintMode[]

function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Puzzle Sprint: as many puzzles as you can, getting harder, until the clock or three mistakes stop you. */
export function SprintView({ progress, update, settings, tabs }: ViewProps) {
  const [mode, setMode] = useState<SprintMode>('3min')
  const [running, setRunning] = useState<{ mode: SprintMode; key: number } | null>(null)
  const [finished, setFinished] = useState<Finished | null>(null)
  const progressRef = useRef(progress)
  useEffect(() => {
    progressRef.current = progress
  }, [progress])
  const days = dayStreak(progress, dayNumber(new Date()))

  const start = (m: SprintMode) => {
    setMode(m)
    setFinished(null)
    setRunning({ mode: m, key: Date.now() })
  }

  const end = useCallback(
    (m: SprintMode, history: RunEntry[]) => {
      const score = history.filter((e) => e.solved).length
      const { progress: next, newBest } = recordSprint(progressRef.current, m, score)
      update(() => next)
      if (newBest) playSound('end', settings.soundVolume)
      setRunning(null)
      setFinished({ mode: m, history, newBest, best: next.sprintBest[m] ?? 0 })
    },
    [update, settings.soundVolume],
  )

  if (running) return <SprintRun key={running.key} mode={running.mode} settings={settings} tabs={tabs} onEnd={(h) => end(running.mode, h)} />

  if (finished) {
    const score = finished.history.filter((e) => e.solved).length
    const top = Math.max(0, ...finished.history.filter((e) => e.solved).map((e) => e.rating))
    return (
      <PuzzleLayout tabs={tabs} board={<EmptyBoard settings={settings} />} below={<RunChips history={finished.history} />}>
        <div className="puzzle-head">
          <div className="puzzle-rating">
            <span className="muted">Puzzle Sprint · {SPRINT_MODES[finished.mode].label}</span>
            <DayStreak days={days} />
          </div>
        </div>
        <div className="panel-body puzzle-body">
          <div className="sprint-result">
            <strong>{score}</strong>
            <span>{score === 1 ? 'puzzle solved' : 'puzzles solved'}</span>
            {finished.newBest ? <span className="new-best">New best!</span> : <span className="muted">Your best: {finished.best}</span>}
          </div>
          {top > 0 && (
            <p className="sprint-note">
              Hardest puzzle solved: <strong>{top}</strong>
            </p>
          )}
        </div>
        <div className="play-actions">
          <button className="btn accent-btn puzzle-next" onClick={() => start(finished.mode)}>
            Play again
          </button>
          <button className="btn ghost" onClick={() => setFinished(null)}>
            Change mode
          </button>
        </div>
      </PuzzleLayout>
    )
  }

  return (
    <PuzzleLayout tabs={tabs} board={<EmptyBoard settings={settings} />}>
      <div className="puzzle-head">
        <div className="puzzle-rating">
          <span className="sprint-title">Puzzle Sprint</span>
          <DayStreak days={days} />
        </div>
        <span className="muted">Puzzles start easy and get harder. Three mistakes and the run is over.</span>
      </div>
      <div className="panel-body puzzle-body">
        <div className="sprint-modes" role="radiogroup" aria-label="Sprint mode">
          {MODES.map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={`sprint-mode ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              <strong>{SPRINT_MODES[m].label}</strong>
              <span>{SPRINT_MODES[m].blurb}</span>
              <span className="sprint-best">{progress.sprintBest[m] ? `Best ${progress.sprintBest[m]}` : 'No score yet'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="play-actions single">
        <button className="btn accent-btn puzzle-next" onClick={() => start(mode)}>
          Start sprint
        </button>
      </div>
    </PuzzleLayout>
  )
}

function RunChips({ history }: { history: RunEntry[] }) {
  if (!history.length) return null
  return (
    <ul className="session-chips" aria-label="This run">
      {history.map((e, i) => (
        <li key={i}>
          <a className={e.solved ? 'up' : 'down'} href={`https://lichess.org/training/${e.id}`} target="_blank" rel="noreferrer" title={`Puzzle ${e.id} on Lichess`}>
            {e.solved ? '✓' : '✗'} {e.rating}
          </a>
        </li>
      ))}
    </ul>
  )
}

/** One run: fetches puzzles up the rating ladder (the next one ahead of time) and keeps the clock. */
function SprintRun({ mode, settings, tabs, onEnd }: { mode: SprintMode; settings: Settings; tabs: ReactNode; onEnd: (history: RunEntry[]) => void }) {
  const limit = SPRINT_MODES[mode].ms
  const [history, setHistory] = useState<RunEntry[]>([])
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const ids = useRef<string[]>([])
  const upcoming = useRef<Promise<string> | null>(null)
  const historyRef = useRef(history)
  const ended = useRef(false)

  const finish = useCallback(
    (h: RunEntry[]) => {
      if (ended.current) return
      ended.current = true
      onEnd(h)
    },
    [onEnd],
  )

  const fetchFor = (n: number) => nextRatedLine(sprintRating(n), ids.current, Math.random, 50)

  /** Shows puzzle number `n`, from the line fetched ahead if there is one. */
  const show = (n: number) => {
    const line = upcoming.current ?? fetchFor(n)
    upcoming.current = null
    line.then(
      (l) => {
        if (ended.current) return
        const p = parsePuzzleLine(l)
        if (!p) return finish(historyRef.current)
        ids.current.push(p.id)
        setPuzzle(p)
        if (limit && n === 0) setEndsAt(Date.now() + limit)
        upcoming.current = fetchFor(n + 1)
        upcoming.current.catch(() => {})
      },
      () => finish(historyRef.current),
    )
  }

  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    show(0)
  })

  // The clock: the run ends when it reaches zero.
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= endsAt) finish(historyRef.current)
    }, 200)
    return () => clearInterval(id)
  }, [endsAt, finish])

  const done = (solved: boolean) => {
    if (!puzzle || ended.current) return
    const h = [...historyRef.current, { id: puzzle.id, rating: puzzle.rating, solved }]
    historyRef.current = h
    setHistory(h)
    if (h.filter((e) => !e.solved).length >= SPRINT_STRIKES) return finish(h)
    show(h.length)
  }

  const strikes = history.filter((e) => !e.solved).length
  const score = history.length - strikes
  const left = endsAt ? endsAt - now : limit
  const head = (
    <div className="sprint-head">
      <div className={`sprint-clock ${left !== null && left < 20_000 ? 'low' : ''}`}>{left === null ? 'Survival' : formatClock(left)}</div>
      <div className="sprint-score">
        <strong key={score}>{score}</strong>
        <span>solved</span>
      </div>
      <div className="sprint-strikes" aria-label={`${strikes} of ${SPRINT_STRIKES} mistakes`}>
        {Array.from({ length: SPRINT_STRIKES }, (_, i) => (
          <span key={i} className={i < strikes ? 'used' : ''}>
            ✗
          </span>
        ))}
      </div>
    </div>
  )

  if (!puzzle) {
    return (
      <PuzzleLayout tabs={tabs} board={<EmptyBoard settings={settings} />}>
        {head}
        <div className="panel-body puzzle-body">
          <p className="puzzle-message muted">Getting the first puzzle…</p>
        </div>
      </PuzzleLayout>
    )
  }
  return (
    <SprintPuzzle
      puzzle={puzzle}
      number={history.length + 1}
      settings={settings}
      tabs={tabs}
      head={head}
      below={<RunChips history={history} />}
      onDone={done}
      onQuit={() => finish(historyRef.current)}
    />
  )
}

interface SprintPuzzleProps {
  puzzle: Puzzle
  number: number
  settings: Settings
  tabs: ReactNode
  head: ReactNode
  below: ReactNode
  onDone: (solved: boolean) => void
  onQuit: () => void
}

function SprintPuzzle({ puzzle, number, settings, tabs, head, below, onDone, onQuit }: SprintPuzzleProps) {
  const color = playerColor(puzzle)
  const s = usePuzzleSolve(puzzle, settings.soundVolume, QUICK)
  const [result, setResult] = useState<boolean | null>(null)
  const [puzzleId, setPuzzleId] = useState(puzzle.id)
  if (puzzleId !== puzzle.id) {
    setPuzzleId(puzzle.id)
    setResult(null)
  }
  // The run re-renders with every clock tick; the timer below mustn't restart each time.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  // A short beat to see the last move (or the wrong one), then the next puzzle.
  useEffect(() => {
    if (result === null) return
    const t = setTimeout(() => onDoneRef.current(result), result ? 300 : QUICK.wrong)
    return () => clearTimeout(t)
  }, [result])

  const onMove = (move: { from: string; to: string; promotion?: string }) => {
    if (result !== null) return
    const r = s.play(move.from + move.to + (move.promotion ?? ''))
    if (r === 'wrong') {
      playSound('fail', settings.soundVolume)
      setResult(false)
    } else if (r === 'solved') {
      playSound('success', settings.soundVolume)
      setResult(true)
    }
  }

  const feedback =
    result === false
      ? { kind: 'bad' as const, title: 'Not the move', detail: 'That costs a life.' }
      : result
        ? { kind: 'good' as const, title: 'Solved!', detail: 'Next one…' }
        : s.lastResult === 'correct'
          ? { kind: 'good' as const, title: 'Best move!', detail: 'Keep going…' }
          : { kind: 'turn' as const, title: 'Your turn', detail: `Puzzle ${number} · ${sideName(color)} to play · rated ${puzzle.rating}` }

  return (
    <PuzzleLayout
      tabs={tabs}
      below={below}
      board={
        <Board
          key={puzzle.id}
          fen={s.node.fen}
          orientation={color}
          lastMove={lastMoveOf(s.node)}
          shapes={[]}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={onMove}
          locked={!s.yourTurn || result !== null}
          mark={s.mark}
        />
      }
    >
      {head}
      <Feedback {...feedback} color={color} />
      <div className="panel-body puzzle-body" />
      <div className="play-actions single">
        <button className="btn ghost" onClick={onQuit}>
          End run
        </button>
      </div>
    </PuzzleLayout>
  )
}
