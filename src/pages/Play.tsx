import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess, DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Board } from '../components/Board'
import { BoardOptions } from '../components/BoardOptions'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MoveList } from '../components/MoveList'
import { NavIcon } from '../components/NavIcons'
import { PageHeader } from '../components/PageHeader'
import { PlayerBar } from '../components/PlayerBar'
import { SettingsDialog } from '../components/SettingsDialog'
import { ShareDialog } from '../components/ShareDialog'
import { Gear } from '../components/UserCard'
import type { AnalysisResult } from '../engine/Engine'
import { useEngine } from '../hooks/useEngine'
import { useMoveSounds } from '../hooks/useMoveSounds'
import { bookMove, candidates, decide, isComplete, pickLapse, soundMove } from '../lib/botMove'
import { CLOCK_GROUPS, clockLabel, flagged, pause, press, remaining, resume, startClock, type ClockSetting } from '../lib/clock'
import { winPercent, type Color } from '../lib/evaluation'
import { saveGame } from '../lib/games'
import { ALL_MOVES, LEVELS, levelInfo, searchLimits } from '../lib/levels'
import { materialState } from '../lib/material'
import { loadOpeningBook, type OpeningBook } from '../lib/openings'
import { acceptsDraw, DRAW_AFTER_PLIES, outcomeOf, playHeaders, playPgn, takebackPlies, type Outcome } from '../lib/playGame'
import { clearLiveGame, loadLiveGame, loadSetup, saveLiveGame, saveSetup, type LiveGame, type PlaySetup } from '../lib/playStore'
import { onReselect } from '../lib/router'
import { encodeShare, toSharedGame } from '../lib/share'
import { writeSession } from '../lib/session'
import type { Settings } from '../lib/settings'
import { addLine, createTree, mainline, ROOT_ID } from '../lib/tree'

interface Props {
  /** Play is the page showing. Leaving it after a game has ended clears the board for the next one. */
  active: boolean
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  avatar?: ReactNode
  /** A game has been put in the session: show it in Analysis. */
  onOpenAnalysis: () => void
}

const other = (c: Color): Color => (c === 'white' ? 'black' : 'white')
const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'black' : 'white')
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })

function formatClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Resumed games continue their clock from where it stopped: time away isn't charged. */
function restoreGame(): LiveGame | null {
  const g = loadLiveGame()
  if (!g) return null
  return g.clock && !g.outcome ? { ...g, clock: resume(g.clock, Date.now()) } : g
}

/** Play against the computer: pick a level, play with takebacks and hints, then review. */
export function PlayPage({ active, settings, updateSettings, avatar, onOpenAnalysis }: Props) {
  const [boardSettings, setBoardSettings] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  // Board settings sit by the game's heading (and the setup card's), where your eyes are.
  const gear = (
    <button className="icon-btn panel-gear" onClick={() => setBoardSettings(true)} aria-label="Board settings" title="Board settings">
      <Gear />
    </button>
  )
  const { engine, status } = useEngine('lite', { threads: 1, hashMb: 32 })
  const ready = status?.state === 'ready'
  const [setup, setSetup] = useState<PlaySetup>(loadSetup)
  const [game, setGame] = useState<LiveGame | null>(restoreGame)
  // Left the page after the game ended: it's saved in My recent games, so come back to a new setup.
  if (!active && game?.outcome) setGame(null)
  // Clicking Play again after the game ended does the same.
  useEffect(() => onReselect((path) => path === '/play' && setGame((g) => (g?.outcome ? null : g))), [])

  const start = (s: PlaySetup) => {
    saveSetup(s)
    const color: Color = s.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : s.color
    const now = Date.now()
    setGame({
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      startFen: DEFAULT_POSITION,
      color,
      setup: s,
      moves: [],
      clock: startClock(s.clock, now, 'white'),
      takebacks: 0,
      hints: 0,
      outcome: null,
      startedAt: now,
      saved: false,
    })
  }

  return (
    <div className="play-page">
      <PageHeader title="Play" avatar={avatar}>
        {game && game.moves.length > 0 && (
          <button className="btn ghost small page-header-action" onClick={() => setShareOpen(true)} title="Share game">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 15V4M7 9l5-5 5 5M5 14v6h14v-6" />
            </svg>
            <span className="page-header-label">Share</span>
          </button>
        )}
      </PageHeader>
      {boardSettings && (
        <SettingsDialog title="Board settings" onClose={() => setBoardSettings(false)}>
          <BoardOptions settings={settings} onChange={updateSettings} preview />
        </SettingsDialog>
      )}
      {game ? (
        <GameView
          key={game.id}
          active={active}
          gear={gear}
          sharing={shareOpen}
          onCloseShare={() => setShareOpen(false)}
          game={game}
          setGame={setGame}
          engine={ready ? engine : null}
          settings={settings}
          onRematch={() => start(game.setup)}
          onNewGame={() => {
            clearLiveGame()
            setGame(null)
          }}
          onReview={() => {
            writeSession({ pgn: playPgn(game.moves, { ...meta(game), date: new Date(game.startedAt) }), orientation: game.color, currentPly: 0, evals: {}, review: true })
            onOpenAnalysis()
          }}
        />
      ) : (
        <SetupView setup={setup} onChange={setSetup} onStart={() => start(setup)} gear={gear} />
      )}
    </div>
  )
}

