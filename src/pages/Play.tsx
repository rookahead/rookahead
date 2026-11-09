import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess, DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Board } from '../components/Board'
import { BoardOptions } from '../components/BoardOptions'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MoveList } from '../components/MoveList'
import { MoveStrip } from '../components/MoveStrip'
import { FlipIcon, NavIcon, ShareIcon, SoundIcon } from '../components/NavIcons'
import { PageHeader } from '../components/PageHeader'
import { PlayerBar } from '../components/PlayerBar'
import { ToolIcon } from '../components/PlayToolIcon'
import { ROOK } from '../components/RookLogo'
import { SettingsDialog } from '../components/SettingsDialog'
import { ShareDialog } from '../components/ShareDialog'
import { AvatarFace, Gear } from '../components/UserCard'
import type { AnalysisResult } from '../engine/Engine'
import { useEngine } from '../hooks/useEngine'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMoveSounds } from '../hooks/useMoveSounds'
import { endMarks } from '../lib/gameEnd'
import { bookMove, candidates, decide, isComplete, pickLapse, soundMove } from '../lib/botMove'
import { CLOCK_GROUPS, clockLabel, flagged, pause, press, remaining, resume, startClock, type ClockSetting } from '../lib/clock'
import { winPercent, type Color } from '../lib/evaluation'
import { saveGame } from '../lib/games'
import { useImmersive } from '../lib/immersive'
import { ALL_MOVES, LEVELS, levelInfo, searchLimits } from '../lib/levels'
import { materialState } from '../lib/material'
import { loadOpeningBook, openingOf, type OpeningBook } from '../lib/openings'
import { acceptsDraw, DRAW_AFTER_PLIES, outcomeOf, playHeaders, playPgn, takebackPlies, type Outcome } from '../lib/playGame'
import { clearLiveGame, loadLiveGame, loadSetup, saveLiveGame, saveSetup, type LiveGame, type PlaySetup } from '../lib/playStore'
import { canPlay, connectLichess, useLichess } from '../lib/lichessAuth'
import { isOnlineClock, loadLiveOnline, ONLINE_CLOCKS, saveLiveOnline, seek, type OnlineClock, type StartedGame } from '../lib/lichessPlay'
import { onReselect } from '../lib/router'
import { encodeShare, toSharedGame } from '../lib/share'
import { writeSession } from '../lib/session'
import { useAccount } from '../lib/account'
import { logUse } from '../lib/usage'
import { DEFAULT_SETTINGS, type Settings } from '../lib/settings'
import { formatClockFace, timeSpent } from '../lib/clocks'
import { addLine, createTree, mainline, ROOT_ID } from '../lib/tree'
import { OnlineGameView } from './play/OnlineGame'

