import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Board } from '../../components/Board'
import { FlipIcon } from '../../components/NavIcons'
import { PuzzleIcon } from '../../components/PuzzleIcons'
import type { RookMood } from '../../lib/coach'
import { nextRatedLine, nextThemeLine } from '../../lib/puzzleData'
import { parsePuzzleLine, playerColor, puzzleGoal, sprintRating, SPRINT_MODES, SPRINT_STRIKES, themeName, type Puzzle, type SprintMode } from '../../lib/puzzles'
import { sprintRunTypes, THEME_GROUPS, THEME_KEYS, THEME_ORDER, type SprintEach } from '../../lib/puzzleThemes'
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
  /** The run's types: none is every kind. */
  themes: string[]
  history: RunEntry[]
  newBest: boolean
  best: number
  /** What Play again plays: the same types, or the next one. */
  next: string[]
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
  /** The kinds of puzzle in it (themes, "fork"); none is every kind. */
  themes?: string[]
  /** Before a run could have several: one kind, or null for every kind. */
  theme?: string | null
}

function loadRun(): SavedRun | null {
  try {
    const run = JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null') as SavedRun | null
    if (!run || !(run.mode in SPRINT_MODES) || !Array.isArray(run.history)) return null
    return { ...run, themes: Array.isArray(run.themes) ? run.themes : run.theme ? [run.theme] : [] }
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

/** The kinds of puzzle picked, kept for the next visit (v1 held one). */
const TYPE_KEY = 'rookahead.sprintType.v1'
const TYPES_KEY = 'rookahead.sprintTypes.v2'

function loadTypes(): string[] {
  try {
    const raw = localStorage.getItem(TYPES_KEY)
    if (raw === null) {
      const one = localStorage.getItem(TYPE_KEY)
      return one && THEME_KEYS.has(one) ? [one] : []
    }
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === 'string' && THEME_KEYS.has(t)) : []
  } catch {
    return []
  }
}

function saveTypes(types: string[]) {
  try {
    localStorage.setItem(TYPES_KEY, JSON.stringify(types))
    localStorage.removeItem(TYPE_KEY)
  } catch {
    // Storage blocked: every kind next time.
  }
}

/** What each run does with the types: kept for the next visit. */
const EACH_KEY = 'rookahead.sprintEach.v1'
const EACH: Record<SprintEach, string> = { mix: 'Mix the types', next: 'Next type', random: 'Random type' }

function loadEach(): SprintEach {
  try {
    const e = localStorage.getItem(EACH_KEY)
    return e && e in EACH ? (e as SprintEach) : 'mix'
  } catch {
    return 'mix'
  }
}

function saveEach(each: SprintEach) {
  try {
    localStorage.setItem(EACH_KEY, each)
  } catch {
    // Storage blocked: mixed next time.
  }
}

/** "Fork", "Fork, Pin", "Fork, Pin +1": the picked types in a few words. */
function typesLabel(types: string[], join = ', ') {
  if (types.length <= 2) return types.map(themeName).join(join)
  return `${types.slice(0, 2).map(themeName).join(join)} +${types.length - 2}`
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
  // The kinds of puzzle picked (none is every kind: forks only, forks and pins), and what each run does with them.
  const [types, setTypes] = useState(loadTypes)
  const [each, setEach] = useState(loadEach)
  const [running, setRunning] = useState<{ mode: SprintMode; themes: string[]; key: number; resume?: SavedRun } | null>(
    saved && { mode: saved.mode, themes: saved.themes ?? [], key: 0, resume: saved },
  )
  // The one type the last run played, for the next one after it.
  const last = useRef<string | null>(saved?.themes?.length === 1 ? saved.themes[0] : null)
  const [finished, setFinished] = useState<Finished | null>(null)
  const progressRef = useRef(progress)
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  const start = (m: SprintMode, t: string[]) => {
    saveRun(null)
    setMode(m)
    setFinished(null)
    if (t.length === 1) last.current = t[0]
    setRunning({ mode: m, themes: t, key: Date.now() })
  }

  const end = useCallback(
    (m: SprintMode, t: string[], history: RunEntry[]) => {
      const score = history.filter((e) => e.solved).length
      // Bests are for runs of every kind.
      const { progress: next, newBest } = recordSprint(progressRef.current, m, score, undefined, !t.length)
      update(() => next)
      if (newBest) playSound('end', settings.soundVolume)
      setRunning(null)
      setFinished({ mode: m, themes: t, history, newBest, best: next.sprintBest[m] ?? 0, next: sprintRunTypes(types, each, last.current) })
    },
    [update, settings.soundVolume, types, each],
  )

  if (running)
    return (
      <SprintRun
        key={running.key}
        mode={running.mode}
        themes={running.themes}
        resume={running.resume}
        best={running.themes.length ? 0 : (progress.sprintBest[running.mode] ?? 0)}
        settings={settings}
        head={head}
        onEnd={(h) => end(running.mode, running.themes, h)}
      />
    )

  if (finished) {
    const score = finished.history.filter((e) => e.solved).length
    const top = Math.max(0, ...finished.history.filter((e) => e.solved).map((e) => e.rating))
    const say: { tone: Tone; label: string; line: string; mood: RookMood } = finished.newBest
      ? { tone: 'good', label: 'New best', line: `${score} solved, your best yet.`, mood: 'proud' }
      : score
        ? { tone: 'plain', label: 'Run over', line: finished.themes.length ? `${score} solved.` : `${score} solved. Your best is ${finished.best}.`, mood: 'pleased' }
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
            track={{ at: finished.best && !finished.themes.length ? score / finished.best : 0 }}
            left={`Puzzle Sprint · ${SPRINT_MODES[finished.mode].label}${finished.themes.length ? ` · ${typesLabel(finished.themes, ' + ')}` : ''}`}
            right={top > 0 ? `Hardest solved ${top}` : undefined}
          />
        }
        acts={
          <div className="puzzle-acts">
            <button className="btn ghost" onClick={() => setFinished(null)}>
              Change mode
            </button>
            <button className="btn accent-btn" onClick={() => start(finished.mode, finished.next)}>
              {finished.next.length === 1 && finished.next[0] !== finished.themes[0] ? `Next: ${themeName(finished.next[0])}` : 'Play again'}
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
          {/* The kinds of puzzle (every kind when none is ticked), and whether a run mixes them or takes one at a time. */}
          <TypesPicker
            types={types}
            onChange={(t) => {
              setTypes(t)
              saveTypes(t)
            }}
          />
          <label className="pref-row sprint-type">
            <span>Each run</span>
            <select
              className="pref-select"
              value={each}
              onChange={(e) => {
                const v = e.target.value as SprintEach
                setEach(v)
                saveEach(v)
              }}
            >
              {(Object.keys(EACH) as SprintEach[]).map((k) => (
                <option key={k} value={k}>
                  {EACH[k]}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
      acts={
        <div className="puzzle-acts">
          <button className="btn accent-btn" onClick={() => start(mode, sprintRunTypes(types, each, last.current))}>
            Start sprint
          </button>
        </div>
      }
    />
  )
}

/** Puzzle types: a button with the picked ones, opening a menu to tick any number of them. */
function TypesPicker({ types, onChange }: { types: string[]; onChange: (types: string[]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = useCallback(() => setAnchor(null), [])
  return (
    <div className="pref-row sprint-type">
      <span>Puzzle types</span>
      <button className="pref-select sprint-pick" aria-haspopup="true" aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        <span>{types.length ? typesLabel(types) : 'All types'}</span>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {anchor && <TypesMenu anchor={anchor} types={types} onChange={onChange} onClose={close} />}
    </div>
  )
}

/**
 * The types in their groups, each with a tick, and All types on top (none ticked). Drawn over the page beside its
 * button, so the panel (which scrolls, and so clips) can't cut it off: above it when there's room, else under it.
 */
function TypesMenu({ anchor, types, onChange, onClose }: { anchor: HTMLElement; types: string[]; onChange: (types: string[]) => void; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const r = anchor.getBoundingClientRect()
  const roomAbove = r.top - 16
  const roomBelow = window.innerHeight - r.bottom - 16
  const up = roomAbove >= Math.min(380, roomBelow)
  // On whole pixels, so the text isn't blurred.
  const style: CSSProperties = {
    right: Math.round(window.innerWidth - r.right),
    ...(up ? { bottom: Math.round(window.innerHeight - r.top + 6) } : { top: Math.round(r.bottom + 6) }),
    maxHeight: Math.round(Math.min(380, up ? roomAbove : roomBelow)),
  }

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!root.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // The page scrolling would leave it behind: it closes (its own list scrolls as it likes).
    const onScroll = (e: Event) => !root.current?.contains(e.target as Node) && onClose()
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchor, onClose])

  // Kept in the list's order, whatever order they were ticked in.
  const toggle = (key: string) => onChange(THEME_ORDER.filter((t) => (t === key ? !types.includes(t) : types.includes(t))))
  const row = (key: string, label: string, on: boolean, click: () => void) => (
    <button key={key} className={`sprint-menu-row ${on ? 'on' : ''}`} role="menuitemcheckbox" aria-checked={on} onClick={click}>
      <span className="sprint-tick" aria-hidden />
      {label}
    </button>
  )

  return createPortal(
    <div ref={root} className="sprint-menu" style={style} role="menu" aria-label="Puzzle types">
      {row('all', 'All types', !types.length, () => onChange([]))}
      {THEME_GROUPS.map((g) => (
        <div key={g.name} role="group" aria-label={g.name}>
          <div className="sprint-menu-group">{g.name}</div>
          {g.themes.map(([key]) => row(key, themeName(key), types.includes(key), () => toggle(key)))}
        </div>
      ))}
    </div>,
    document.body,
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
function RunScore({ score, strikes, left, limit, number, rating, best, themes }: { score: number; strikes: number; left: number | null; limit: number | null; number: number; rating?: number; best: number; themes: string[] }) {
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
      left={rating ? `Puzzle ${number} · rated ${rating}${themes.length ? ` · ${typesLabel(themes, ' + ')}` : ''}` : 'Puzzle Sprint'}
      right={best ? `Best ${best}` : undefined}
    />
  )
}

/**
 * One run: fetches puzzles up the rating ladder (the next one ahead of time) and keeps the clock. It's saved as it
 * goes, and `resume` carries on from a saved one.
 */
function SprintRun(props: { mode: SprintMode; themes: string[]; resume?: SavedRun; best: number; settings: Settings; head: ReactNode; onEnd: (history: RunEntry[]) => void }) {
  const { mode, themes, resume, best, settings, head, onEnd } = props
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
  // With several types, each puzzle is one of them at random.
  const fetchFor = (n: number) => {
    const theme = themes.length ? themes[Math.floor(Math.random() * themes.length)] : null
    return theme ? nextThemeLine(theme, sprintRating(n), ids.current, Math.random, NEAR, NEAR) : nextRatedLine(sprintRating(n), ids.current, Math.random, NEAR, NEAR)
  }

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
    if (!ended.current) saveRun({ mode, history, line, endsAt, themes })
  }, [mode, history, line, endsAt, themes])

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
  const scoreBlock = <RunScore score={score} strikes={strikes} left={left} limit={limit} number={history.length + 1} rating={puzzle?.rating} best={best} themes={themes} />
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
