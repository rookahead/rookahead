// Pieces the puzzle modes share: the layout, the solving hook, the feedback block, move navigation, streaks.
import { DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { NavIcon } from '../../components/NavIcons'
import { PieceIcon } from '../../components/PieceIcon'
import { Flame } from '../../components/PuzzleIcons'
import { useMoveSounds } from '../../hooks/useMoveSounds'
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
  tabs: ReactNode
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

/** Board on the left, panel on the right (tabs on top); `below` sits under the board. */
export function PuzzleLayout({ board, tabs, below, children }: { board: ReactNode; tabs: ReactNode; below?: ReactNode; children: ReactNode }) {
  return (
    <main className="play-layout puzzle-layout">
      <section className="play-board">
        {board}
        <div className="puzzle-below">{below}</div>
      </section>
      <aside className="panel play-panel">
        <div className="panel-card">
          {tabs}
          {children}
        </div>
      </aside>
    </main>
  )
}

/** No pieces, for a board waiting on a puzzle: its position then appears on a bare board instead of replacing the starting one. */
const NO_PIECES = '8/8/8/8/8/8/8/8 w - - 0 1'

/** A locked board in the starting position, or `bare` (no pieces) while a puzzle loads. */
export function EmptyBoard({ settings, bare = false }: { settings: Settings; bare?: boolean }) {
  return <Board fen={bare ? NO_PIECES : DEFAULT_POSITION} orientation="white" shapes={[]} theme={settings.boardTheme} coordinates={settings.coordinates} onMove={() => {}} locked />
}

/** While a puzzle loads, or when it can't: an empty, locked board and a message. */
export function Placeholder({ tabs, settings, error, onRetry }: { tabs: ReactNode; settings: Settings; error?: boolean; onRetry?: () => void }) {
  return (
    <PuzzleLayout tabs={tabs} board={<EmptyBoard settings={settings} bare />}>
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

export type FeedbackKind = 'turn' | 'good' | 'bad' | 'neutral'

/** The big status block: whose turn it is, or how the last move went. */
export function Feedback({ kind, color, title, detail }: { kind: FeedbackKind; color: Color; title: string; detail?: ReactNode }) {
  return (
    <div className={`feedback ${kind}`} role="status">
      {/* Keyed by its message, so the icon pops on every change. */}
      <span key={kind + title} className="feedback-icon" aria-hidden>
        {kind === 'turn' ? (
          <PieceIcon role="king" color={color} />
        ) : (
          <svg viewBox="0 0 24 24">
            <path d={kind === 'good' ? 'M6.5 12.5l3.8 3.8 7.4-8.3' : kind === 'bad' ? 'M7.5 7.5l9 9M16.5 7.5l-9 9' : 'M7 12h10'} />
          </svg>
        )}
      </span>
      <span className="feedback-text">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
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

export function StepNav({ at, last, onStep, onFlip }: { at: number; last: number; onStep: (to: Step) => void; onFlip: () => void }) {
  return (
    <nav className="play-nav" aria-label="Move navigation">
      <button className="ctrl" onClick={() => onStep('first')} disabled={at === 0} aria-label="First move" title="First move (↑)">
        <NavIcon name="first" />
      </button>
      <button className="ctrl" onClick={() => onStep('prev')} disabled={at === 0} aria-label="Previous move" title="Previous move (←)">
        <NavIcon name="prev" />
      </button>
      <button className="ctrl" onClick={() => onStep('next')} disabled={at >= last} aria-label="Next move" title="Next move (→)">
        <NavIcon name="next" />
      </button>
      <button className="ctrl" onClick={() => onStep('last')} disabled={at >= last} aria-label="Last move" title="Last move (↓)">
        <NavIcon name="last" />
      </button>
      <button className="ctrl flip" onClick={onFlip} aria-label="Flip board" title="Flip board (F)">
        <NavIcon name="flip" />
      </button>
    </nav>
  )
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

  // ✓ on your move while it's the last one on the board (and on the final move); ✗ on a wrong one.
  const yourMoveLast = viewPly === null && shownMoves.length % 2 === 0 && shownMoves.length > 0
  const mark: 'correct' | 'wrong' | undefined = wrong ? 'wrong' : yourMoveLast && lastResult === 'correct' && !solve.revealed ? 'correct' : undefined

  return { solve, node, ply, lastPly, viewing: viewPly !== null, settled, over, wrong, lastResult, yourTurn, mark, step, play, reveal }
}

/** Chessground's last-move pair for a node. */
export const lastMoveOf = (node: { from?: string; to?: string }) => (node.from && node.to ? ([node.from, node.to] as [never, never]) : undefined)
