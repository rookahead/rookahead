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
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useMoveSounds } from '../../hooks/useMoveSounds'
import { CLASS_INFO } from '../../lib/classify'
import type { RookMood } from '../../lib/coach'
import { formatDay } from '../../lib/home'
import { cachedPlan, lineGoal, lineSan, mateFor, planMistake, tacticEnd, type LinePlan, type LineSearch } from '../../lib/mistakeLine'
import { acceptable, loadMistakes, type MistakePuzzle } from '../../lib/mistakes'
import { localDayNumber } from '../../lib/puzzles'
import { dayStreak, recordMistakeSolved } from '../../lib/puzzleStore'
import { writeSession } from '../../lib/session'
import type { Settings } from '../../lib/settings'
import { decodeShare, fromSharedGame } from '../../lib/share'
import { playSound } from '../../lib/sound'
import { mainline, mainlineToPgn } from '../../lib/tree'
import { logUse } from '../../lib/usage'
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
      // A fresh solver per step through the queue: nothing from the last mistake (its moves) carries over.
      key={`${mistake.id}/${round}`}
      turn={`${mistake.id}/${round}`}
      mistake={mistake}
      upcoming={queue[1]}
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

type Engine = ReturnType<typeof useEngine>['engine']

/** The engine as a line search: its best line, White POV. */
const searchWith =
  (engine: NonNullable<Engine>): LineSearch =>
  async (fen, { depth, movetime, signal }) => {
    const r = await engine.analyze({ fen, multiPv: 1, depth, movetime, signal })
    const line = r?.lines[0]
    return line ? { score: line.score, pv: line.pv, depth: r.depth } : null
  }

interface MistakeSolverProps {
  /** Changes with every step through the queue (a mistake can come round again): the board starts afresh. */
  turn: string
  mistake: MistakePuzzle
  /** The one after it, worked out while you look at this one's answer. */
  upcoming?: MistakePuzzle
  /** Mistakes in the queue, this one included. */
  left: number
  /** Solved since the page opened. */
  solved: number
  engine: Engine
  settings: Settings
  tabs: ReactNode
  streak: ReactNode
  onSolved: () => void
  /** On to the next one; an unsolved one goes to the back of the queue. */
  onNext: (solved: boolean) => void
  onOpenGame: () => void
}

type Phase = 'planning' | 'playing' | 'checking' | 'wrong' | 'slower' | 'reply' | 'solved' | 'shown'

/** How a move you found went: the engine's own, or another that works. */
type Found = 'best' | 'good'

/**
 * One of your mistakes as a puzzle. A missed mate is played out to the mate and a missed tactic to the piece it wins,
 * the board answering each of your moves; anything else is one move that has to be Good or better.
 */
