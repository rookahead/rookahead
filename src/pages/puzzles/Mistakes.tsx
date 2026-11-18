import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { ClassIcon } from '../../components/ClassIcon'
import { ExplainPanel } from '../../components/ExplainPanel'
import { RookCoach } from '../../components/RookCoach'
import { Link } from '../../components/Link'
import { OpenGameDialog } from '../../components/LoadGameDialog'
import { FlipIcon, NavIcon } from '../../components/NavIcons'
import { PuzzleIcon } from '../../components/PuzzleIcons'
import { useEngine } from '../../hooks/useEngine'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useMoveSounds } from '../../hooks/useMoveSounds'
import { CLASS_INFO } from '../../lib/classify'
import { explainMove, playSteps, type CoachFacts, type Explanation } from '../../lib/explain'
import type { RookMood } from '../../lib/coach'
import type { Color } from '../../lib/evaluation'
import { formatDay } from '../../lib/home'
import { cachedPlan, forcing, LINE_MOVES, lineGoal, lineSan, mateFor, MAX_LINE, onlyMove, planMistake, tacticEnd, type LinePlan, type LineSearch } from '../../lib/mistakeLine'
import { acceptable, loadMistakes, type MistakePuzzle } from '../../lib/mistakes'
import { canPlayOut, playItOut } from '../../lib/practice'
import { localDayNumber } from '../../lib/puzzles'
import { recordMistakeSolved } from '../../lib/puzzleStore'
import { writeSession } from '../../lib/session'
import type { Settings } from '../../lib/settings'
import { decodeShare, fromSharedGame } from '../../lib/share'
import { playSound } from '../../lib/sound'
import { mainline, mainlineToPgn } from '../../lib/tree'
import { logUse } from '../../lib/usage'
import { EmptyBoard, evalText, lastMoveOf, Placeholder, PuzzleCoach, PuzzlePanel, sideName, toMove, useStepKeys, walk, type Tone, type ViewProps } from './shared'

