// Pieces the puzzle modes share: the layout, the solving hook, the rook's line, move navigation, streaks.
import { DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { Flame } from '../../components/PuzzleIcons'
import { RookCoach } from '../../components/RookCoach'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useMoveSounds } from '../../hooks/useMoveSounds'
import type { RookMood } from '../../lib/coach'
import { formatScore, type Color } from '../../lib/evaluation'
import { revealSolution, startSolve, tryMove, type Puzzle } from '../../lib/puzzles'
import type { PuzzleProgress } from '../../lib/puzzleStore'
import type { Settings } from '../../lib/settings'
import { addLine, createTree, mainline, ROOT_ID, type GameTree } from '../../lib/tree'
import type { Score } from '../../lib/uci'

export type Update = (change: (p: PuzzleProgress) => PuzzleProgress) => void

export interface ViewProps {
  progress: PuzzleProgress
  update: Update
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  head: ReactNode
  onOpenAnalysis: () => void
}

export const sideName = (c: Color) => (c === 'white' ? 'White' : 'Black')
export const toMove = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })

/** "mate in 2 for White", or the eval ("+1.20"). Expects a White-POV score. */
export function evalText(score: Score): string {
  if (score.type !== 'mate' || score.value === 0) return formatScore(score)
  return `mate in ${Math.abs(score.value)} for ${score.value > 0 ? 'White' : 'Black'}`
}

/** The positions along a line of moves (start included) and its tree, for the board and the sounds. */
export function walk(fen: string, moves: string[]): { fens: string[]; tree: GameTree } {
  const { tree } = addLine(createTree(fen), ROOT_ID, moves)
  return { fens: mainline(tree).map((n) => n.fen), tree }
}

/** The puzzle piece as a line, for the page's heading. */
export const PUZZLES_ICON = 'M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z'

/**
 * Board on the left, panel on the right; `below` sits under the board, `above` over it. On desktop the panel
 * opens with `head`, the page's name (the page has no bar of its own there, so the board gets the height).
 */
export function PuzzleLayout(props: { board: ReactNode; head: ReactNode; above?: ReactNode; below?: ReactNode; hub?: boolean; className?: string; children: ReactNode }) {
  const { board, head, above, below, hub, className = '', children } = props
  return (
    // The start page (`hub`) has no panel: its cards sit straight on the page, like Play's front.
    <main className={`play-layout puzzle-layout ${hub ? 'puzzle-front' : ''} ${className}`}>
      <section className="play-board">
        {above && <div className="puzzle-above">{above}</div>}
        {board}
        <div className="puzzle-below">{below}</div>
      </section>
      <aside className="panel play-panel">
        <div className="panel-card">
          {head}
          {children}
        </div>
      </aside>
    </main>
  )
}

/**
 * The rook's panel for the modes without Rated's own (Sprint, Your mistakes): the rook's line, the numbers, what
 * the mode shows, then the buttons. Phones put the rook over the board and the buttons right under it.
 */
export function PuzzlePanel(props: { head: ReactNode; board: ReactNode; below?: ReactNode; coach: ReactNode; score?: ReactNode; body?: ReactNode; acts: ReactNode; strip?: ReactNode }) {
  const { head, board, below, coach, score, body, acts, strip } = props
  const phone = useMediaQuery('(max-width: 1000px)')
  return (
    // A run's chips (Sprint) sit under a phone's board, and in the panel on desktop, which is as tall as the board.
    <PuzzleLayout head={head} board={board} below={phone ? below : undefined} above={phone && coach}>
      {phone ? (
        <>
          {score}
          {acts}
          {strip}
          {body && <div className="puzzle-body">{body}</div>}
        </>
      ) : (
        <>
          {coach}
          {score}
          <div className="panel-body puzzle-body">
            {below}
            {body}
          </div>
          {acts}
          {strip}
        </>
      )}
    </PuzzleLayout>
  )
}