const meta = (g: LiveGame) => ({ color: g.color, level: g.setup.level, clock: g.setup.clock, outcome: g.outcome, startFen: g.startFen })

function SetupView({ setup, onChange, onStart, gear }: { setup: PlaySetup; onChange: (s: PlaySetup) => void; onStart: () => void; gear: ReactNode }) {
  return (
    <main className="play-setup">
      <section className="home-card setup-card" aria-labelledby="setup-title">
        <div className="setup-head">
          <h2 id="setup-title">Play the computer</h2>
          {gear}
        </div>
        <p className="muted">Takebacks and hints allowed. Your game is saved to My recent games when it ends.</p>

        <div className="level-pick">
          <div className="level-readout">
            <h3 className="setup-label" id="level-label">
              Level <strong>{setup.level}</strong>
            </h3>
            <span>Strength {levelInfo(setup.level).rating}</span>
          </div>
          <input
            type="range"
            className="level-slider"
            min={1}
            max={LEVELS.length}
            step={1}
            value={setup.level}
            aria-labelledby="level-label"
            aria-valuetext={`Level ${setup.level}, strength ${levelInfo(setup.level).rating}`}
            style={{ '--p': (setup.level - 1) / (LEVELS.length - 1) } as CSSProperties}
            onChange={(e) => onChange({ ...setup, level: Number(e.target.value) })}
          />
          <div className="level-ticks" aria-hidden>
            {LEVELS.map((l) => (
              <span key={l.level} className={l.level === setup.level ? 'active' : ''}>
                {l.level}
              </span>
            ))}
          </div>
        </div>

        <h3 className="setup-label">Your colour</h3>
        <div className="segmented" role="radiogroup" aria-label="Your colour">
          {(['white', 'random', 'black'] as const).map((c) => (
            <button key={c} role="radio" aria-checked={setup.color === c} className={setup.color === c ? 'active' : ''} onClick={() => onChange({ ...setup, color: c })}>
              {c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}
            </button>
          ))}
        </div>

        <h3 className="setup-label">Clock</h3>
        <div className="clock-grid" role="radiogroup" aria-label="Clock">
          <ClockChip value="none" setup={setup} onChange={onChange} />
          {CLOCK_GROUPS.map((g) => (
            <div key={g.name} className="clock-row">
              <span className="clock-group">{g.name}</span>
              {g.settings.map((value) => (
                <ClockChip key={value} value={value} setup={setup} onChange={onChange} />
              ))}
            </div>
          ))}
        </div>

        <button className="btn accent-btn setup-start" onClick={onStart}>
          Start game
        </button>
      </section>
    </main>
  )
}

function ClockChip({ value, setup, onChange }: { value: ClockSetting; setup: PlaySetup; onChange: (s: PlaySetup) => void }) {
  const active = setup.clock === value
  return (
    <button role="radio" aria-checked={active} className={`clock-chip ${value === 'none' ? 'untimed' : ''} ${active ? 'active' : ''}`} onClick={() => onChange({ ...setup, clock: value })}>
      {clockLabel(value)}
    </button>
  )
}