export function MistakesView({ progress, update, settings, updateSettings, head, onOpenAnalysis }: ViewProps) {
  const [queue, setQueue] = useState<MistakePuzzle[] | null>(null)
  // Counts moves through the queue, so a mistake that comes round again starts afresh.
  const [round, setRound] = useState(0)
  const solvedAtStart = useRef(progress.mistakesSolved)
  useEffect(() => {
    void loadMistakes(solvedAtStart.current).then(setQueue)
  }, [])
  const { engine, status } = useEngine('lite', { threads: 1, hashMb: 16 })
  const [loadOpen, setLoadOpen] = useState(false)

  if (!queue) return <Placeholder head={head} settings={settings} />
  const mistake = queue[0]
  if (!mistake) {
    const caughtUp = progress.mistakesSolved.length > 0
    return (
      <PuzzlePanel
        head={head}
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
      head={head}
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
  async (fen, { depth, movetime, fresh, multiPv = 1, signal }) => {
    const r = await engine.analyze({ fen, multiPv, depth, movetime, fresh, signal })
    const line = r?.lines[0]
    return line ? { score: line.score, pv: line.pv, depth: r.depth, second: r.lines[1]?.score } : null
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
  head: ReactNode
  onSolved: () => void
  /** On to the next one; an unsolved one goes to the back of the queue. */
  onNext: (solved: boolean) => void
  onOpenGame: () => void
}

/** How long a puzzle runs, in plies: a tactic to the move that wins; a line as long as your moves are the only good ones. */
const lineLength = (p: LinePlan) => (p.kind === 'line' ? Infinity : p.moves.length)

const COUNT_WORDS: Record<number, string> = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight' }

type Phase = 'planning' | 'story' | 'why' | 'playing' | 'checking' | 'wrong' | 'slower' | 'reply' | 'solved' | 'shown'

/** The explainer's rows that are safe before the puzzle: what was threatened, what your move did, how it loses. */
const SPOILER_FREE = ['threat', 'move', 'loses']

/** How much of what your move allowed the story plays out (after your move). */
const STORY_PLIES = 4

/**
 * Why the move went wrong, without giving the answer away: what it did and what it let the other side do; for a
 * chance missed, only that there was one.
 */
/** Nothing Explain can put in words: how the move left the game, at least. */
const plainStory = (m: MistakePuzzle) => `That gives ${m.color === 'white' ? 'Black' : 'White'} the better game (${evalText(m.playedScore)}).`

function storyText(f: CoachFacts | undefined, m: MistakePuzzle): string {
  const plain = plainStory(m)
  if (!f) return plain
  const lets = f.allows ? `Now ${f.allows}` : f.mates ? 'That allows mate.' : f.gives ? `That hands them ${f.gives}.` : null
  const parts = [f.own, lets].filter((x): x is string => Boolean(x))
  if (parts.length) return parts.join(' ')
  if (f.mate) return 'You had mate here, and missed it.'
  if (f.shot) return 'You had a winning shot here.'
  return f.chance ? 'You missed something here.' : plain
}

/**
 * Why the better move is better, said once it's found: what was missed, or the move and its point; without a point,
 * Explain's own "Better" row (the move, and where it leaves the game).
 */
function betterText(e: Explanation | null): string | null {
  const f = e?.coach
  if (f?.chance) return f.chance
  if (f?.better?.point) return `${f.better.move} ${f.better.point}${/[.!]$/.test(f.better.point) ? '' : '.'}`
  return e?.rows.find((r) => r.key === 'better')?.text ?? null
}

/** How a move you found went: the engine's own, or another that works. */
type Found = 'best' | 'good'

/**
 * One of your mistakes as a puzzle. A missed mate is played out to the mate and a missed tactic to the piece it wins,
 * the board answering each of your moves; anything else is one move that has to be Good or better.
 */
function MistakeSolver({ turn, mistake, upcoming, left, solved: solvedNow, engine, settings, head, onSolved, onNext, onOpenGame }: MistakeSolverProps) {
  const [plan, setPlan] = useState<LinePlan | null>(() => cachedPlan(mistake.id) ?? null)
  const [phase, setPhase] = useState<Phase>(() => (plan ? 'story' : 'planning'))
  // The story first: how many of its moves (yours, then what it allowed) are on the board.
  const [storyAt, setStoryAt] = useState(0)
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
      setPhase('story')
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

  // Why it was a mistake, from Explain: what the move did and allowed, what was missed, what was better.
  const explanation = useMemo(() => {
    if (!plan?.why) return null
    try {
      return explainMove({
        fenBefore: mistake.fen,
        uci: mistake.played,
        san: mistake.playedSan,
        cls: mistake.cls,
        best: { pv: plan.why.best, score: plan.score },
        reply: plan.why.reply,
        threat: plan.why.threat,
      })
    } catch {
      return null
    }
  }, [plan?.why, plan?.score, mistake])
  const facts = explanation?.coach
  // The story: your move, then the line that punishes it (or, when it was a chance missed, the game's reply).
  const storyMoves = useMemo(() => {
    const punish = explanation?.lines.find((l) => l.from === 'after')?.uci ?? plan?.why?.reply.pv.slice(0, 1) ?? []
    return [mistake.played, ...punish.slice(0, STORY_PLIES)]
  }, [explanation, plan?.why, mistake.played])
  useEffect(() => {
    // Your move is shown first as an arrow, then played, its verdict spelled out, and it stops there: what it
    // allowed plays only when you ask why.
    const stop = phase === 'story' ? 1 : phase === 'why' ? storyMoves.length : 0
    if (storyAt >= stop) return
    const t = setTimeout(() => setStoryAt((n) => n + 1), storyAt === 0 ? 1400 : storyAt === 1 ? 700 : 900)
    return () => clearTimeout(t)
  }, [phase, storyAt, storyMoves.length])

  // The explainer: before you solve it, only what doesn't give the answer away (a chance missed is told after);
  // once it's over, all of it.
  const explainer = useMemo(() => {
    if (!explanation) return null
    // Once it's over, the card's message says what was better: under it, the lines to play through.
    if (done) return betterText(explanation) ? { ...explanation, rows: [] } : explanation
    if (phase !== 'why') return null
    // Nothing that names the answer: the better move's own rows, or any row that says the move.
    const answer = plan?.moves[0] ? new Chess(mistake.fen).move(toMove(plan.moves[0])).san.replace(/[+#]$/, '') : null
    // The card's message already says what the move did and what it let them do: the rows add only the rest.
    const said = storyText(explanation.coach, mistake) !== plainStory(mistake) ? ['move', 'loses'] : []
    const rows = explanation.rows.filter((r) => SPOILER_FREE.includes(r.key) && !said.includes(r.key) && !(answer && r.text.includes(answer)))
    const lines = explanation.lines.filter((l) => l.from === 'after')
    return rows.length || lines.length ? { ...explanation, rows, lines } : null
  }, [explanation, done, phase, plan?.moves, mistake.fen])
  // A row pointed at draws on the board; a row clicked (or a line's Show) plays on it.
  const [pick, setPick] = useState<number | null>(null)
  const [explainPlay, setExplainPlay] = useState<{ steps: ReturnType<typeof playSteps>; at: number } | null>(null)
  useEffect(() => {
    setPick(null)
    setExplainPlay(null)
  }, [explainer])
  useEffect(() => {
    if (!explainPlay || explainPlay.at >= explainPlay.steps.length - 1) return
    const t = setTimeout(() => setExplainPlay((x) => x && { ...x, at: x.at + 1 }), explainPlay.at === 0 ? 350 : 800)
    return () => clearTimeout(t)
  }, [explainPlay])
  const explainView = explainPlay ? explainPlay.steps[explainPlay.at] : pick !== null ? explainer?.rows[pick]?.position : undefined

  const shownMoves = useMemo(() => (phase === 'story' || phase === 'why' ? storyMoves.slice(0, storyAt) : tried ? [...line, tried] : line), [phase, storyMoves, storyAt, line, tried])
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

  /** A search for this mistake (undefined if it was dropped as the mistake moved on; null without an engine). */
  const searchHere = async (fen: string, multiPv = 1) => {
    if (!search) return null
    const ctrl = new AbortController()
    work.current = ctrl
    // Capped in time as well: a queen ending full of checks can take seconds to reach the depth.
    const r = await search(fen, { depth: 16, movetime: 1500, multiPv, signal: ctrl.signal })
    return ctrl.signal.aborted ? undefined : r
  }

  /**
   * After your move (`moves` ends on it): finished, or the engine's best reply comes and you go on. A line that has
   * run out (the engine's line can be short) is searched on from where it stands.
   */
  const carryOn = async (p: LinePlan, moves: string[], how: Found, wasShown: boolean) => {
    const after = new Chess(mistake.fen)
    for (const m of moves) after.move(toMove(m))
    const yours = Math.ceil(moves.length / 2)
    const over = p.kind === 'single' || after.isGameOver() || (p.kind === 'tactic' && moves.length >= lineLength(p)) || (p.kind === 'line' && yours >= MAX_LINE)
    setLine(moves)
    if (over) return finish(wasShown, how)
    let next = p
    // A mate needs your next move in the line too (it's counted against); the others only the reply.
    if (p.kind === 'mate' ? moves.length + 1 >= p.moves.length : moves.length >= p.moves.length) {
      setPhase('checking')
      const r = await searchHere(after.fen())
      if (r === undefined) return
      const mate = r && mateFor(r.score, mistake.color)
      // The engine sees no mate from here after all, or has no reply: what you found stands.
      if (!r?.pv.length || (p.kind === 'mate' && !mate)) return finish(wasShown, how)
      next = { ...p, moves: [...moves, ...r.pv.slice(0, p.kind === 'mate' ? 2 * mate! : undefined)].slice(0, p.kind === 'mate' ? undefined : lineLength(p)) }
      setPlan(next)
    }
    // A line goes on past its first moves only while your next move would be the only good one.
    if (p.kind === 'line' && yours >= LINE_MOVES) {
      const reply = next.moves[moves.length]
      const there = new Chess(after.fen())
      there.move(toMove(reply))
      if (there.isGameOver()) return finish(wasShown, how)
      setPhase('reply')
      const r = await searchHere(there.fen(), 2)
      if (r === undefined) return
      if (!r?.pv.length || !(onlyMove(r.score, r.second, mistake.color) || forcing(there.fen(), r.pv[0]))) return finish(wasShown, how)
      next = { ...next, moves: [...moves, reply, ...r.pv] }
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
    let r: Awaited<ReturnType<LineSearch>> | undefined = after.isDraw() ? { score: { type: 'cp', value: 0 }, pv: [], depth: 0 } : null
    if (!r) r = await searchHere(after.fen())
    if (r === undefined) return
    // The bar for this move: the best you had where you stand. The first is the plan's (searched deeper); later on,
    // the position has moved on, so it's searched the same way as your move.
    let bar = plan.score
    if (at > 0 && plan.kind !== 'mate') {
      const before = new Chess(mistake.fen)
      for (const x of line) before.move(toMove(x))
      const here = await searchHere(before.fen())
      if (here === undefined) return
      if (here) bar = here.score
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
    if (!acceptable(bar, r.score, mistake.color)) return bad()
    setTried(null)
    setFound('good')
    if (plan.kind === 'single') return void carryOn(plan, moves, 'good', shown)
    if (plan.kind === 'line') {
      const next = { ...plan, moves: [...moves, ...r.pv] }
      setPlan(next)
      return void carryOn(next, moves, 'good', shown)
    }
    // Another way in: the tactic from here, if it still wins; if not, good moves in a row from here on.
    const { end } = tacticEnd(mistake.fen, mistake.color, [...moves, ...r.pv])
    const next: LinePlan = end < at + 2 ? { ...plan, kind: 'line', moves: [...moves, ...r.pv] } : { ...plan, moves: [...moves, ...r.pv].slice(0, end + 1) }
    setPlan(next)
    void carryOn(next, moves, 'good', shown)
  }

  /** The next move, played for you: the mistake comes round again. */
  const show = async () => {
    if (phase !== 'playing' || !plan) return
    setViewPly(null)
    let move = plan.moves[line.length]
    if (!move) {
      // Off the engine's line (you found another way): its best move from here.
      const here = new Chess(mistake.fen)
      for (const x of line) here.move(toMove(x))
      setPhase('checking')
      const r = await searchHere(here.fen())
      if (r === undefined) return
      move = r?.pv[0] ?? ''
      if (!move) return setPhase('playing')
    }
    setShown(true)
    setFound(null)
    void carryOn(plan, [...line, move], 'best', true)
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
  const verdictWords = `${/^[AEIOU]/.test(label) ? 'an' : 'a'} ${label.toLowerCase()}`
  const orientation: Color = flipped ? (mistake.color === 'white' ? 'black' : 'white') : mistake.color
  const side = `${sideName(mistake.color)} to move`
  const lastSan = line.length ? new Chess(fens[line.length - 1]).move(toMove(line[line.length - 1])).san : null
  const multi = plan && plan.kind !== 'single'
  // The engine's move here (the plan's first; the review's while the plan is being worked out).
  const best = plan?.moves[0] ?? mistake.best
  const bestSan = best === mistake.best ? mistake.bestSan : new Chess(mistake.fen).move(toMove(best)).san
  const yourMoves = Math.ceil(line.length / 2)
  const say: { tone: Tone; label: string; line: string; mood: RookMood } =
    phase === 'planning'
      ? { tone: 'plain', label: engine ? 'Looking at your move' : 'Starting the engine', line: `In the game you played ${mistake.playedSan} here.`, mood: 'thinking' }
      : phase === 'story'
        ? storyAt === 0
          ? { tone: 'turn', label: side, line: `In the game you played ${mistake.playedSan} here.`, mood: 'neutral' }
          : { tone: 'bad', label: `You played ${mistake.playedSan}`, line: `${mistake.playedSan} was ${verdictWords}. Can you see why?`, mood: 'ouch' }
      : phase === 'why'
        ? { tone: 'bad', label: `You played ${mistake.playedSan}`, line: `Here's why it was ${verdictWords}.`, mood: 'thinking' }
      : phase === 'checking'
        ? { tone: 'plain', label: 'Checking', line: 'Stockfish is looking at your move.', mood: 'thinking' }
        : phase === 'wrong'
          ? { tone: 'bad', label: 'Not good enough', line: `That's ${wrongScore}. Try again.`, mood: 'ouch' }
          : phase === 'slower'
            ? { tone: 'bad', label: 'Slower mate', line: 'That mates too, but slower. Find the quickest.', mood: 'ouch' }
            : phase === 'solved'
              ? plan?.kind === 'mate'
                ? { tone: 'good', label: 'Solved', line: "Checkmate. That's the mate you missed.", mood: 'proud' }
                : plan?.kind === 'line'
                  ? { tone: 'good', label: 'Solved', line: COUNT_WORDS[yourMoves] ? `${COUNT_WORDS[yourMoves]} good moves in a row.` : 'That settles it.', mood: 'proud' }
                : plan?.kind === 'tactic'
                  ? { tone: 'good', label: 'Solved', line: `That wins ${plan.wins}.`, mood: 'proud' }
                  : found === 'best'
                    ? { tone: 'good', label: 'Best move', line: `${lastSan} is the engine's move too.`, mood: 'proud' }
                    : { tone: 'good', label: 'Good move', line: `${lastSan} works. The engine's pick: ${bestSan}.`, mood: 'pleased' }
              : phase === 'shown'
                ? multi
                  ? { tone: 'plain', label: 'That was the line', line: 'This one comes round again later.', mood: 'neutral' }
                  : { tone: 'plain', label: `The move was ${bestSan}`, line: 'This one comes round again later.', mood: 'neutral' }
                : yourMoves > 0 && found && !shown
                  ? {
                      tone: 'good',
                      label: found === 'best' ? 'Best move' : 'Good move',
                      line: found === 'best' ? 'Keep going.' : 'That works too. Keep going.',
                      mood: 'pleased',
                    }
                  : { tone: 'turn', label: side, line: plan ? lineGoal(plan, mistake.playedSan) : '', mood: 'neutral' }
  const lastIsYours = line.length % 2 === 1 && viewPly === null
  const mark = phase === 'story' || phase === 'why' ? undefined : tried && phase !== 'checking' ? 'wrong' : lastIsYours && found && !shown && phase !== 'shown' ? 'correct' : undefined
  // The move you played, in red: before the story plays it, and while you look for a better one.
  const yourMistake: DrawShape = { orig: mistake.played.slice(0, 2) as Key, dest: mistake.played.slice(2, 4) as Key, brush: 'red' }
  const shapes: DrawShape[] =
    phase === 'shown' && !multi
      ? [{ orig: best.slice(0, 2) as Key, dest: best.slice(2, 4) as Key, brush: 'best' }]
      : (phase === 'story' && storyAt === 0) || (phase === 'playing' && line.length === 0 && viewPly === null)
        ? [yourMistake]
        : []

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
      head={head}
      board={
        <Board
          key={turn}
          fen={explainView?.fen ?? fens[ply]}
          orientation={orientation}
          lastMove={explainView ? explainView.lastMove : lastMoveOf(node)}
          shapes={explainPlay ? [] : pick !== null ? ((explainer?.rows[pick]?.shapes ?? []) as DrawShape[]) : shapes}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={(m) => void onMove(m)}
          locked={phase !== 'playing' || viewPly !== null}
          mark={ply === lastPly && !explainView ? mark : undefined}
          verdict={(phase === 'story' || phase === 'why') && storyAt === 1 && !explainView ? mistake.cls : undefined}
        />
      }
      coach={<PuzzleCoach {...say} color={mistake.color} moodKey={`${turn}:${phase}:${line.length}:${storyAt > 0}`} />}
      body={
        <>
          {/* Where it's from, in one quiet line. */}
          <p className="mistake-context">
            <ClassIcon cls={mistake.cls} size={18} title={label} />
            <span>
              <strong>{mistake.playedSan}</strong> · {label} · vs {mistake.opponent} · {formatDay(mistake.at / 1000)}
            </span>
          </p>
          {(phase === 'why' || done) && (
            // The coach's note, arriving like a message: what went wrong (or, once solved, why the better move works),
            // then the explainer's rows.
            <section key={done ? 'done' : 'why'} className="coach-card" aria-label="The coach">
              <header className="coach-card-head">
                <span className="coach-card-rook">
                  <RookCoach mood={done ? 'pleased' : 'thinking'} moodKey={`${turn}:${phase}:card`} />
                </span>
                <span className="coach-card-who">
                  <strong>Coach</strong>
                  <span>{done ? `Why ${bestSan} works` : `Why ${mistake.playedSan} was ${verdictWords}`}</span>
                </span>
              </header>
              <p className="coach-card-text">{done ? (betterText(explanation) ?? `${bestSan} was the move.`) : storyText(facts, mistake)}</p>
              {explainer && (explainer.rows.length > 0 || explainer.lines.length > 0) && (
            <ExplainPanel
              title={`Why ${mistake.playedSan} was ${verdictWords}`}
              bare
              explanation={explainer}
              active={pick ?? -1}
              onPick={(i) => {
                setPick(i)
                setExplainPlay(null)
              }}
              onPlay={(i) => {
                const row = explainer.rows[i]
                setPick(i)
                setExplainPlay(row?.play ? { steps: playSteps(row.play), at: 0 } : null)
              }}
              onShowLine={(i) => {
                const shown = explainer.lines[i]
                if (shown) setExplainPlay({ steps: playSteps({ fen: shown.fen, uci: shown.uci }), at: 0 })
              }}
              scrollIn={false}
            />
              )}
              {!explainer && phase === 'why' && storyMoves.length > 1 && (
                <p className="coach-card-line">
                  What happens: <strong>{lineSan(mistake.fen, storyMoves)}</strong>
                </p>
              )}
            </section>
          )}
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
          {phase === 'story' ? (
            <>
              <button className="btn ghost" onClick={() => setPhase('why')} disabled={storyAt < 1}>
                Why?
              </button>
              <button className="btn accent-btn" onClick={() => setPhase('playing')} disabled={storyAt < 1}>
                Find a better move
              </button>
            </>
          ) : phase === 'why' ? (
            <>
              <button className="ctrl" onClick={() => setStoryAt(1)} disabled={storyAt < storyMoves.length} aria-label="Watch it again" title="Watch it again">
                <PuzzleIcon name="retry" />
              </button>
              <button className="btn accent-btn" onClick={() => setPhase('playing')}>
                Find a better move
              </button>
            </>
          ) : done ? (
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
              <button className="btn ghost" onClick={() => void show()} disabled={phase !== 'playing' || viewPly !== null} title="Plays the next move for you. This one comes round again.">
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
          <span className="puzzle-strip-note" title={`${solvedNow} fixed so far`}>
            {left} to go
          </span>
          {done && canPlayOut(fens[ply]) && (
            <button className="icon-btn strip-label" onClick={() => playItOut(fens[ply], orientation)} title="Play this position on against the coach">
              <PuzzleIcon name="playout" />
              Play it out
            </button>
          )}
          {!phone && steps}
        </div>
      }
    />
  )
}
