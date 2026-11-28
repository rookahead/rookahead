import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { FlipIcon } from '../../components/NavIcons'
import { PuzzleIcon } from '../../components/PuzzleIcons'
import type { RookMood } from '../../lib/coach'
import { nextRatedLine, nextThemeLine } from '../../lib/puzzleData'
import { parsePuzzleLine, playerColor, puzzleGoal, sprintRating, SPRINT_MODES, SPRINT_STRIKES, themeName, type Puzzle, type SprintMode } from '../../lib/puzzles'
import { THEME_GROUPS, THEME_KEYS } from '../../lib/puzzleThemes'
import { recordSprint } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'
import { playSound } from '../../lib/sound'
import { logUse } from '../../lib/usage'
import { EmptyBoard, lastMoveOf, PuzzleCoach, PuzzlePanel, PuzzleScore, sideName, usePuzzleSolve, useStepKeys, type SolveTiming, type Tone, type ViewProps } from './shared'

interface RunEntry {
  id: string
  rating: number
  solved: boolean
}

interface Finished {
  mode: SprintMode
  theme: string | null
  history: RunEntry[]
  newBest: boolean
  best: number
}

/** Quick replies: in a sprint the clock is running. */
const QUICK: SolveTiming = { first: 250, reply: 150, wrong: 450 }
const MODES = Object.keys(SPRINT_MODES) as SprintMode[]
/** How far a Sprint puzzle may be from its step's rating (the steps are 60 apart). */
const NEAR = 40

const RECENT_KEY = 'rookahead.sprintRecent.v1'
/** How many of the last Sprint puzzles are kept out of the next runs. */
const RECENT_MAX = 400

function recentSprint(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveRecentSprint(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(-RECENT_MAX)))
  } catch {
    // Storage blocked: only this run's puzzles are kept out.
  }
}

/** The run going on, saved as it goes: leaving the page (or opening Settings) and coming back carries on with it. */
const RUN_KEY = 'rookahead.sprintRun.v1'

interface SavedRun {
  mode: SprintMode
  history: RunEntry[]
  /** The puzzle on the board (it starts again from its first move), or null while the next one was on its way. */
  line: string | null
  /** When a timed run's clock runs out: it keeps running while you're away. */
  endsAt: number | null
  /** One kind of puzzle only (a theme, "fork"), or every kind. */
  theme?: string | null
}

function loadRun(): SavedRun | null {
  try {
    const run = JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null') as SavedRun | null
    if (!run || !(run.mode in SPRINT_MODES) || !Array.isArray(run.history)) return null
    return run
  } catch {
    return null
  }
}

function saveRun(run: SavedRun | null) {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run))
    else localStorage.removeItem(RUN_KEY)
  } catch {
    // Storage blocked: the run lasts as long as the page.
  }
}

/** The kind of puzzle picked last, kept for the next visit. */
const TYPE_KEY = 'rookahead.sprintType.v1'

function loadType(): string | null {
  try {
    const t = localStorage.getItem(TYPE_KEY)
    return t && THEME_KEYS.has(t) ? t : null
  } catch {
    return null
  }
}

function saveType(theme: string | null) {
  try {
    if (theme) localStorage.setItem(TYPE_KEY, theme)
    else localStorage.removeItem(TYPE_KEY)
  } catch {
    // Storage blocked: every kind next time.
  }
}

function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const noStep = () => {}

