import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { ClassIcon } from '../../components/ClassIcon'
import { Link } from '../../components/Link'
import { OpenGameDialog } from '../../components/LoadGameDialog'
import { FlipIcon, NavIcon } from '../../components/NavIcons'
import { PuzzleIcon } from '../../components/PuzzleIcons'
import { useEngine } from '../../hooks/useEngine'
import { useMoveSounds } from '../../hooks/useMoveSounds'
import { CLASS_INFO } from '../../lib/classify'
import type { RookMood } from '../../lib/coach'
import { formatDay } from '../../lib/home'
import { acceptable, loadMistakes, type MistakePuzzle } from '../../lib/mistakes'
import { localDayNumber } from '../../lib/puzzles'
import { dayStreak, recordMistakeSolved } from '../../lib/puzzleStore'
import { writeSession } from '../../lib/session'
import type { Settings } from '../../lib/settings'
import { decodeShare, fromSharedGame } from '../../lib/share'
import { playSound } from '../../lib/sound'
import { mainline, mainlineToPgn } from '../../lib/tree'
import { logUse } from '../../lib/usage'
import type { Score } from '../../lib/uci'
import { DayStreak, EmptyBoard, evalText, lastMoveOf, Placeholder, PuzzleCoach, PuzzlePanel, PuzzleScore, sideName, toMove, useStepKeys, walk, type Tone, type ViewProps } from './shared'

export function MistakesView({ progress, update, settings, updateSettings, tabs, onOpenAnalysis }: ViewProps) {
  const [queue, setQueue] = useState<MistakePuzzle[] | null>(null)
  // Counts moves through the queue, so a mistake that comes round again starts afresh.
  const [round, setRound] = useState(0)
  const solvedAtStart = useRef(progress.mistakesSolved)
  useEffect(() => {
    void loadMistakes(solvedAtStart.current).then(setQueue)
  }, [])
  const { engine, status } = useEngine('lite', { threads: 1, hashMb: 16 })
  const [loadOpen, setLoadOpen] = useState(false)

  if (!queue) return <Placeholder tabs={tabs} settings={settings} />
  const mistake = queue[0]
  if (!mistake) {
    const caughtUp = progress.mistakesSolved.length > 0
    return (
      <PuzzlePanel
        tabs={tabs}
        board={<EmptyBoard settings={settings} />}
        coach={
          <PuzzleCoach
            tone={caughtUp ? 'good' : 'plain'}
            label={caughtUp ? 'All caught up' : 'No mistakes yet'}
            line="Review a game and your mistakes turn into puzzles here."
            color="white"
            mood={caughtUp ? 'proud' : 'neutral'}
            moodKey="mistakes-empty"
          />
        }
        acts={
          <div className="puzzle-acts">
            <Link to="/play" className="btn ghost">
              Play a game
            </Link>
            <button className="btn accent-btn" onClick={() => setLoadOpen(true)}>
              Load a game
            </button>
            <OpenGameDialog open={loadOpen} onClose={() => setLoadOpen(false)} settings={settings} updateSettings={updateSettings} onOpenAnalysis={onOpenAnalysis} />
          </div>
        }
      />
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
      solved={progress.mistakesSolved.length - solvedAtStart.current.length}
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
  /** Solved since the page opened. */
  solved: number
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
function MistakeSolver({ turn, mistake, left, solved: solvedNow, engine, settings, tabs, streak, onSolved, onNext, onOpenGame }: MistakeSolverProps) {
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
    logUse('puzzle_solved', 'mistake')
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
  const say: { tone: Tone; label: string; line: string; mood: RookMood } =
    phase === 'checking'
      ? { tone: 'plain', label: engine ? 'Checking' : 'Starting the engine', line: 'Stockfish is looking at your move.', mood: 'thinking' }
      : phase === 'wrong'
        ? { tone: 'bad', label: 'Not good enough', line: `That's ${wrongScore}. Try again.`, mood: 'ouch' }
        : phase === 'solved'
          ? move === mistake.best
            ? { tone: 'good', label: 'Best move', line: `${mistake.bestSan} is the engine's move too.`, mood: 'proud' }
            : { tone: 'good', label: 'Good move', line: `${san} works. The engine's pick: ${mistake.bestSan}.`, mood: 'pleased' }
          : phase === 'shown'
            ? { tone: 'plain', label: `The move was ${mistake.bestSan}`, line: 'This one comes round again later.', mood: 'neutral' }
            : { tone: 'turn', label: `${sideName(mistake.color)} to move`, line: `Find a better move than ${mistake.playedSan}.`, mood: 'neutral' }
  const shapes: DrawShape[] = phase === 'shown' ? [{ orig: mistake.best.slice(0, 2) as Key, dest: mistake.best.slice(2, 4) as Key, brush: 'best' }] : []
  const mark = phase === 'wrong' ? 'wrong' : phase === 'solved' ? 'correct' : undefined

  return (
    <PuzzlePanel
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
      coach={<PuzzleCoach {...say} color={mistake.color} moodKey={`${turn}:${phase}`} />}
      score={
        <PuzzleScore
          num={left}
          unit="to go"
          side={streak}
          track={{ at: solvedNow / (solvedNow + left) }}
          left={`vs ${mistake.opponent}`}
          right={`Reviewed ${formatDay(mistake.at / 1000)}`}
        />
      }
      body={
        <>
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
        </>
      }
      acts={
        <div className="puzzle-acts">
          {done ? (
            <>
              <button className="ctrl" onClick={onOpenGame} aria-label="Open the game" title="Open the game">
                <PuzzleIcon name="analyse" />
              </button>
              <button className="btn accent-btn" onClick={() => onNext(phase === 'solved')}>
                {left > 1 ? 'Next' : phase === 'solved' ? 'Done' : 'Try again'}
                {left > 1 && <NavIcon name="next" />}
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={show} disabled={phase !== 'playing'} title="Shows the move. This one comes round again.">
                <PuzzleIcon name="hint" />
                Show the move
              </button>
              {left > 1 && (
                <button className="btn ghost puzzle-skip" onClick={() => onNext(false)} disabled={phase === 'checking'}>
                  Skip
                </button>
              )}
            </>
          )}
        </div>
      }
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