interface Props {
  /** Play is the page showing. Leaving it after a game has ended clears the board for the next one. */
  active: boolean
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
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

/** Resumed games continue their clock from where it stopped: time away isn't charged. */
function restoreGame(): LiveGame | null {
  const g = loadLiveGame()
  if (!g) return null
  return g.clock && !g.outcome ? { ...g, clock: resume(g.clock, Date.now()) } : g
}

/** Play against the computer: pick a level, play with takebacks and hints, then review. */
export function PlayPage({ active, settings, updateSettings, onOpenAnalysis }: Props) {
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
  // Online: the game you're playing on Lichess (kept, so a reload goes back to it), and the search for one.
  const [mode, setMode] = useState<PlayMode>(loadMode)
  const [onlineSetup, setOnlineSetup] = useState<OnlineSetup>(loadOnlineSetup)
  const [online, setOnline] = useState<StartedGame | null>(loadLiveOnline)
  const [searching, setSearching] = useState<{ since: number; ctrl: AbortController } | null>(null)
  const [onlineNote, setOnlineNote] = useState<string | null>(null)
  // Phones play full screen: no tab bar while a game is on the board.
  const phone = useMediaQuery('(max-width: 1000px)')
  useImmersive(active && phone && Boolean(game || online))
  useEffect(() => () => searching?.ctrl.abort(), [searching])

  const findOpponent = async (s: OnlineSetup) => {
    saveOnlineSetup(s)
    setOnlineNote(null)
    const ctrl = new AbortController()
    setSearching({ since: Date.now(), ctrl })
    const found = await seek(s.clock, s.rated, ctrl.signal)
    setSearching((was) => (was?.ctrl === ctrl ? null : was))
    if (found === 'refused') setOnlineNote('Lichess turned the search down. Check your Lichess account (a game already open there, or a new account still being checked), then try again.')
    else if (found) {
      saveLiveOnline(found)
      setOnline(found)
    } else if (!ctrl.signal.aborted) setOnlineNote('No opponent turned up. Try again, or pick another time control.')
  }
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
      <PageHeader
        // Desktop has a game's actions in the panel's own heading, so the board gets the height.
        phoneOnly={Boolean(game || online)}
        title="Play"
        back={game || online ? '/' : undefined}
        phoneTitle={online ? 'Online' : game ? `Level ${game.setup.level} · ${levelInfo(game.setup.level).rating}` : undefined}
        phoneSub={online ? `On Lichess · you play ${online.color}` : game ? `${clockLabel(game.setup.clock)} · you play ${game.color}` : undefined}
      >
        {phone && (game || online) && gear}
      </PageHeader>
      {boardSettings && (
        <SettingsDialog title="Board settings" onClose={() => setBoardSettings(false)}>
          <BoardOptions settings={settings} onChange={updateSettings} preview play />
        </SettingsDialog>
      )}
      {online ? (
        <OnlineGameView
          key={online.id}
          started={online}
          settings={settings}
          phone={phone}
          active={active}
          gear={gear}
          onToggleSound={() => updateSettings({ soundVolume: settings.soundVolume === 0 ? DEFAULT_SETTINGS.soundVolume : 0 })}
          onReview={(pgn, color) => {
            writeSession({ pgn, orientation: color, currentPly: 0, evals: {}, review: true })
            onOpenAnalysis()
          }}
          onAgain={() => {
            setOnline(null)
            void findOpponent(onlineSetup)
          }}
          onDone={() => {
            saveLiveOnline(null)
            setOnline(null)
          }}
        />
      ) : game ? (
        <GameView
          key={game.id}
          phone={phone}
          active={active}
          gear={gear}
          sharing={shareOpen}
          onShare={() => setShareOpen(true)}
          onToggleSound={() => updateSettings({ soundVolume: settings.soundVolume === 0 ? DEFAULT_SETTINGS.soundVolume : 0 })}
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
            writeSession({ pgn: playPgn(game.moves, { ...meta(game), date: new Date(game.startedAt) }, game.clocks), orientation: game.color, currentPly: 0, evals: {}, review: true })
            onOpenAnalysis()
          }}
        />
      ) : (
        <SetupView
          setup={setup}
          onChange={setSetup}
          onStart={() => start(setup)}
          gear={gear}
          mode={mode}
          onMode={(m) => {
            saveMode(m)
            setMode(m)
          }}
          online={
            <OnlineSetupView
              setup={onlineSetup}
              onChange={setOnlineSetup}
              searching={searching?.since ?? null}
              note={onlineNote}
              onFind={() => void findOpponent(onlineSetup)}
              onCancel={() => searching?.ctrl.abort()}
            />
          }
        />
      )}
    </div>
  )
}

const meta = (g: LiveGame) => ({ color: g.color, level: g.setup.level, clock: g.setup.clock, outcome: g.outcome, startFen: g.startFen })

