import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { ClassIcon } from '../../components/ClassIcon'
import { Link } from '../../components/Link'
import { NavIcon } from '../../components/NavIcons'
import { useEngine } from '../../hooks/useEngine'
import { useMoveSounds } from '../../hooks/useMoveSounds'
import { CLASS_INFO } from '../../lib/classify'
import { formatDay } from '../../lib/home'
import { acceptable, loadMistakes, type MistakePuzzle } from '../../lib/mistakes'
import { localDayNumber } from '../../lib/puzzles'
import { dayStreak, recordMistakeSolved } from '../../lib/puzzleStore'
import { requestLoadDialog, writeSession } from '../../lib/session'
import type { Settings } from '../../lib/settings'
import { decodeShare, fromSharedGame } from '../../lib/share'
import { playSound } from '../../lib/sound'
import { mainline, mainlineToPgn } from '../../lib/tree'
import type { Score } from '../../lib/uci'
import { DayStreak, EmptyBoard, evalText, Feedback, lastMoveOf, Placeholder, PuzzleLayout, sideName, toMove, useStepKeys, walk, type ViewProps } from './shared'

export function MistakesView({ progress, update, settings, tabs, onOpenAnalysis }: ViewProps) {
  const [queue, setQueue] = useState<MistakePuzzle[] | null>(null)
  // Counts moves through the queue, so a mistake that comes round again starts afresh.
  const [round, setRound] = useState(0)
  const solvedAtStart = useRef(progress.mistakesSolved)
  useEffect(() => {
    void loadMistakes(solvedAtStart.current).then(setQueue)
  }, [])
  const { engine, status } = useEngine('lite', { threads: 1, hashMb: 16 })

  if (!queue) return <Placeholder tabs={tabs} settings={settings} />
  const mistake = queue[0]
  if (!mistake) {
    return (
      <PuzzleLayout tabs={tabs} board={<EmptyBoard settings={settings} />}>
        <div className="panel-body puzzle-body">
          <div className="puzzle-message">
            <p>
              <strong>{progress.mistakesSolved.length ? 'All caught up.' : 'No mistakes to learn from yet.'}</strong>
              <span>Review a game and your Errors, Oversights and Blunders turn into puzzles here.</span>
            </p>
            <div className="puzzle-message-actions">
              <button
                className="btn primary small"
                onClick={() => {
                  requestLoadDialog()
                  onOpenAnalysis()
                }}
              >
                Load a game
              </button>
              <Link to="/play" className="btn ghost small">
                Play the computer
              </Link>
            </div>
          </div>
        </div>
      </PuzzleLayout>
    )
  }
  const day = localDayNumber(new Date())
  return (
    <MistakeSolver
      // A fresh solver per step through the queue: nothing from the last mistake (its move) carries over.
      key={`${mistake.id}/${round}`}
      turn={`${mistake.id}/${round}`}
      mistake={mistake}
      left={queue.length}
      engine={status?.state === 'ready' ? engine : null}
      settings={settings}
      tabs={tabs}
      streak={<DayStreak days={dayStreak(progress, day)} />}
      onSolved={() => update((p) => recordMistakeSolved(p, mistake.id, day))}
      onNext={(solved) => {
        setRound((r) => r + 1)
        setQueue((q) => (q ? (solved ? q.slice(1) : [...q.slice(1), q[0]]) : q))
      }}
      onOpenGame={async () => {
        const shared = await decodeShare(mistake.token)
        if ('error' in shared) return
        const { tree, headers, evals } = fromSharedGame(shared)
        // The position before the mistake: the id ends with the move's index in the main line.
        const index = Number(mistake.id.slice(mistake.id.lastIndexOf('#') + 1))
        writeSession({ pgn: mainlineToPgn(tree, headers), orientation: shared.orientation, currentPly: index, evals, classes: shared.review?.classes })
        onOpenAnalysis()
      }}
    />
  )
}

interface MistakeSolverProps {
  /** Changes with every step through the queue (a mistake can come round again): the board starts afresh. */
  turn: string
  mistake: MistakePuzzle
  /** Mistakes in the queue, this one included. */
  left: number
  engine: ReturnType<typeof useEngine>['engine']
  settings: Settings
  tabs: ReactNode
  streak: ReactNode
  onSolved: () => void
  /** On to the next one; an unsolved one goes to the back of the queue. */
  onNext: (solved: boolean) => void
  onOpenGame: () => void
}

const noStep = () => {}