/** A number with its word ("12 solved"), the bar under it, and a line of small print each side. */
export function PuzzleScore({ num, unit, side, track, left, right }: { num: ReactNode; unit: string; side?: ReactNode; track?: { at: number; low?: boolean }; left: ReactNode; right?: ReactNode }) {
  return (
    <div className="puzzle-score">
      <div className="puzzle-score-top">
        <strong className="puzzle-num">{num}</strong>
        <span className="puzzle-unit">{unit}</span>
        {side}
      </div>
      {track && (
        <div className={`puzzle-track ${track.low ? 'low' : ''}`}>
          <span style={{ width: `${Math.max(0, Math.min(1, track.at)) * 100}%` }} />
        </div>
      )}
      <div className="puzzle-to">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  )
}

/** No pieces, for a board waiting on a puzzle: its position then appears on a bare board instead of replacing the starting one. */
const NO_PIECES = '8/8/8/8/8/8/8/8 w - - 0 1'

/** A locked board in the starting position, or `bare` (no pieces) while a puzzle loads. */
export function EmptyBoard({ settings, bare = false }: { settings: Settings; bare?: boolean }) {
  return <Board fen={bare ? NO_PIECES : DEFAULT_POSITION} orientation="white" shapes={[]} theme={settings.boardTheme} coordinates={settings.coordinates} onMove={() => {}} locked />
}

/** While a puzzle loads, or when it can't: an empty, locked board and a message. */
export function Placeholder({ head, settings, error, onRetry }: { head: ReactNode; settings: Settings; error?: boolean; onRetry?: () => void }) {
  return (
    <PuzzleLayout head={head} board={<EmptyBoard settings={settings} bare />}>
      <div className="panel-body puzzle-body">
        {error ? (
          <div className="puzzle-message">
            <p>Couldn't load puzzles. Check your connection.</p>
            <button className="btn primary small" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : (
          <p className="puzzle-message muted">Loading a puzzle…</p>
        )}
      </div>
    </PuzzleLayout>
  )
}

/** turn: whose move (a dot in that side's colour); good/bad: a tick or a cross; plain: no mark. */
export type Tone = 'turn' | 'good' | 'bad' | 'plain'

export const clockFace = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** The rook and what it says: whose move it is or how the last one went, then one line. */
export function PuzzleCoach({ tone, label, line, color, mood, moodKey }: { tone: Tone; label: string; line: string; color: Color; mood: RookMood; moodKey: string }) {
  return (
    <div className="puzzle-coach" role="status">
      <span className="puzzle-coach-rook">
        <RookCoach mood={mood} moodKey={moodKey} />
      </span>
      <span className="puzzle-say">
        <span className={`puzzle-who ${tone}`}>
          {tone === 'plain' ? null : tone === 'turn' ? (
            <i className={`puzzle-side ${color}`} aria-hidden />
          ) : (
            <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
              <path d={tone === 'good' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M6.5 6.5l11 11M17.5 6.5l-11 11'} />
            </svg>
          )}
          {label}
        </span>
        <strong className="puzzle-line">{line}</strong>
      </span>
    </div>
  )
}

/** A flame and the number of days in a row with a puzzle solved. */
export function DayStreak({ days }: { days: number }) {
  return (
    <span className={`day-streak ${days ? 'lit' : ''}`} title={days ? `${days}-day puzzle streak` : 'Solve a puzzle today to start a streak'}>
      <Flame size={16} lit={days > 0} />
      <strong key={days}>{days}</strong>
      <span>{days === 1 ? 'day' : 'days'}</span>
    </span>
  )
}

export type Step = 'first' | 'prev' | 'next' | 'last'

/** Arrow keys step through the moves on show; F flips the board. */
export function useStepKeys(step: (to: Step) => void, flip: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return
      const actions: Record<string, () => void> = {
        ArrowLeft: () => step('prev'),
        ArrowRight: () => step('next'),
        ArrowUp: () => step('first'),
        Home: () => step('first'),
        ArrowDown: () => step('last'),
        End: () => step('last'),
        f: flip,
      }
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, flip])
}

export interface SolveTiming {
  /** Before the opponent's set-up move. */
  first: number
  /** Before each reply. */
  reply: number
  /** How long a wrong move stays on the board. */
  wrong: number
}

export const CALM: SolveTiming = { first: 600, reply: 350, wrong: 700 }