interface GameViewProps {
  game: LiveGame
  setGame: (update: (g: LiveGame | null) => LiveGame | null) => void
  engine: ReturnType<typeof useEngine>['engine']
  settings: Settings
  onRematch: () => void
  onNewGame: () => void
  onReview: () => void
  /** Play is the page showing: the arrow keys step through the moves. */
  active: boolean
  /** Opens Board settings, in the panel's heading. */
  gear: ReactNode
  /** The page header's Share was clicked: show the share dialog for this game. */
  sharing: boolean
  onCloseShare: () => void
}

function GameView({ game, setGame, engine, settings, onRematch, onNewGame, onReview, active, gear, sharing, onCloseShare }: GameViewProps) {
  const level = levelInfo(game.setup.level)
  const { tree, line } = useMemo(() => {
    const t = addLine(createTree(game.startFen), ROOT_ID, game.moves).tree
    return { tree: t, line: mainline(t) }
  }, [game.startFen, game.moves])
  const node = line[line.length - 1]
  const turn = turnOf(node.fen)
  const yourTurn = !game.outcome && turn === game.color
  const [now, setNow] = useState(Date.now)
  const [hint, setHint] = useState<{ ply: number; uci: string } | null>(null)
  const [thinking, setThinking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Which ending is waiting for its confirmation dialog.
  const [confirming, setConfirming] = useState<'abort' | 'resign' | null>(null)
  const busy = useRef<AbortController | null>(null)

  // Looking back through the game: the ply on show, or null for the live position. Any new move
  // (or a takeback) returns to live, as does stepping past the last move.
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [seenMoves, setSeenMoves] = useState(game.moves.length)
  if (seenMoves !== game.moves.length) {
    setSeenMoves(game.moves.length)
    setViewPly(null)
  }
  const lastPly = line.length - 1
  const shownPly = viewPly ?? lastPly
  const shown = line[shownPly]
  const showPly = useCallback((ply: number) => setViewPly(ply >= lastPly ? null : Math.max(0, ply)), [lastPly])
  const [flipped, setFlipped] = useState(false)
  const orientation = flipped ? other(game.color) : game.color

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return
      const actions: Record<string, () => void> = {
        ArrowLeft: () => showPly(shownPly - 1),
        ArrowRight: () => showPly(shownPly + 1),
        ArrowUp: () => showPly(0),
        Home: () => showPly(0),
        ArrowDown: () => showPly(lastPly),
        End: () => showPly(lastPly),
        f: () => setFlipped((f) => !f),
      }
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, showPly, shownPly, lastPly])

  /** Plays a move for whoever is to move, pressing the clock and checking for the end. */
  const play = useCallback(
    (uci: string) =>
      setGame((g) => {
        if (!g || g.outcome) return g
        const at = Date.now()
        const moves = [...g.moves, uci]
        const mover: Color = g.moves.length % 2 === 0 ? turnOf(g.startFen) : other(turnOf(g.startFen))
        const outcome = outcomeOf(g.startFen, moves)
        let clock = g.clock && press(g.clock, mover, at)
        if (clock && outcome) clock = pause(clock, at)
        return { ...g, moves, clock, outcome }
      }),
    [setGame],
  )

  const end = useCallback(
    (outcome: Outcome) =>
      setGame((g) => {
        if (!g || g.outcome) return g
        return { ...g, outcome, clock: g.clock && pause(g.clock, Date.now()) }
      }),
    [setGame],
  )

  // Save the game in progress after every change; write it to the games list (once) when it ends.
  const savedGame = useRef(game.saved)
  useEffect(() => {
    const snapshot = game.clock && !game.outcome ? { ...game, clock: pause(game.clock, Date.now()) } : game
    if (game.outcome && !savedGame.current) {
      savedGame.current = true
      const yours = game.outcome.result === '1/2-1/2' ? 'draw' : (game.outcome.result === '1-0') === (game.color === 'white') ? 'win' : 'loss'
      saveGame({
        id: game.id,
        pgn: playPgn(game.moves, { ...meta(game), date: new Date(game.startedAt) }),
        result: yours,
        reason: game.outcome.reason,
        color: game.color,
        level: game.setup.level,
        clock: game.setup.clock,
        takebacks: game.takebacks,
        hints: game.hints,
        endedAt: Date.now(),
      })
    }
    saveLiveGame({ ...snapshot, saved: savedGame.current })
  }, [game])

  // The clock as of now, for capping the computer's thinking pause.
  const clockRef = useRef(game.clock)
  useEffect(() => {
    clockRef.current = game.clock
  }, [game.clock])

  // The opening book, for the computer's first moves.
  const [book, setBook] = useState<OpeningBook | null>(null)
  useEffect(() => {
    void loadOpeningBook().then(setBook)
  }, [])

  // The computer's move: score every legal move, choose like a player of the level's rating would
  // (botMove.ts), then wait out a human-like pause.
  useEffect(() => {
    if (!engine || game.outcome || turn === game.color) return
    const ctrl = new AbortController()
    busy.current = ctrl
    const fen = node.fen
    const ply = game.moves.length
    const began = Date.now()
    void (async () => {
      setThinking(true)
      const clockMs = clockRef.current ? remaining(clockRef.current, turn, began) : null
      // Keep the last iteration that scored every move: the time limit can cut the next one off halfway.
      const legal = new Chess(fen).moves().length
      let complete: AnalysisResult['lines'] | null = null
      const result = await engine.analyze({
        fen,
        multiPv: ALL_MOVES,
        ...searchLimits(level, clockMs),
        signal: ctrl.signal,
        onUpdate: (r) => {
          if (isComplete(r.lines, legal)) complete = r.lines
        },
      })
      if (ctrl.signal.aborted || !result?.lines.length) return
      const moves = candidates(complete ?? result.lines, turn)
      let uci = book && ply < level.bookPlies ? bookMove(moves, fen, book.isBook) : null
      if (!uci) {
        const step = decide(moves, level.style)
        if ('move' in step) uci = step.move
        else {
          // A lapse: of the bad moves, the one that looks fine at a glance.
          const glance = await engine.analyze({ fen, multiPv: ALL_MOVES, depth: 1, signal: ctrl.signal })
          if (ctrl.signal.aborted || !glance) return
          uci = pickLapse(step.lapse, candidates(glance.lines, turn), level.style) ?? soundMove(moves, level.style)
        }
      }
      let wait = level.delay[0] + Math.random() * (level.delay[1] - level.delay[0])
      if (clockRef.current) wait = Math.min(wait, remaining(clockRef.current, turn, Date.now()) * 0.05)
      await sleep(Math.max(0, wait - (Date.now() - began)), ctrl.signal)
      if (!ctrl.signal.aborted) play(uci)
    })().finally(() => {
      if (busy.current === ctrl) {
        busy.current = null
        setThinking(false)
      }
    })
    return () => ctrl.abort()
  }, [engine, node.fen, turn, game.color, game.outcome, game.moves.length, level, book, play])

  // Clocks: tick while a timed game runs, and end it on a flag.
  useEffect(() => {
    if (!game.clock || game.outcome) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const flag = flagged(game.clock!, t)
      if (flag) end({ result: flag === 'white' ? '0-1' : '1-0', reason: 'timeout' })
    }, 250)
    return () => clearInterval(id)
  }, [game.clock, game.outcome, end])

  const takeback = () => {
    const plies = takebackPlies(game.moves.length, game.color, turnOf(game.startFen))
    if (!plies) return
    busy.current?.abort()
    setHint(null)
    setGame((g) => (g ? { ...g, moves: g.moves.slice(0, -plies), takebacks: g.takebacks + 1, clock: g.clock && { ...g.clock, running: g.color, since: Date.now() } } : g))
  }

  const showHint = async () => {
    if (!engine || !yourTurn) return
    const result = await engine.analyze({ fen: node.fen, multiPv: 1, depth: 16 })
    if (!result?.bestMove) return
    setHint({ ply: game.moves.length, uci: result.bestMove })
    setGame((g) => (g ? { ...g, hints: g.hints + 1 } : g))
  }

  const offerDraw = async () => {
    // Only on your turn: a search now would cut the computer's own search short.
    if (!engine || !yourTurn) return
    const decline = (why: string) => {
      setNotice(why)
      setTimeout(() => setNotice(null), 2500)
    }
    if (game.moves.length < DRAW_AFTER_PLIES) return decline('Too early for a draw: play on a little.')
    const result = await engine.analyze({ fen: node.fen, multiPv: 1, depth: 14 })
    const score = result?.lines[0]?.score
    if (!score) return
    // The search scores for White; the computer plays the other colour from you.
    const botWin = game.color === 'white' ? 100 - winPercent(score) : winPercent(score)
    if (acceptsDraw(botWin, game.moves.length, game.setup.level)) end({ result: '1/2-1/2', reason: 'agreement' })
    else decline('Rookahead declines the draw.')
  }

  const onMove = (move: { from: string; to: string; promotion?: string }) => {
    if (!yourTurn) return
    const uci = move.from + move.to + (move.promotion ?? '')
    if (!new Chess(node.fen).moves({ verbose: true }).some((m) => m.lan === uci)) return
    setHint(null)
    play(uci)
  }

  const shapes: DrawShape[] = hint && hint.ply === game.moves.length && viewPly === null ? [{ orig: hint.uci.slice(0, 2) as Key, dest: hint.uci.slice(2, 4) as Key, brush: 'suggest' }] : []
  useMoveSounds(tree, shown, settings.soundVolume, Boolean(game.outcome))

  const material = materialState(shown.fen)
  const computerName = `Rookahead · Level ${level.level}`
  const clockOf = (c: Color) =>
    game.clock && (
      <span className={`player-clock ${game.clock.running === c && !game.outcome ? 'running' : ''} ${remaining(game.clock, c, now) < 30000 ? 'low' : ''}`}>
        {formatClock(remaining(game.clock, c, now))}
      </span>
    )
  const bar = (c: Color) => (
    <PlayerBar
      color={c}
      name={c === game.color ? 'You' : computerName}
      rating={c === game.color ? undefined : String(level.rating)}
      captured={material.captured[c]}
      advantage={material.advantage[c]}
      clock={clockOf(c)}
    />
  )
  const lastMove = shown.from && shown.to ? ([shown.from, shown.to] as [typeof shown.from, typeof shown.to]) : undefined
  const canTakeBack = !game.outcome && takebackPlies(game.moves.length, game.color, turnOf(game.startFen)) > 0
  // Until both sides have moved, the game can be called off instead: not saved, not counted.
  const canAbort = !game.outcome && game.moves.length < 2

  const headers = playHeaders({ ...meta(game), date: new Date(game.startedAt) })

  return (
    <main className="play-layout">
      {confirming === 'abort' && (
        <ConfirmDialog title="Abort this game?" confirm="Abort game" cancel="Keep playing" onConfirm={onNewGame} onClose={() => setConfirming(null)}>
          It’s called off: not saved to My games and not counted as a loss.
        </ConfirmDialog>
      )}
      {confirming === 'resign' && (
        <ConfirmDialog
          title="Resign this game?"
          confirm="Resign"
          cancel="Keep playing"
          danger
          onConfirm={() => {
            setConfirming(null)
            end({ result: game.color === 'white' ? '0-1' : '1-0', reason: 'resignation' })
          }}
          onClose={() => setConfirming(null)}
        >
          {`Level ${game.setup.level} wins. The game is saved to My games, where you can review it.`}
        </ConfirmDialog>
      )}
      {sharing && (
        <ShareDialog
          onClose={onCloseShare}
          line={line}
          currentNode={shown}
          headers={headers}
          orientation={orientation}
          report={null}
          boardTheme={settings.boardTheme}
          getToken={() => encodeShare(toSharedGame(line, headers, orientation, null))}
        />
      )}
      <section className="play-board">
        {bar(other(orientation))}
        <Board
          fen={shown.fen}
          orientation={orientation}
          lastMove={lastMove}
          shapes={shapes}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={onMove}
          locked={!yourTurn || viewPly !== null}
        />
        {bar(orientation)}
      </section>

      <aside className="panel play-panel">
        <div className="panel-card">
          <header className="play-panel-head">
            <div className="play-panel-title">
              <strong>{computerName}</strong>
              <span className="muted">
                {level.rating} · You play {game.color} · {clockLabel(game.setup.clock)}
              </span>
            </div>
            {gear}
          </header>
          <p className={`play-status ${game.outcome ? 'over' : ''}`} role="status">
            {game.outcome ? outcomeText(game.outcome, game.color) : notice ?? (yourTurn ? 'Your move' : thinking || !engine ? 'Rookahead is thinking…' : 'Rookahead to move')}
          </p>
          <div className="panel-body">
            <MoveList tree={tree} currentId={shown.id} onSelect={(id) => showPly(line.findIndex((n) => n.id === id))} report={null} emptyText="Your moves and the computer’s appear here." />
          </div>
          <nav className="play-nav" aria-label="Move navigation">
            <button className="ctrl" onClick={() => showPly(0)} disabled={shownPly === 0} aria-label="First move" title="First move (↑)">
              <NavIcon name="first" />
            </button>
            <button className="ctrl" onClick={() => showPly(shownPly - 1)} disabled={shownPly === 0} aria-label="Previous move" title="Previous move (←)">
              <NavIcon name="prev" />
            </button>
            <button className="ctrl" onClick={() => showPly(shownPly + 1)} disabled={viewPly === null} aria-label="Next move" title="Next move (→)">
              <NavIcon name="next" />
            </button>
            <button className="ctrl" onClick={() => showPly(lastPly)} disabled={viewPly === null} aria-label="Last move" title="Back to the game (↓)">
              <NavIcon name="last" />
            </button>
            <button className="ctrl flip" onClick={() => setFlipped((f) => !f)} aria-label="Flip board" title="Flip board (F)">
              <NavIcon name="flip" />
            </button>
          </nav>
          {game.outcome ? (
            <ResultCard game={game} onReview={onReview} onRematch={onRematch} onNewGame={onNewGame} />
          ) : (
            <div className="play-actions">
              <button className="btn ghost" onClick={takeback} disabled={!canTakeBack}>
                Takeback{game.takebacks ? ` · ${game.takebacks}` : ''}
              </button>
              <button className="btn ghost" onClick={() => void showHint()} disabled={!yourTurn || !engine}>
                Hint{game.hints ? ` · ${game.hints}` : ''}
              </button>
              <button className="btn ghost" onClick={() => void offerDraw()} disabled={!engine || !yourTurn}>
                Offer draw
              </button>
              {canAbort ? (
                <button className="btn ghost" onClick={() => setConfirming('abort')} title="Call the game off: it isn't saved or counted">
                  Abort
                </button>
              ) : (
                <button className="btn ghost" onClick={() => setConfirming('resign')}>
                  Resign
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </main>
  )
}

const REASONS: Record<Outcome['reason'], string> = {
  checkmate: 'by checkmate',
  stalemate: 'by stalemate',
  'insufficient material': 'by insufficient material',
  'threefold repetition': 'by threefold repetition',
  'fifty-move rule': 'by the fifty-move rule',
  timeout: 'on time',
  resignation: 'by resignation',
  agreement: 'by agreement',
}

function outcomeText(outcome: Outcome, you: Color) {
  if (outcome.result === '1/2-1/2') return `Draw ${REASONS[outcome.reason]}`
  const youWon = (outcome.result === '1-0') === (you === 'white')
  return `${youWon ? 'You won' : 'Rookahead won'} ${REASONS[outcome.reason]}`
}

function ResultCard({ game, onReview, onRematch, onNewGame }: { game: LiveGame; onReview: () => void; onRematch: () => void; onNewGame: () => void }) {
  const counts = [game.takebacks && `${game.takebacks} ${game.takebacks === 1 ? 'takeback' : 'takebacks'}`, game.hints && `${game.hints} ${game.hints === 1 ? 'hint' : 'hints'}`].filter(Boolean)
  return (
    <div className="result-card">
      {counts.length > 0 && <p className="muted">{counts.join(' · ')}</p>}
      <button className="btn accent-btn" onClick={onReview} disabled={game.moves.length < 2}>
        Review this game
      </button>
      <div className="result-more">
        <button className="btn ghost" onClick={onRematch}>
          Rematch
        </button>
        <button className="btn ghost" onClick={onNewGame}>
          New game
        </button>
      </div>
    </div>
  )
}