function SetupView({
  setup,
  onChange,
  onStart,
  gear,
  mode,
  onMode,
  online,
}: {
  setup: PlaySetup
  onChange: (s: PlaySetup) => void
  onStart: () => void
  gear: ReactNode
  mode: PlayMode
  onMode: (m: PlayMode) => void
  online: ReactNode
}) {
  return (
    <main className="play-setup">
      <section className="home-card setup-card" aria-labelledby="setup-title">
        <div className="segmented play-mode" role="radiogroup" aria-label="Play">
          {(['computer', 'online'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'active' : ''} onClick={() => onMode(m)}>
              {m === 'computer' ? 'Computer' : 'Online'}
            </button>
          ))}
        </div>
        <div className="setup-head">
          <h2 id="setup-title">{mode === 'online' ? 'Play online' : 'Play the computer'}</h2>
          {gear}
        </div>
        {mode === 'online' ? online : <ComputerSetup setup={setup} onChange={onChange} onStart={onStart} />}
      </section>
    </main>
  )
}

function ComputerSetup({ setup, onChange, onStart }: { setup: PlaySetup; onChange: (s: PlaySetup) => void; onStart: () => void }) {
  return (
    <>
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
    </>
  )
}

type PlayMode = 'computer' | 'online'
const MODE_KEY = 'rookahead.playMode'
const ONLINE_SETUP_KEY = 'rookahead.onlineSetup'

interface OnlineSetup {
  clock: OnlineClock
  rated: boolean
}

function loadMode(): PlayMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'online' ? 'online' : 'computer'
  } catch {
    return 'computer'
  }
}

function saveMode(m: PlayMode) {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    // Not remembered.
  }
}

function loadOnlineSetup(): OnlineSetup {
  try {
    const raw = JSON.parse(localStorage.getItem(ONLINE_SETUP_KEY) ?? 'null')
    return { clock: isOnlineClock(raw?.clock) ? raw.clock : '10+0', rated: raw?.rated !== false }
  } catch {
    return { clock: '10+0', rated: true }
  }
}

function saveOnlineSetup(s: OnlineSetup) {
  try {
    localStorage.setItem(ONLINE_SETUP_KEY, JSON.stringify(s))
  } catch {
    // Not remembered.
  }
}

/**
 * Playing a real person, through your Lichess account: connect it (or allow playing, for a connection from
 * before online play), pick a time control, and Lichess finds the opponent.
 */
