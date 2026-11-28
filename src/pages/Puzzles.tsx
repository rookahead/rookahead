import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess, type Square } from 'chess.js'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Board } from '../components/Board'
import { CoachFace } from '../components/CoachFace'
import { COACH_EYE_Y, COACH_EYES, COACH_HEAD } from '../components/RookCoach'
import { FlipIcon, NavIcon } from '../components/NavIcons'
import { PageHeader } from '../components/PageHeader'
import { NavItemIcon } from '../components/Sidebar'
import { PuzzleIcon } from '../components/PuzzleIcons'
import { Link } from '../components/Link'
import { TAB_ICONS } from '../components/Tabs'
import { TypedLine } from '../components/TypedLine'
import { Gear } from '../components/UserCard'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { formatDay } from '../lib/home'
import type { RookMood } from '../lib/coach'
import type { Color } from '../lib/evaluation'
import { useImmersive } from '../lib/immersive'
import { KNIGHT } from '../lib/nav'
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
import { RatedScore, RecentResults } from './puzzles/Rated'
import { PuzzleStart } from './puzzles/Start'
import { ThemesView } from './puzzles/Themes'
import { MistakesView } from './puzzles/Mistakes'
import { clockFace, DayStreak, EmptyBoard, lastMoveOf, Placeholder, PuzzleCoach, PuzzleLayout, sideName, usePuzzleSolve, useStepKeys, type Tone, type Update, type ViewProps } from './puzzles/shared'
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
  // Phones: room in the page bar for a mode's own button (Rated's settings).
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  const props: ViewProps = { progress, update, settings, updateSettings, head, headerSlot, onOpenAnalysis }
  return (
    <div className="play-page puzzles-page">
      {/* Desktop has the page's name at the top of the panel, so the board gets the height. */}
      <PageHeader phoneOnly title="Puzzles" back={hub ? undefined : known ? '/puzzles/themes' : '/puzzles'} phoneTitle={known ? themeName(known) : MODE_NAMES[tab]}>
        <span ref={setHeaderSlot} className="page-header-slot" />
      </PageHeader>
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
function RatedView({ progress, update, settings, head, headerSlot, onOpenAnalysis, theme }: ViewProps & { theme?: string }) {
  // Resume the puzzle on the board if it hasn't counted yet; otherwise fetch the next one.
  const [line, setLine] = useState<string | null>(() => (progress.current && !progress.current.result ? progress.current.line : null))
  // A past puzzle opened from its pill: played again, not counted.
  const [replay, setReplay] = useState(false)
  // Each opening starts the puzzle afresh, even the one already on the board.
  const [opened, setOpened] = useState(0)
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
        setReplay(false)
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
  if (!puzzle) return <RatedLoading progress={progress} settings={settings} head={theme ? head : null} error={error} onRetry={next} />
  const current = progress.current?.line === line ? progress.current : undefined
  const delta = current?.delta
  // A rated puzzle not yet over: the pills wait (opening another would leave it uncounted).
  const waiting = Boolean(progress.current && !progress.current.result)
  const reopen = (l: string) => {
    setReplay(true)
    setLine(l)
    setOpened((n) => n + 1)
  }
  const setPrefs = (patch: Partial<PuzzleProgress['prefs']>) => update((p) => ({ ...p, prefs: { ...p.prefs, ...patch } }))

  return (
    <Solver
      key={opened}
      kind="rated"
      puzzle={puzzle}
      settings={settings}
      // Rated's panel opens with the puzzle itself; a theme keeps its name, with Back to the themes.
      head={theme ? head : null}
      counted={replay || Boolean(current?.result)}
      onResult={(won) => !replay && update(() => recordRated(progressRef.current, won))}
      onNext={goNext}
      autoNext={progress.prefs.autoNext}
      boardOverride={hop != null ? <BoardPath progress={progress} settings={settings} from={hop} onHopped={landed} /> : undefined}
      onAnalyse={(played) => analysePuzzle(puzzle, played, onOpenAnalysis)}
      points={!replay && delta != null && delta > 0 ? signed(delta) : undefined}
      missNote="This puzzle now counts as a miss."
      score={() => <RatedScore progress={progress} delta={delta} gain={current?.result ? current.xp : undefined} />}
      rated={{
        recent: <RecentResults recent={progress.recent} playing={waiting} open={replay ? line : null} onOpen={reopen} />,
        menu: (
          <>
            <label className="pref-row">
              <span>Difficulty</span>
              <select className="pref-select" value={progress.prefs.difficulty} onChange={(e) => setPrefs({ difficulty: e.target.value as Difficulty })}>
                {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY[d].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pref-row">
              <span>Rated</span>
              <span className="switch">
                <input type="checkbox" checked={progress.prefs.rated} onChange={(e) => setPrefs({ rated: e.target.checked })} />
                <span className="switch-track" />
              </span>
            </label>
            <label className="pref-row">
              <span>Jump to next puzzle</span>
              <span className="switch">
                <input type="checkbox" checked={progress.prefs.autoNext} onChange={(e) => setPrefs({ autoNext: e.target.checked })} />
                <span className="switch-track" />
              </span>
            </label>
          </>
        ),
        headerSlot,
      }}
    />
  )
}

/**
 * Rated while its puzzle loads (or can't): the page as it will be, so nothing moves when the puzzle comes. Your
 * rating, XP and last twenty are there from the first frame; the board is bare, Hint and the arrows wait, and the
 * coach says what's happening (with Retry in Hint's place if the puzzle can't load).
 */
function RatedLoading({ progress, settings, head, error, onRetry }: { progress: PuzzleProgress; settings: Settings; head: ReactNode; error: boolean; onRetry: () => void }) {
  const phone = useMediaQuery('(max-width: 1000px)')
  const say = error ? 'Couldn’t load puzzles. Check your connection.' : 'Loading a puzzle…'
  const go = (
    <div className="rp-go">
      {error ? (
        <button className="rp-morph" onClick={onRetry}>
          <span className="rp-morph-from">Retry</span>
        </button>
      ) : (
        <button className="rp-morph" disabled aria-label="Hint">
          <span className="rp-morph-from" aria-hidden>
            <PuzzleIcon name="hint" />
            Hint
          </span>
        </button>
      )}
    </div>
  )
  const arrows = (
    <span className="rp-steps">
      <button className="icon-btn rp-step" disabled aria-label="Previous move">
        <NavIcon name="prev" />
      </button>
      <button className="icon-btn rp-step" disabled aria-label="Next move">
        <NavIcon name="next" />
      </button>
    </span>
  )
  const score = <RatedScore progress={progress} />
  const recent = <RecentResults recent={progress.recent} playing={Boolean(progress.current && !progress.current.result)} />
  return (
    <PuzzleLayout
      className="puzzle-rated"
      head={null}
      bare
      above={
        <header className="home-top start-coach rp-coach" role="status">
          <div className="home-coach">
            <span className="home-coach-face">
              <CoachFace happy={false} moodKey="loading" />
            </span>
            <div className="home-welcome">
              <p className="rp-turn">Rated puzzle</p>
              <h1>{say}</h1>
            </div>
          </div>
        </header>
      }
      below={!phone && recent}
      board={<EmptyBoard settings={settings} bare />}
    >
      {phone ? (
        <>
          <div className="rp-under-board">
            {score}
            {recent}
          </div>
          <div className="rp-bar-foot">
            {go}
            {arrows}
          </div>
        </>
      ) : (
        <>
          <div className="rp-top">
            {head}
            <button className="icon-btn panel-gear rp-gear" disabled aria-label="Puzzle settings">
              <Gear />
            </button>
          </div>
          {go}
          {score}
          <div className="rp-nav">
            <span className="rp-nav-gap" />
            {arrows}
          </div>
        </>
      )}
    </PuzzleLayout>
  )
}

const num = (n: number) => n.toLocaleString('en-US')

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

/** Whether something that animates out is still on screen: true while `open`, and for `ms` after it closes. */
function usePresence(open: boolean, ms: number): boolean {
  const [shown, setShown] = useState(open)
  if (open && !shown) setShown(true)
  useEffect(() => {
    if (open || !shown) return
    const t = setTimeout(() => setShown(false), ms)
    return () => clearTimeout(t)
  }, [open, shown, ms])
  return open || shown
}

/** The settings button's menu, opening out of the button: it closes on a click outside it or Escape. */
function SettingsMenu({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Element
      if (!box.current?.contains(t) && !t.closest('[aria-label="Puzzle settings"]')) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open, onClose])
  return (
    // Closing, it stays a moment to shrink back into its button.
    <div ref={box} className={`rp-menu ${open ? '' : 'leaving'}`} role="dialog" aria-label="Puzzle settings" inert={!open}>
      {children}
    </div>
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
  /**
   * Rated's own page: the coach over the board with whose move it is and the clock; beside the board, no panel: Hint
   * (Next puzzle once it's over), `score`, and the move arrows at the board's foot; `recent` under the board. The
   * settings button (at the top right, or in the phone's page bar, `headerSlot`) opens `menu`.
   */
  rated?: { recent: ReactNode; menu: ReactNode; headerSlot?: HTMLElement | null }
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

/** Cassie, the computer you play on against: the coach's head, solid, its eyes cut out. */
function CassieFace() {
  const mask = `cassie-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg viewBox="12 6 96 96" aria-hidden>
      <mask id={mask} maskUnits="userSpaceOnUse" x={12} y={6} width={96} height={96}>
        <rect x={12} y={6} width={96} height={96} fill="#fff" />
        {COACH_EYES.map((x) => (
          <ellipse key={x} cx={x} cy={COACH_EYE_Y} rx={8} ry={11} fill="#000" />
        ))}
      </mask>
      <path d={COACH_HEAD} mask={`url(#${mask})`} />
    </svg>
  )
}

/**
 * Solving a Lichess puzzle at your own pace (Rated and Daily). The rook says what to look for and how each
 * move went; the numbers, the clock and one clear next step follow. On a phone the rook's line sits over the
 * board and the rest under it, in the same order.
 */
function Solver({ kind, puzzle, settings, head, score, counted, onResult, onSolved, onNext, autoNext, onAnalyse, points, missNote, prefs, boardOverride, rated }: SolverProps) {
  const phone = useMediaQuery('(max-width: 1000px)')
  const color = playerColor(puzzle)
  const s = usePuzzleSolve(puzzle, settings.soundVolume)
  const [flipped, setFlipped] = useState(false)
  const [hint, setHint] = useState<number | null>(null)
  const [options, setOptions] = useState(false)
  const closeOptions = useCallback(() => setOptions(false), [setOptions])
  const menuShown = usePresence(options, 140)
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

  const board = boardOverride ?? (
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

  if (rated) {
    const clean = s.solve.solved && !s.solve.failed
    const next = s.over && onNext
    const gear = (
      <button className={`icon-btn panel-gear rp-gear ${options ? 'active' : ''}`} onClick={() => setOptions((o) => !o)} aria-expanded={options} aria-label="Puzzle settings" title="Puzzle settings">
        <Gear />
      </button>
    )
    const menu = menuShown && (
      <SettingsMenu open={options} onClose={closeOptions}>
        {rated.menu}
      </SettingsMenu>
    )
    // Once it's over: Analyse (the Analysis board's knight) and Play it out (Cassie, the computer you play on against).
    const afterActs = (
      <>
        <button className="icon-btn rp-round rp-knight" onClick={() => onAnalyse(s.solve.played)} aria-label="Analyse" title="Analyse">
          <NavItemIcon item={KNIGHT} />
        </button>
        {canPlayOut(s.node.fen) && (
          <button className="icon-btn rp-round" onClick={() => playItOut(s.node.fen, orientation)} aria-label="Play it out" title="Play this position on against the computer">
            <CassieFace />
          </button>
        )}
      </>
    )
    // One pill: Hint on the left while you solve; once it's over it slides to the row's right end, widening into
    // Next puzzle, and Analyse and Play it out take the left. A miss brings Skip to that end meanwhile.
    const go = (
      <div className="rp-go">
        {s.over && (
          <span className="rp-go-acts">{afterActs}</span>
        )}
        <button
          className={`rp-morph ${next ? 'next' : ''} ${hintSquare ? 'wide' : ''}`}
          onClick={next ? onNext : onHint}
          disabled={!next && (s.over || !s.yourTurn)}
          aria-label={next ? 'Next puzzle' : hintSquare ? 'Show the move' : 'Hint'}
          title={next ? undefined : hintSquare ? 'Plays this one move for you.' : 'Shows the piece to move. The puzzle counts as a miss.'}
        >
          <span className="rp-morph-from" aria-hidden>
            <PuzzleIcon name="hint" />
            {hintSquare ? 'Show the move' : 'Hint'}
          </span>
          <span className="rp-morph-to" aria-hidden>
            Next puzzle
            <NavIcon name="next" />
          </span>
        </button>
        {!s.over && onNext && s.solve.failed && (
          <button className="btn ghost rp-skip" onClick={onNext}>
            Skip
          </button>
        )}
      </div>
    )
    const arrows = (
      <span className="rp-steps">
        <button className="icon-btn rp-step" onClick={() => s.step('prev')} disabled={s.ply === 0} aria-label="Previous move" title="Previous move (←)">
          <NavIcon name="prev" />
        </button>
        <button className="icon-btn rp-step" onClick={() => s.step('next')} disabled={s.ply >= s.lastPly} aria-label="Next move" title="Next move (→)">
          <NavIcon name="next" />
        </button>
      </span>
    )
    return (
      <PuzzleLayout
        className="puzzle-rated"
        head={null}
        bare
        // The coach over the board, as Home greets you: its face (glad at a clean solve), whose move it is (or how it
        // went) over what it has to say, and the clock at the row's end.
        above={
          <header className="home-top start-coach rp-coach" role="status">
            <div className="home-coach">
              <span className="home-coach-face">
                <CoachFace happy={clean} moodKey={`${puzzle.id}:${say.line}`} />
              </span>
              <div className="home-welcome">
                <p className={`rp-turn ${s.over ? (clean ? 'good' : 'bad') : ''}`}>{s.over ? (clean ? 'Solved' : 'Missed') : toMove}</p>
                <h1 aria-label={say.line}>
                  <TypedLine text={say.line} />
                </h1>
              </div>
              {clock}
            </div>
          </header>
        }
        below={!phone && rated.recent}
        board={board}
      >
        {phone ? (
          <>
            {rated.headerSlot &&
              createPortal(
                <>
                  {gear}
                  {menu}
                </>,
                rated.headerSlot,
              )}
            <div className="rp-under-board">
              {score(null)}
              {rated.recent}
            </div>
            <div className="rp-bar-foot">
              {go}
              {arrows}
            </div>
          </>
        ) : (
          <>
            {/* Level with the coach: a theme's name with Back, and the settings button at the right, as on Play. */}
            <div className="rp-top">
              {head}
              {gear}
              {menu}
            </div>
            {go}
            {score(null)}
            <div className="rp-nav">
              <span className="rp-nav-gap" />
              {arrows}
            </div>
          </>
        )}
      </PuzzleLayout>
    )
  }

  return (
    <PuzzleLayout head={head} above={phone && coach} board={board}>
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