function MistakeSolver({ turn, mistake, upcoming, left, solved: solvedNow, engine, settings, tabs, streak, onSolved, onNext, onOpenGame }: MistakeSolverProps) {
  const [plan, setPlan] = useState<LinePlan | null>(() => cachedPlan(mistake.id) ?? null)
  const [phase, setPhase] = useState<Phase>(() => (plan ? 'playing' : 'planning'))
  // The moves on the board after the start position: yours and the replies.
  const [line, setLine] = useState<string[]>([])
  // A move that didn't do, on the board for a moment.
  const [tried, setTried] = useState<string | null>(null)
  const [wrongScore, setWrongScore] = useState<string | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  // A move was shown rather than found: the mistake comes round again.
  const [shown, setShown] = useState(false)
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [flipped, setFlipped] = useState(false)
  const phone = useMediaQuery('(max-width: 1000px)')
  const work = useRef<AbortController | null>(null)
  // Searches still running for this mistake are dropped when it goes.
  useEffect(() => () => work.current?.abort(), [turn])
  const search = useMemo(() => (engine ? searchWith(engine) : null), [engine])

  // Work the puzzle out when it opens (the board waits; a second or two).
  useEffect(() => {
    if (plan || !search) return
    const ctrl = new AbortController()
    work.current = ctrl
    void planMistake(mistake, search, ctrl.signal).then((p) => {
      if (!p || ctrl.signal.aborted) return
      setPlan(p)
      setPhase('playing')
    })
    return () => ctrl.abort()
  }, [plan, search, mistake])

  // A move that didn't do goes back after a moment.
  useEffect(() => {
    if (phase !== 'wrong' && phase !== 'slower') return
    const t = setTimeout(() => {
      setTried(null)
      setPhase('playing')
    }, 1100)
    return () => clearTimeout(t)
  }, [phase])

  const done = phase === 'solved' || phase === 'shown'
  // While you read the answer, the next mistake is worked out (a new search would stop it, so not before).
  useEffect(() => {
    if (!done || !upcoming || !search || cachedPlan(upcoming.id)) return
    const ctrl = new AbortController()
    void planMistake(upcoming, search, ctrl.signal)
    return () => ctrl.abort()
  }, [done, upcoming, search])

  const shownMoves = useMemo(() => (tried ? [...line, tried] : line), [line, tried])
  const { fens, tree } = useMemo(() => walk(mistake.fen, shownMoves), [mistake.fen, shownMoves])
  const lastPly = fens.length - 1
  const ply = viewPly ?? lastPly
  const node = mainline(tree)[ply]
  useMoveSounds(tree, node, settings.soundVolume, false)

  const finish = (wasShown: boolean, how: Found | null) => {
    setFound(how)
    if (wasShown) return setPhase('shown')
    setPhase('solved')
    playSound('success', settings.soundVolume)
    onSolved()
    logUse('puzzle_solved', 'mistake')
  }

  /**
   * After your move (`moves` ends on it): finished, or the reply comes and you go on. A line that has run out
   * before the mate is searched on from where it stands.
   */
  const carryOn = async (p: LinePlan, moves: string[], how: Found, wasShown: boolean) => {
    const after = new Chess(mistake.fen)
    for (const m of moves) after.move(toMove(m))
    const over = p.kind === 'single' || after.isCheckmate() || (p.kind === 'tactic' && moves.length >= p.moves.length)
    setLine(moves)
    if (over) return finish(wasShown, how)
    let next = p
    if (moves.length + 1 >= p.moves.length) {
      if (!search) return finish(wasShown, how)
      setPhase('checking')
      const ctrl = new AbortController()
      work.current = ctrl
      const r = await search(after.fen(), { depth: 16, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const mate = r && mateFor(r.score, mistake.color)
      // The engine sees no mate from here after all: what you found stands.
      if (!r || !mate) return finish(wasShown, how)
      next = { ...p, moves: [...moves, ...r.pv.slice(0, 2 * mate)] }
      setPlan(next)
    }
    setPhase('reply')
    setTimeout(() => {
      setLine([...moves, next.moves[moves.length]])
      setPhase('playing')
    }, 450)
  }

  const onMove = async (m: { from: string; to: string; promotion?: string }) => {
    if (phase !== 'playing' || !plan || viewPly !== null) return
    const uci = m.from + m.to + (m.promotion ?? '')
    const at = line.length
    const moves = [...line, uci]
    setWrongScore(null)
    if (uci === plan.moves[at]) {
      setFound('best')
      return void carryOn(plan, moves, 'best', shown)
    }
    const after = new Chess(mistake.fen)
    for (const x of moves) after.move(toMove(x))
    if (after.isCheckmate()) {
      setFound('good')
      return void carryOn(plan, moves, 'good', shown)
    }
    setTried(uci)
    setPhase('checking')
    let r: Awaited<ReturnType<LineSearch>> = after.isDraw() ? { score: { type: 'cp', value: 0 }, pv: [], depth: 0 } : null
    if (!r && search) {
      const ctrl = new AbortController()
      work.current = ctrl
      r = await search(after.fen(), { depth: plan.kind === 'single' ? 14 : 16, signal: ctrl.signal })
      if (ctrl.signal.aborted) return
    }
    if (!r) {
      setTried(null)
      setPhase('playing')
      return
    }
    const bad = () => {
      playSound('fail', settings.soundVolume)
      setWrongScore(evalText(r.score))
      setPhase('wrong')
    }
    if (plan.kind === 'mate') {
      const mate = mateFor(r.score, mistake.color)
      // Your moves left to the mate, this one included.
      const left = Math.ceil((plan.moves.length - at) / 2)
      if (!mate) return bad()
      if (mate > left - 1) {
        playSound('fail', settings.soundVolume)
        return setPhase('slower')
      }
      const next = { ...plan, moves: [...moves, ...r.pv.slice(0, 2 * mate)] }
      setPlan(next)
      setTried(null)
      setFound('good')
      return void carryOn(next, moves, 'good', shown)
    }
    if (!acceptable(plan.score, r.score, mistake.color)) return bad()
    setTried(null)
    setFound('good')
    if (plan.kind === 'single') return void carryOn(plan, moves, 'good', shown)
    // Another way in: the tactic from here, if it still wins; if not, a move that keeps the game in hand will do.
    const { end } = tacticEnd(mistake.fen, mistake.color, [...moves, ...r.pv])
    if (end < at + 2) return finish(shown, 'good')
    const next = { ...plan, moves: [...moves, ...r.pv].slice(0, end + 1) }
    setPlan(next)
    void carryOn(next, moves, 'good', shown)
  }

  /** The next move, played for you: the mistake comes round again. */
  const show = () => {
    if (phase !== 'playing' || !plan) return
    setViewPly(null)
    setShown(true)
    setFound(null)
    void carryOn(plan, [...line, plan.moves[line.length]], 'best', true)
  }

  const step = useCallback(
    (to: 'first' | 'prev' | 'next' | 'last') => {
      if (tried) return
      const target = to === 'first' ? 0 : to === 'last' ? lastPly : to === 'prev' ? ply - 1 : ply + 1
      setViewPly(target >= lastPly ? null : Math.max(0, target))
    },
    [tried, lastPly, ply],
  )
  const flip = useCallback(() => setFlipped((f) => !f), [])
  useStepKeys(step, flip)

  const label = CLASS_INFO[mistake.cls].label
  const side = `${sideName(mistake.color)} to move`
  const lastSan = line.length ? new Chess(fens[line.length - 1]).move(toMove(line[line.length - 1])).san : null
  const multi = plan && plan.kind !== 'single'
  // The engine's move here (the plan's first; the review's while the plan is being worked out).
  const best = plan?.moves[0] ?? mistake.best
  const bestSan = best === mistake.best ? mistake.bestSan : new Chess(mistake.fen).move(toMove(best)).san
  const yourMoves = Math.ceil(line.length / 2)
  const say: { tone: Tone; label: string; line: string; mood: RookMood } =
    phase === 'planning'
      ? { tone: 'plain', label: engine ? 'Looking at the position' : 'Starting the engine', line: `You played ${mistake.playedSan} here. What was better?`, mood: 'thinking' }
      : phase === 'checking'
        ? { tone: 'plain', label: 'Checking', line: 'Stockfish is looking at your move.', mood: 'thinking' }
        : phase === 'wrong'
          ? { tone: 'bad', label: 'Not good enough', line: `That's ${wrongScore}. Try again.`, mood: 'ouch' }
          : phase === 'slower'
            ? { tone: 'bad', label: 'Slower mate', line: 'That mates too, but slower. Find the quickest.', mood: 'ouch' }
            : phase === 'solved'
              ? plan?.kind === 'mate'
                ? { tone: 'good', label: 'Solved', line: "Checkmate. That's the mate you missed.", mood: 'proud' }
                : plan?.kind === 'tactic' && found === 'best'
                  ? { tone: 'good', label: 'Solved', line: `That wins ${plan.wins}.`, mood: 'proud' }
                  : found === 'best'
                    ? { tone: 'good', label: 'Best move', line: `${lastSan} is the engine's move too.`, mood: 'proud' }
                    : { tone: 'good', label: 'Good move', line: `${lastSan} works. The engine's pick: ${bestSan}.`, mood: 'pleased' }
              : phase === 'shown'
                ? multi
                  ? { tone: 'plain', label: 'That was the line', line: 'This one comes round again later.', mood: 'neutral' }
                  : { tone: 'plain', label: `The move was ${bestSan}`, line: 'This one comes round again later.', mood: 'neutral' }
                : yourMoves > 0 && found && !shown
                  ? { tone: 'good', label: found === 'best' ? 'Best move' : 'Good move', line: found === 'best' ? 'Keep going.' : 'That works too. Keep going.', mood: 'pleased' }
                  : { tone: 'turn', label: side, line: plan ? lineGoal(plan, mistake.playedSan) : '', mood: 'neutral' }
  const lastIsYours = line.length % 2 === 1 && viewPly === null
  const mark = tried && phase !== 'checking' ? 'wrong' : lastIsYours && found && !shown && phase !== 'shown' ? 'correct' : undefined
  const shapes: DrawShape[] = phase === 'shown' && !multi ? [{ orig: best.slice(0, 2) as Key, dest: best.slice(2, 4) as Key, brush: 'best' }] : []

  const steps = (
    <>
      <button className={phone ? 'ctrl' : 'icon-btn panel-strip-end'} onClick={() => step('prev')} disabled={ply === 0} aria-label="Previous move" title="Previous move (←)">
        <NavIcon name="prev" />
      </button>
      <button className={phone ? 'ctrl' : 'icon-btn'} onClick={() => step('next')} disabled={ply >= lastPly} aria-label="Next move" title="Next move (→)">
        <NavIcon name="next" />
      </button>
    </>
  )

  return (
    <PuzzlePanel
      tabs={tabs}
      board={
        <Board
          key={turn}
          fen={fens[ply]}
          orientation={flipped ? (mistake.color === 'white' ? 'black' : 'white') : mistake.color}
          lastMove={lastMoveOf(node)}
          shapes={shapes}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={(m) => void onMove(m)}
          locked={phase !== 'playing' || viewPly !== null}
          mark={ply === lastPly ? mark : undefined}
        />
      }
      coach={<PuzzleCoach {...say} color={mistake.color} moodKey={`${turn}:${phase}:${line.length}`} />}
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
          {done &&
            (multi ? (
              <p className="mistake-best">
                The line: <strong>{lineSan(mistake.fen, line)}</strong>
              </p>
            ) : (
              <p className="mistake-best">
                The engine's move: <strong>{bestSan}</strong> ({evalText(plan?.score ?? mistake.bestScore)})
              </p>
            ))}
        </>
      }
      acts={
        <div className="puzzle-acts">
          {done ? (
            <>
              <button className="ctrl" onClick={onOpenGame} aria-label="Open the game" title="Open the game">
                <PuzzleIcon name="analyse" />
              </button>
              {phone && multi && steps}
              <button className="btn accent-btn" onClick={() => onNext(phase === 'solved')}>
                {left > 1 ? 'Next' : phase === 'solved' ? 'Done' : 'Try again'}
                {left > 1 && <NavIcon name="next" />}
              </button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={show} disabled={phase !== 'playing' || viewPly !== null} title="Plays the next move for you. This one comes round again.">
                <PuzzleIcon name="hint" />
                Show the move
              </button>
              {left > 1 && (
                <button className="btn ghost puzzle-skip" onClick={() => onNext(false)} disabled={phase === 'checking'}>
                  Skip
                </button>
              )}
              {phone && multi && steps}
            </>
          )}
        </div>
      }
      strip={
        <div className="panel-strip puzzle-strip">
          <button className="icon-btn" onClick={flip} aria-label="Flip board" title="Flip board (F)">
            <FlipIcon />
          </button>
          {!phone && steps}
        </div>
      }
    />
  )
}