function OnlineSetupView({
  setup,
  onChange,
  searching,
  note,
  onFind,
  onCancel,
}: {
  setup: OnlineSetup
  onChange: (s: OnlineSetup) => void
  searching: number | null
  note: string | null
  onFind: () => void
  onCancel: () => void
}) {
  const { link, busy, error } = useLichess()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (searching == null) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [searching])
  if (!link || !canPlay(link))
    return (
      <>
        <p className="muted">
          {link
            ? 'One more step: allow Rookahead to play games for your Lichess account. It’s one tap on Lichess.'
            : 'Real players, through your Lichess account. Rated games count for your Lichess rating, the one on your profile.'}
        </p>
        <button className="btn accent-btn setup-start" disabled={busy} onClick={() => void connectLichess()}>
          {busy ? 'Connecting…' : link ? 'Allow on Lichess' : 'Connect Lichess'}
        </button>
        {error && <p className="form-error">{error}</p>}
      </>
    )
  const waited = searching == null ? 0 : Math.floor((now - searching) / 1000)
  return (
    <>
      <p className="muted">
        Real players on Lichess, as <b>{link.username}</b>. No engine while you play: that’s Lichess’s rule.
      </p>
      <h3 className="setup-label">Time control</h3>
      <div className="clock-grid" role="radiogroup" aria-label="Time control">
        {ONLINE_CLOCKS.map((g) => (
          <div key={g.group} className="clock-row">
            <span className="clock-group">{g.group}</span>
            {g.clocks.map((c) => (
              <button key={c} role="radio" aria-checked={setup.clock === c} className={`clock-chip ${setup.clock === c ? 'active' : ''}`} disabled={searching != null} onClick={() => onChange({ ...setup, clock: c })}>
                {c}
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="online-note muted">Lichess pairs apps like Rookahead at rapid and classical only.</p>
      <label className="online-rated">
        <span>Rated</span>
        <span className="switch">
          <input type="checkbox" role="switch" checked={setup.rated} disabled={searching != null} onChange={() => onChange({ ...setup, rated: !setup.rated })} />
          <span className="switch-track" />
        </span>
      </label>
      {searching != null ? (
        <div className="online-searching" role="status">
          <span className="online-pulse" aria-hidden />
          <span>
            Looking for an opponent · {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, '0')}
          </span>
          <button className="btn ghost small" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="btn accent-btn setup-start" onClick={onFind}>
          Find an opponent
        </button>
      )}
      {note && <p className="form-error">{note}</p>}
    </>
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
  /** Share was clicked: show the share dialog for this game. */
  sharing: boolean
  /** Share, in the row at the panel's foot. */
  onShare: () => void
  /** Sounds on or off, in the same row. */
  onToggleSound: () => void
  onCloseShare: () => void
  /** Phones: Board settings are in the page header, and the moves are a strip. */
  phone: boolean
}

function GameView({ game, setGame, engine, settings, onRematch, onNewGame, onReview, active, gear, sharing, onShare, onToggleSound, onCloseShare, phone }: GameViewProps) {
  const level = levelInfo(game.setup.level)
  const { tree, line } = useMemo(() => {
    const t = addLine(createTree(game.startFen), ROOT_ID, game.moves, game.clocks).tree
    return { tree: t, line: mainline(t) }
  }, [game.startFen, game.moves, game.clocks])
  // How long each move took, beside it in the list (timed games only).
  const spent = useMemo(() => {
    if (!game.clocks) return undefined
    const t = timeSpent(tree, { TimeControl: game.setup.clock })
    return Object.keys(t).length ? t : undefined
  }, [tree, game.clocks, game.setup.clock])
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
  const muted = settings.soundVolume === 0
  // Focus (desktop): the sidebar steps aside and the board takes the room. Remembered for the next game.
  const [focus, setFocus] = useState(readFocus)
  const toggleFocus = () =>
    setFocus((f) => {
      writeFocus(!f)
      return !f
    })
  const focused = focus && active && !phone
  useEffect(() => {
    if (!focused) return
    const root = document.documentElement
    root.dataset.focus = ''
    return () => {
      delete root.dataset.focus
    }
  }, [focused])

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
        Escape: () => {
          if (focus) toggleFocus()
        },
      }
      const action = actions[e.key]
      if (action) {
        e.preventDefault()
        action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, showPly, shownPly, lastPly, focus])

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
        // The mover's clock as the move leaves it, kept in step with the moves (a game from before this was kept has none).
        const before = g.clocks ?? (g.moves.length ? undefined : [])
        const clocks = clock && before ? [...before, Math.round(clock[mover] / 100) / 10] : undefined
        if (clock && outcome) clock = pause(clock, at)
        return { ...g, moves, clocks, clock, outcome }
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
        pgn: playPgn(game.moves, { ...meta(game), date: new Date(game.startedAt) }, game.clocks),
        result: yours,
        reason: game.outcome.reason,
        color: game.color,
        level: game.setup.level,
        clock: game.setup.clock,
        takebacks: game.takebacks,
        hints: game.hints,
        endedAt: Date.now(),
      })
      logUse('bot_game', yours)
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
    // Tenths show under ten seconds, so the clock ticks faster then.
    let id: ReturnType<typeof setTimeout>
    const tick = () => {
      const t = Date.now()
      setNow(t)
      const flag = flagged(game.clock!, t)
      if (flag) return end({ result: flag === 'white' ? '0-1' : '1-0', reason: 'timeout' })
      id = setTimeout(tick, remaining(game.clock!, game.clock!.running, t) < 10000 ? 100 : 250)
    }
    id = setTimeout(tick, 250)
    return () => clearTimeout(id)
  }, [game.clock, game.outcome, end])

  const takeback = () => {
    const plies = takebackPlies(game.moves.length, game.color, turnOf(game.startFen))
    if (!plies) return
    busy.current?.abort()
    setHint(null)
    setGame((g) => (g ? { ...g, moves: g.moves.slice(0, -plies), clocks: g.clocks?.slice(0, -plies), takebacks: g.takebacks + 1, clock: g.clock && { ...g.clock, running: g.color, since: Date.now() } } : g))
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
  // You: your username and photo once signed in (else "You" and its initial); the computer: the Rookahead rook.
  const { account, username } = useAccount()
  const yourName = username ?? 'You'
  const yourFace = username ? <AvatarFace account={account} /> : undefined
  const computerFace = (
    <svg className="player-avatar-mark" viewBox="0 0 24 24" fill="currentColor">
      <path d={ROOK} />
    </svg>
  )
  const clockOf = (c: Color) =>
    game.clock && (
      <span className={`player-clock ${game.clock.running === c && !game.outcome ? 'running' : ''} ${remaining(game.clock, c, now) < 30000 ? 'low' : ''}`}>
        {formatClockFace(remaining(game.clock, c, now) / 1000)}
      </span>
    )
  const bar = (c: Color) => (
    <PlayerBar
      color={c}
      name={c === game.color ? yourName : computerName}
      rating={c === game.color ? undefined : String(level.rating)}
      avatar={c === game.color ? yourFace : computerFace}
      captured={material.captured[c]}
      advantage={material.advantage[c]}
      clock={clockOf(c)}
    />
  )
  const lastMove = shown.from && shown.to ? ([shown.from, shown.to] as [typeof shown.from, typeof shown.to]) : undefined
  // How the game ended, on the kings, once it's over and the final position is on the board.
  const ends = game.outcome && viewPly === null ? endMarks(shown.fen, { result: game.outcome.result, termination: game.outcome.reason }) : undefined
  const canTakeBack = !game.outcome && takebackPlies(game.moves.length, game.color, turnOf(game.startFen)) > 0
  // Until both sides have moved, the game can be called off instead: not saved, not counted.
  const canAbort = !game.outcome && game.moves.length < 2

  // The opening the moves on show have reached: it stays named once the game leaves the book.
  const opening = useMemo(() => (book ? openingOf(book, line.slice(0, shownPly + 1)) : undefined), [book, line, shownPly])
  const openingText = shownPly === 0 ? 'Starting position' : opening ? opening.name : '\u00a0'

  const headers = playHeaders({ ...meta(game), date: new Date(game.startedAt) })

  return (
    <main className="play-layout play-game">
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
      {focused && (
        <>
          <button className="icon-btn play-focus-close" onClick={toggleFocus} aria-label="Leave focus" title="Leave focus (Esc)">
            <ToolIcon name="abort" />
          </button>
          {/* Focus: the players and their clocks stand beside the board, which takes the window's height. */}
          <aside className="play-players">
            {bar(other(orientation))}
            {bar(orientation)}
          </aside>
        </>
      )}
      <section className="play-board">
        {!focused && bar(other(orientation))}
        <Board
          fen={shown.fen}
          orientation={orientation}
          lastMove={lastMove}
          shapes={shapes}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={onMove}
          // With premoves off, the board waits for your turn.
          locked={Boolean(game.outcome) || viewPly !== null || (!settings.premoves && !yourTurn)}
          premove={settings.premoves ? game.color : undefined}
          autoQueen={settings.autoQueen}
          ends={ends}
        />
        {!focused && bar(orientation)}
      </section>

      <aside className="panel play-panel">
        <div className="panel-card">
          <header className="play-panel-head">
            <div className="play-panel-title">
              <strong className={`play-status ${game.outcome ? 'over' : ''}`} role="status">
                {game.outcome ? outcomeText(game.outcome, game.color) : notice ?? (yourTurn ? 'Your move' : thinking || !engine ? 'Rookahead is thinking…' : 'Rookahead to move')}
              </strong>
              <span className="play-opening muted" title={opening ? `${opening.eco} ${opening.name}` : undefined}>
                {openingText}
              </span>
            </div>
            {!phone && gear}
          </header>
          <div className="panel-body">
            {phone ? (
              <MoveStrip tree={tree} currentId={shown.id} onSelect={(id) => showPly(line.findIndex((n) => n.id === id))} />
            ) : (
              <MoveList tree={tree} currentId={shown.id} onSelect={(id) => showPly(line.findIndex((n) => n.id === id))} report={null} times={spent} emptyText="Your moves and the computer’s appear here." />
            )}
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
          </nav>
          {game.outcome ? (
            <ResultCard game={game} onReview={onReview} onRematch={onRematch} onNewGame={onNewGame} />
          ) : (
            <div className="play-actions play-tools">
              <button className="ctrl" onClick={takeback} disabled={!canTakeBack} aria-label="Takeback" title="Takeback">
                <ToolIcon name="takeback" />
                {game.takebacks > 0 && <span className="play-tool-count">{game.takebacks}</span>}
              </button>
              <button className="ctrl" onClick={() => void showHint()} disabled={!yourTurn || !engine} aria-label="Hint" title="Hint">
                <ToolIcon name="hint" />
                {game.hints > 0 && <span className="play-tool-count">{game.hints}</span>}
              </button>
              <button className="ctrl" onClick={() => void offerDraw()} disabled={!engine || !yourTurn} aria-label="Offer draw" title="Offer draw">
                <span className="play-tool-half" aria-hidden>
                  ½
                </span>
              </button>
              {canAbort ? (
                <button className="ctrl" onClick={() => setConfirming('abort')} aria-label="Abort" title="Abort: call the game off, it isn't saved or counted">
                  <ToolIcon name="abort" />
                </button>
              ) : (
                <button className="ctrl" onClick={() => setConfirming('resign')} aria-label="Resign" title="Resign">
                  <ToolIcon name="resign" />
                </button>
              )}
            </div>
          )}
          {/* The view's actions, quiet at the foot, as on Chess.com: Share and Focus on the left, Sound and Flip on the right. */}
          <div className="panel-strip">
            <button className="icon-btn" onClick={onShare} disabled={game.moves.length === 0} aria-label="Share game" title="Share game">
              <ShareIcon />
            </button>
            {!phone && (
              <button className={`icon-btn ${focus ? 'active' : ''}`} onClick={toggleFocus} aria-pressed={focus} aria-label="Focus" title={focus ? 'Leave focus (Esc)' : 'Focus: a bigger board, nothing else around it'}>
                <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
                  <path d={focus ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} />
                </svg>
              </button>
            )}
            <button className="icon-btn panel-strip-end" onClick={onToggleSound} aria-label={muted ? 'Sounds on' : 'Sounds off'} title={muted ? 'Sounds on' : 'Sounds off'}>
              <SoundIcon muted={muted} />
            </button>
            <button className="icon-btn" onClick={() => setFlipped((f) => !f)} aria-label="Flip board" title="Flip board (F)">
              <FlipIcon />
            </button>
          </div>
        </div>
      </aside>
    </main>
  )
}

const FOCUS_KEY = 'rookahead.playFocus'

function readFocus(): boolean {
  try {
    return localStorage.getItem(FOCUS_KEY) === '1'
  } catch {
    return false
  }
}

function writeFocus(on: boolean) {
  try {
    if (on) localStorage.setItem(FOCUS_KEY, '1')
    else localStorage.removeItem(FOCUS_KEY)
  } catch {
    // Storage unavailable: not remembered.
  }
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