/** One of your mistakes: find a move that would have been Good or better. */
function MistakeSolver({ turn, mistake, left, engine, settings, tabs, streak, onSolved, onNext, onOpenGame }: MistakeSolverProps) {
  const [phase, setPhase] = useState<'playing' | 'checking' | 'wrong' | 'solved' | 'shown'>('playing')
  // The move on the board after the start position (yours while it's checked, or the answer).
  const [move, setMove] = useState<string | null>(null)
  const [wrongScore, setWrongScore] = useState<string | null>(null)
  const [flipped, setFlipped] = useState(false)
  const check = useRef<AbortController | null>(null)
  // A check still running for the last mistake is dropped.
  useEffect(() => () => check.current?.abort(), [turn])

  // A wrong move stays on the board for a moment, then goes back.
  useEffect(() => {
    if (phase !== 'wrong') return
    const t = setTimeout(() => {
      setMove(null)
      setPhase('playing')
    }, 1100)
    return () => clearTimeout(t)
  }, [phase])

  const { fens, tree } = useMemo(() => walk(mistake.fen, move ? [move] : []), [mistake.fen, move])
  const node = mainline(tree).at(-1)!
  useMoveSounds(tree, node, settings.soundVolume, false)

  const solved = () => {
    setPhase('solved')
    playSound('success', settings.soundVolume)
    onSolved()
  }

  const onMove = async (m: { from: string; to: string; promotion?: string }) => {
    if (phase !== 'playing') return
    const uci = m.from + m.to + (m.promotion ?? '')
    setMove(uci)
    setWrongScore(null)
    if (uci === mistake.best) return solved()
    const after = new Chess(mistake.fen)
    after.move(toMove(uci))
    if (after.isCheckmate()) return solved()
    setPhase('checking')
    let score: Score | null = after.isDraw() ? { type: 'cp', value: 0 } : null
    if (!score) {
      const ctrl = new AbortController()
      check.current = ctrl
      const result = await engine?.analyze({ fen: after.fen(), multiPv: 1, depth: 14, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      score = result?.lines[0]?.score ?? null
    }
    if (!score) {
      setMove(null)
      setPhase('playing')
      return
    }
    if (acceptable(mistake.bestScore, score, mistake.color)) return solved()
    playSound('fail', settings.soundVolume)
    setWrongScore(evalText(score))
    setPhase('wrong')
  }

  const show = () => {
    setMove(mistake.best)
    setPhase('shown')
  }

  const flip = useCallback(() => setFlipped((f) => !f), [])
  useStepKeys(noStep, flip)
  const done = phase === 'solved' || phase === 'shown'
  const san = move ? new Chess(mistake.fen).move(toMove(move)).san : null
  const label = CLASS_INFO[mistake.cls].label
  const feedback =
    phase === 'checking'
      ? { kind: 'neutral' as const, title: engine ? 'Checking…' : 'Starting the engine…', detail: 'Stockfish is looking at your move.' }
      : phase === 'wrong'
        ? { kind: 'bad' as const, title: 'Not good enough', detail: `That's ${wrongScore}. Try again.` }
        : phase === 'solved'
          ? move === mistake.best
            ? { kind: 'good' as const, title: 'Best move!', detail: `${mistake.bestSan} is what the engine plays.` }
            : { kind: 'good' as const, title: 'Good move!', detail: `${san} works too. The engine's choice: ${mistake.bestSan}.` }
          : phase === 'shown'
            ? { kind: 'neutral' as const, title: `The move was ${mistake.bestSan}`, detail: 'It comes round again later.' }
            : { kind: 'turn' as const, title: 'Your turn', detail: `Find a better move for ${sideName(mistake.color)}.` }
  const shapes: DrawShape[] = phase === 'shown' ? [{ orig: mistake.best.slice(0, 2) as Key, dest: mistake.best.slice(2, 4) as Key, brush: 'best' }] : []
  const mark = phase === 'wrong' ? 'wrong' : phase === 'solved' ? 'correct' : undefined

  return (
    <PuzzleLayout
      tabs={tabs}
      board={
        <Board
          key={turn}
          fen={fens[fens.length - 1]}
          orientation={flipped ? (mistake.color === 'white' ? 'black' : 'white') : mistake.color}
          lastMove={lastMoveOf(node)}
          shapes={shapes}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={(m) => void onMove(m)}
          locked={phase !== 'playing'}
          mark={mark}
        />
      }
    >
      <div className="puzzle-head">
        <div className="puzzle-rating">
          <span className="muted">Learn from your mistakes</span>
          <strong>{left}</strong>
          <span className="muted">to go</span>
          {streak}
        </div>
        <span className="muted">
          vs {mistake.opponent} · reviewed {formatDay(mistake.at / 1000)}
        </span>
      </div>
      <Feedback {...feedback} color={mistake.color} />
      <div className="panel-body puzzle-body">
        <div className="mistake-played">
          <ClassIcon cls={mistake.cls} size={22} title={label} />
          <p>
            In the game you played <strong>{mistake.playedSan}</strong> here ({label}, {evalText(mistake.playedScore)}).
          </p>
        </div>
        {done && (
          <p className="mistake-best">
            The engine's move: <strong>{mistake.bestSan}</strong> ({evalText(mistake.bestScore)})
          </p>
        )}
      </div>
      <nav className="play-nav mistake-nav" aria-label="Board">
        <button className="ctrl flip" onClick={flip} aria-label="Flip board" title="Flip board (F)">
          <NavIcon name="flip" />
        </button>
      </nav>
      <div className="play-actions">
        {done ? (
          <>
            <button className="btn accent-btn puzzle-next" onClick={() => onNext(phase === 'solved')}>
              {left > 1 ? 'Next mistake' : phase === 'solved' ? 'Done' : 'Try again'}
            </button>
            <button className="btn ghost" onClick={onOpenGame}>
              Open game
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={show} disabled={phase !== 'playing'}>
              Show the move
            </button>
            <button className="btn ghost" onClick={() => onNext(false)} disabled={left <= 1}>
              Skip
            </button>
          </>
        )}
      </div>
    </PuzzleLayout>
  )
}