/** Puzzle Sprint: as many puzzles as you can, getting harder, until the clock or three mistakes stop you. */
export function SprintView({ progress, update, settings, head }: ViewProps) {
  // A run left going carries on where it was.
  const [saved] = useState(loadRun)
  const [mode, setMode] = useState<SprintMode>(saved?.mode ?? '3min')
  // Every kind of puzzle (null), or one: forks only, mates in 2 only.
  const [theme, setTheme] = useState<string | null>(() => (saved ? (saved.theme ?? null) : loadType()))
  const [running, setRunning] = useState<{ mode: SprintMode; theme: string | null; key: number; resume?: SavedRun } | null>(
    saved && { mode: saved.mode, theme: saved.theme ?? null, key: 0, resume: saved },
  )
  const [finished, setFinished] = useState<Finished | null>(null)
  const progressRef = useRef(progress)
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  const start = (m: SprintMode, t: string | null) => {
    saveRun(null)
    setMode(m)
    setFinished(null)
    setRunning({ mode: m, theme: t, key: Date.now() })
  }

  const end = useCallback(
    (m: SprintMode, t: string | null, history: RunEntry[]) => {
      const score = history.filter((e) => e.solved).length
      // Bests are for runs of every kind.
      const { progress: next, newBest } = recordSprint(progressRef.current, m, score, undefined, !t)
      update(() => next)
      if (newBest) playSound('end', settings.soundVolume)
      setRunning(null)
      setFinished({ mode: m, theme: t, history, newBest, best: next.sprintBest[m] ?? 0 })
    },
    [update, settings.soundVolume],
  )

  if (running)
    return (
      <SprintRun
        key={running.key}
        mode={running.mode}
        theme={running.theme}
        resume={running.resume}
        best={running.theme ? 0 : (progress.sprintBest[running.mode] ?? 0)}
        settings={settings}
        head={head}
        onEnd={(h) => end(running.mode, running.theme, h)}
      />
    )

  if (finished) {
    const score = finished.history.filter((e) => e.solved).length
    const top = Math.max(0, ...finished.history.filter((e) => e.solved).map((e) => e.rating))
    const say: { tone: Tone; label: string; line: string; mood: RookMood } = finished.newBest
      ? { tone: 'good', label: 'New best', line: `${score} solved, your best yet.`, mood: 'proud' }
      : score
        ? { tone: 'plain', label: 'Run over', line: finished.theme ? `${score} solved.` : `${score} solved. Your best is ${finished.best}.`, mood: 'pleased' }
        : { tone: 'plain', label: 'Run over', line: 'None solved this time. Go again?', mood: 'ouch' }
    return (
      <PuzzlePanel
        head={head}
        board={<EmptyBoard settings={settings} />}
        below={<RunChips history={finished.history} />}
        coach={<PuzzleCoach {...say} color="white" moodKey={`sprint-end:${finished.history.length}`} />}
        score={
          <PuzzleScore
            num={score}
            unit={score === 1 ? 'puzzle solved' : 'puzzles solved'}
            track={{ at: finished.best && !finished.theme ? score / finished.best : 0 }}
            left={`Puzzle Sprint · ${SPRINT_MODES[finished.mode].label}${finished.theme ? ` · ${themeName(finished.theme)}` : ''}`}
            right={top > 0 ? `Hardest solved ${top}` : undefined}
          />
        }
        acts={
          <div className="puzzle-acts">
            <button className="btn ghost" onClick={() => setFinished(null)}>
              Change mode
            </button>
            <button className="btn accent-btn" onClick={() => start(finished.mode, finished.theme)}>
              Play again
            </button>
          </div>
        }
      />
    )
  }

  return (
    <PuzzlePanel
      head={head}
      board={<EmptyBoard settings={settings} />}
      coach={<PuzzleCoach tone="plain" label="Puzzle Sprint" line="Puzzles start easy and get harder. Three mistakes end the run." color="white" mood="neutral" moodKey="sprint" />}
      body={
        <div className="sprint-modes" role="radiogroup" aria-label="Sprint mode">
          {MODES.map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={`sprint-mode ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              <strong>{SPRINT_MODES[m].label}</strong>
              <span>{SPRINT_MODES[m].blurb}</span>
              <span className="sprint-best">{progress.sprintBest[m] ? `Best ${progress.sprintBest[m]}` : 'No score yet'}</span>
            </button>
          ))}
          {/* One kind of puzzle for the whole run, or every kind. */}
          <label className="pref-row sprint-type">
            <span>Puzzle type</span>
            <select
              className="pref-select"
              value={theme ?? ''}
              onChange={(e) => {
                const t = e.target.value || null
                setTheme(t)
                saveType(t)
              }}
            >
              <option value="">All types</option>
              {THEME_GROUPS.map((g) => (
                <optgroup key={g.name} label={g.name}>
                  {g.themes.map(([key]) => (
                    <option key={key} value={key}>
                      {themeName(key)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      }
      acts={
        <div className="puzzle-acts">
          <button className="btn accent-btn" onClick={() => start(mode, theme)}>
            Start sprint
          </button>
        </div>
      }
    />
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

/** The run's numbers: puzzles solved, the lives left, the clock, and a bar for the time (or the lives, in Survival). */
function RunScore({ score, strikes, left, limit, number, rating, best, theme }: { score: number; strikes: number; left: number | null; limit: number | null; number: number; rating?: number; best: number; theme: string | null }) {
  const low = left !== null && left < 20_000
  return (
    <PuzzleScore
      num={<span key={score}>{score}</span>}
      unit="solved"
      side={
        <>
          <span className="sprint-strikes" aria-label={`${SPRINT_STRIKES - strikes} of ${SPRINT_STRIKES} lives left`}>
            {Array.from({ length: SPRINT_STRIKES }, (_, i) => (
              <span key={i} className={i < strikes ? 'used' : ''}>
                ✗
              </span>
            ))}
          </span>
          {left !== null && (
            <span className={`puzzle-time sprint-time ${low ? 'low' : ''}`} title="Time left">
              <PuzzleIcon name="clock" />
              {formatClock(left)}
            </span>
          )}
        </>
      }
      track={{ at: left !== null && limit ? left / limit : (SPRINT_STRIKES - strikes) / SPRINT_STRIKES, low }}
      left={rating ? `Puzzle ${number} · rated ${rating}${theme ? ` · ${themeName(theme)}` : ''}` : 'Puzzle Sprint'}
      right={best ? `Best ${best}` : undefined}
    />
  )
}

/**
 * One run: fetches puzzles up the rating ladder (the next one ahead of time) and keeps the clock. It's saved as it
 * goes, and `resume` carries on from a saved one.
 */
function SprintRun(props: { mode: SprintMode; theme: string | null; resume?: SavedRun; best: number; settings: Settings; head: ReactNode; onEnd: (history: RunEntry[]) => void }) {
  const { mode, theme, resume, best, settings, head, onEnd } = props
  const limit = SPRINT_MODES[mode].ms
  const [history, setHistory] = useState<RunEntry[]>(resume?.history ?? [])
  const [line, setLine] = useState<string | null>(resume?.line ?? null)
  const puzzle = useMemo(() => (line ? parsePuzzleLine(line) : null), [line])
  const [endsAt, setEndsAt] = useState<number | null>(resume?.endsAt ?? null)
  const [now, setNow] = useState(Date.now)
  // Puzzles shown lately, this run and the ones before: none comes back for a while.
  const ids = useRef<string[]>([...recentSprint(), ...(resume?.history.map((e) => e.id) ?? []), ...(puzzle ? [puzzle.id] : [])])
  const upcoming = useRef<Promise<string> | null>(null)
  const historyRef = useRef(history)
  const ended = useRef(false)

  const finish = useCallback(
    (h: RunEntry[]) => {
      if (ended.current) return
      ended.current = true
      saveRun(null)
      saveRecentSprint(ids.current)
      onEnd(h)
    },
    [onEnd],
  )

  // Within NEAR of the step's rating, so the run climbs evenly.
  const fetchFor = (n: number) => (theme ? nextThemeLine(theme, sprintRating(n), ids.current, Math.random, NEAR, NEAR) : nextRatedLine(sprintRating(n), ids.current, Math.random, NEAR, NEAR))

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
        setLine(l)
        if (limit && n === 0) setEndsAt((e) => e ?? Date.now() + limit)
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
    const n = historyRef.current.length
    // Back to a saved run: its puzzle is on the board already, so only the one after it is fetched.
    if (puzzle) {
      upcoming.current = fetchFor(n + 1)
      upcoming.current.catch(() => {})
    } else show(n)
  })

  // Saved at every step, so leaving the page loses nothing.
  useEffect(() => {
    if (!ended.current) saveRun({ mode, history, line, endsAt, theme })
  }, [mode, history, line, endsAt, theme])

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
  const scoreBlock = <RunScore score={score} strikes={strikes} left={left} limit={limit} number={history.length + 1} rating={puzzle?.rating} best={best} theme={theme} />
  const quit = (
    <div className="puzzle-acts">
      <button className="btn ghost" onClick={() => finish(historyRef.current)}>
        End run
      </button>
    </div>
  )

  if (!puzzle) {
    return (
      <PuzzlePanel
        head={head}
        board={<EmptyBoard settings={settings} bare />}
        coach={<PuzzleCoach tone="plain" label="Puzzle Sprint" line="Getting the first puzzle…" color="white" mood="thinking" moodKey="sprint-load" />}
        score={scoreBlock}
        acts={quit}
      />
    )
  }
  return <SprintPuzzle puzzle={puzzle} settings={settings} head={head} score={scoreBlock} acts={quit} below={<RunChips history={history} />} onDone={done} />
}

interface SprintPuzzleProps {
  puzzle: Puzzle
  settings: Settings
  head: ReactNode
  score: ReactNode
  acts: ReactNode
  below: ReactNode
  onDone: (solved: boolean) => void
}

function SprintPuzzle({ puzzle, settings, head, score, acts, below, onDone }: SprintPuzzleProps) {
  const color = playerColor(puzzle)
  const s = usePuzzleSolve(puzzle, settings.soundVolume, QUICK)
  const [result, setResult] = useState<boolean | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [puzzleId, setPuzzleId] = useState(puzzle.id)
  if (puzzleId !== puzzle.id) {
    setPuzzleId(puzzle.id)
    setResult(null)
  }
  const flip = useCallback(() => setFlipped((f) => !f), [])
  useStepKeys(noStep, flip)
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
      logUse('puzzle_solved', 'sprint')
    }
  }

  const say: { tone: Tone; label: string; line: string; mood: RookMood } =
    result === false
      ? { tone: 'bad', label: 'Not that one', line: 'That costs a life.', mood: 'ouch' }
      : result
        ? { tone: 'good', label: 'Solved', line: 'Next one.', mood: 'pleased' }
        : s.lastResult === 'correct'
          ? { tone: 'good', label: 'Best move', line: 'Keep going.', mood: 'pleased' }
          : { tone: 'turn', label: `${sideName(color)} to move`, line: puzzleGoal(puzzle), mood: 'neutral' }

  return (
    <PuzzlePanel
      head={head}
      below={below}
      board={
        <Board
          key={puzzle.id}
          fen={s.node.fen}
          orientation={flipped ? (color === 'white' ? 'black' : 'white') : color}
          lastMove={lastMoveOf(s.node)}
          shapes={[]}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={onMove}
          // Premoves on: your next move can be queued while the reply comes, and plays as it lands.
          locked={result !== null || s.over || s.viewing || Boolean(s.wrong) || (!settings.premoves && !s.yourTurn)}
          premove={settings.premoves ? color : undefined}
          mark={s.mark}
        />
      }
      coach={<PuzzleCoach {...say} color={color} moodKey={`${puzzle.id}:${s.solve.played.length}:${say.label}`} />}
      score={score}
      acts={acts}
      strip={
        <div className="panel-strip puzzle-strip">
          <button className="icon-btn" onClick={flip} aria-label="Flip board" title="Flip board (F)">
            <FlipIcon />
          </button>
        </div>
      }
    />
  )
}