/**
 * Solving a Lichess puzzle on the board: the set-up move plays itself after a pause, then your moves
 * and the replies. A wrong move shows for a moment, then goes back. Step back through what's been played.
 * A new puzzle starts afresh in place (the board stays mounted, so nothing flashes between puzzles).
 */
export function usePuzzleSolve(puzzle: Puzzle, volume: number, timing: SolveTiming = CALM) {
  const [solve, setSolve] = useState(() => startSolve(puzzle))
  // How many of the played moves are on the board: the opponent's appear after a pause.
  const [visible, setVisible] = useState(0)
  const [wrong, setWrong] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<'correct' | 'wrong' | null>(null)
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [puzzleId, setPuzzleId] = useState(puzzle.id)
  if (puzzleId !== puzzle.id) {
    setPuzzleId(puzzle.id)
    setSolve(startSolve(puzzle))
    setVisible(0)
    setWrong(null)
    setLastResult(null)
    setViewPly(null)
  }

  useEffect(() => {
    if (visible >= solve.played.length || wrong) return
    const t = setTimeout(() => setVisible((v) => v + 1), visible === 0 ? timing.first : solve.revealed ? 550 : timing.reply)
    return () => clearTimeout(t)
  }, [visible, solve, wrong, timing])

  useEffect(() => {
    if (!wrong) return
    const t = setTimeout(() => setWrong(null), timing.wrong)
    return () => clearTimeout(t)
  }, [wrong, timing])

  const shownMoves = useMemo(() => [...solve.played.slice(0, visible), ...(wrong ? [wrong] : [])], [solve.played, visible, wrong])
  const { fens, tree } = useMemo(() => walk(puzzle.fen, shownMoves), [puzzle.fen, shownMoves])
  const lastPly = fens.length - 1
  const ply = viewPly ?? lastPly
  const node = mainline(tree)[ply]
  const settled = visible === solve.played.length
  const over = solve.solved || solve.revealed
  const yourTurn = !over && !wrong && viewPly === null && settled
  useMoveSounds(tree, node, volume, false)

  const step = useCallback(
    (to: Step) => {
      if (wrong) return
      const target = to === 'first' ? 0 : to === 'last' ? lastPly : to === 'prev' ? ply - 1 : ply + 1
      setViewPly(target >= lastPly ? null : Math.max(0, target))
    },
    [wrong, lastPly, ply],
  )

  /** Your move: the result, or null when it isn't your turn. */
  const play = (uci: string) => {
    if (!yourTurn) return null
    const r = tryMove(puzzle, solve, uci)
    setLastResult(r.result === 'wrong' ? 'wrong' : 'correct')
    setSolve(r.state)
    if (r.result === 'wrong') setWrong(uci)
    else setVisible(solve.played.length + 1)
    return r.result
  }

  const reveal = () => {
    setViewPly(null)
    setSolve(revealSolution(puzzle, solve))
  }

  /** The solution's next move, played for you: the result, or null when it isn't your turn. The puzzle is a miss from here. */
  const show = () => {
    if (!yourTurn) return null
    const r = tryMove(puzzle, solve, puzzle.moves[solve.played.length])
    // Not your find: it gets no tick.
    setLastResult(null)
    setSolve({ ...r.state, failed: true })
    setVisible(solve.played.length + 1)
    return r.result
  }

  /** The same puzzle again, from its first move. */
  const restart = () => {
    setSolve(startSolve(puzzle))
    setVisible(0)
    setWrong(null)
    setLastResult(null)
    setViewPly(null)
  }

  // ✓ on your move while it's the last one on the board (and on the final move); ✗ on a wrong one.
  const yourMoveLast = viewPly === null && shownMoves.length % 2 === 0 && shownMoves.length > 0
  const mark: 'correct' | 'wrong' | undefined = wrong ? 'wrong' : yourMoveLast && lastResult === 'correct' && !solve.revealed ? 'correct' : undefined

  return { solve, node, ply, lastPly, viewing: viewPly !== null, settled, over, wrong, lastResult, yourTurn, mark, step, play, reveal, show, restart }
}

/** Chessground's last-move pair for a node. */
export const lastMoveOf = (node: { from?: string; to?: string }) => (node.from && node.to ? ([node.from, node.to] as [never, never]) : undefined)
