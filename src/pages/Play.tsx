import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess, DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../components/Board'
import { BoardOptions } from '../components/BoardOptions'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MoveList } from '../components/MoveList'
import { MoveStrip } from '../components/MoveStrip'
import { FlipIcon, NavIcon, ShareIcon, SoundIcon } from '../components/NavIcons'
import { PageHeader } from '../components/PageHeader'
import { PlayerBar } from '../components/PlayerBar'
import { ROOK_PATH } from '../components/RookCoach'
import { ToolIcon } from '../components/PlayToolIcon'
import { ROOK } from '../components/RookLogo'
import { SettingsDialog } from '../components/SettingsDialog'
import { Sheet } from '../components/Sheet'
import { ShareDialog } from '../components/ShareDialog'
import { HomePlay } from '../components/HomePlay'
import { TILE_ICONS } from '../components/IconTile'
import { Link } from '../components/Link'
import { AvatarFace, Gear } from '../components/UserCard'
import type { AnalysisResult } from '../engine/Engine'
import { useEngine } from '../hooks/useEngine'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMoveSounds } from '../hooks/useMoveSounds'
import { useLowTimeNudge } from '../hooks/useLowTime'
import { endMarks } from '../lib/gameEnd'
import { bookMove, candidates, decide, isComplete, pickLapse, soundMove } from '../lib/botMove'
import { CLOCK_GROUPS, clockLabel, flagged, lowTimeMs, pause, press, remaining, resume, startClock, type ClockSetting } from '../lib/clock'
import { winPercent, type Color } from '../lib/evaluation'
import { saveGame } from '../lib/games'
import { useMyGames } from '../hooks/useMyGames'
import { useImmersive } from '../lib/immersive'
import { ALL_MOVES, LEVELS, levelInfo, searchLimits } from '../lib/levels'
import { materialState } from '../lib/material'
import { loadOpeningBook, openingOf, type OpeningBook } from '../lib/openings'
import { acceptsDraw, DRAW_AFTER_PLIES, outcomeOf, playHeaders, playPgn, takebackPlies, type Outcome } from '../lib/playGame'
import { clearLiveGame, loadLiveGame, loadSetup, saveLiveGame, saveSetup, takePracticeAsk, type LiveGame, type PlaySetup, type PracticeAsk } from '../lib/playStore'
import { canPlay, connectLichess, useLichess } from '../lib/lichessAuth'
import {
  acceptChallenge,
  challengeFriend,
  declineChallenge,
  loadLiveOnline,
  ONLINE_CLOCKS,
  saveLiveOnline,
  seek,
  watchEvents,
  type IncomingChallenge,
  type OnlineClock,
  type Side,
  type StartedGame,
} from '../lib/lichessPlay'
import { useFriends } from '../lib/friends'
import { loadOnlineSetup, saveOnlineSetup, takeSeekAsk, type OnlineSetup } from '../lib/onlineSetup'
import { navigate, onReselect, playView, usePathname, type PlayView } from '../lib/router'
import { encodeShare, toSharedGame } from '../lib/share'
import { writeSession } from '../lib/session'
import { useAccount } from '../lib/account'
import { logUse } from '../lib/usage'
import { DEFAULT_SETTINGS, type Settings } from '../lib/settings'
import { playSound } from '../lib/sound'
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

/** How long a new game's face-to-face lasts, ms (index.css times its parts to it; the online game's is the same). */
const INTRO_MS = 1900

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
  // A game started here (not one a reload came back to) opens with the two players face to face, like an online one.
  const [freshGame, setFreshGame] = useState<string | null>(null)
  // Online: the game you're playing on Lichess (kept, so a reload goes back to it), and the search for one.
  const [onlineSetup, setOnlineSetup] = useState<OnlineSetup>(loadOnlineSetup)
  const [online, setOnline] = useState<StartedGame | null>(loadLiveOnline)
  // The online game that has ended: it stays on the board until you leave, then Play is the setup again.
  const [overId, setOverId] = useState<string | null>(null)
  const onlineOver = Boolean(online && online.id === overId)
  const markOver = useCallback(() => setOverId(online?.id ?? null), [online?.id])
  const [searching, setSearching] = useState<{ since: number; ctrl: AbortController; friend?: string } | null>(null)
  const [onlineNote, setOnlineNote] = useState<string | null>(null)
  // Phones play full screen: no tab bar while a game is on the board.
  const phone = useMediaQuery('(max-width: 1000px)')
  useImmersive(active && phone && Boolean(game || online))
  useEffect(() => () => searching?.ctrl.abort(), [searching])

  // A rematch started from the game's end: the next game takes its place.
  // A game that starts here (not one a reload came back to) opens with the two players face to face.
  const [freshId, setFreshId] = useState<string | null>(null)
  const startOnline = useCallback((g: StartedGame) => {
    saveLiveOnline(g)
    setFreshId(g.id)
    setOnline(g)
  }, [])

  const findOpponent = async (s: OnlineSetup) => {
    saveOnlineSetup(s)
    setOnlineNote(null)
    const ctrl = new AbortController()
    const since = Date.now()
    setSearching({ since, ctrl })
    const found = await seek(s.clock, s.rated, ctrl.signal)
    setSearching((was) => (was?.ctrl === ctrl ? null : was))
    if (found === 'refused') setOnlineNote(`Lichess turned the search down. ${TIMED_OUT} Otherwise check lichess.org for a game already open there.`)
    else if (found) startOnline(found)
    // A search Lichess ends almost at once (a real one runs until someone joins) is usually a time-out.
    else if (!ctrl.signal.aborted) setOnlineNote(Date.now() - since < QUICK_END_MS ? `Lichess ended the search straight away. ${TIMED_OUT}` : 'No opponent turned up. Try again, or pick another time control.')
  }
  // A friend, by their Lichess username: the challenge stays open until they answer (or you call it off).
  const challengeOne = async (s: OnlineSetup) => {
    const friend = s.friend.trim()
    if (!friend) return
    saveOnlineSetup(s)
    setOnlineNote(null)
    const ctrl = new AbortController()
    setSearching({ since: Date.now(), ctrl, friend })
    const found = await challengeFriend(friend, s.clock, s.rated, s.color, ctrl.signal)
    setSearching((was) => (was?.ctrl === ctrl ? null : was))
    if (found === 'declined') setOnlineNote(`${friend} declined the challenge.`)
    else if (found === 'failed') setOnlineNote(`Lichess didn’t send it. Check the username, and that ${friend} takes challenges.`)
    else if (found) startOnline(found)
  }
  // Which part of Play is showing: its front (the ways to play) or one way's setup.
  const pathname = usePathname()
  const view = playView(pathname)
  // The next game from a finished one (its New button or New game tab): the finished game goes, and the search
  // runs on Play online's board, the opponent's place showing it. From another part of Play it goes there first.
  const [seekNext, setSeekNext] = useState(false)
  const searchAgain = () => {
    saveLiveOnline(null)
    setOnline(null)
    if (view === 'online' || (phone && view === 'hub')) void findOpponent(onlineSetup)
    else {
      setSeekNext(true)
      navigate('/play/online')
    }
  }
  useEffect(() => {
    if (!seekNext || view !== 'online' || online) return
    setSeekNext(false)
    void findOpponent(onlineSetup)
  })
  // Home's Play button: it saved the time it was pressed at, and the search starts here as Play shows (before the
  // first paint, so the choices never flash by on the way to it).
  useLayoutEffect(() => {
    if (!active || view !== 'online' || !takeSeekAsk()) return
    const asked = loadOnlineSetup()
    setOnlineSetup(asked)
    if (!online && !game && !searching) void findOpponent(asked)
  })
  // Moving between them after a game has ended: the game is saved, so the setup comes back.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (game?.outcome) setGame(null)
    if (onlineOver) setOnline(null)
    // A search (or a challenge) belongs to the setup it was started from.
    searching?.ctrl.abort()
    setOnlineNote(null)
  }
  // Left the page after the game ended: it's saved in My recent games, so come back to a new setup.
  if (!active && game?.outcome) setGame(null)
  // An online game that ended is on Lichess (and in My games), so it goes the same way.
  if (!active && onlineOver) setOnline(null)
  // Clicking Play again after the game ended does the same.
  useEffect(() => onReselect((path) => path === '/play' && setGame((g) => (g?.outcome ? null : g))), [])
  useEffect(() => onReselect((path) => path === '/play' && onlineOver && setOnline(null)), [onlineOver])

  /** A new game; `from` a position (Play it out) it's practice: no clock, no intro, not saved or counted. */
  const start = (s: PlaySetup, from?: PracticeAsk) => {
    if (!from) saveSetup(s)
    const color: Color = from?.color ?? (s.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : s.color)
    const startFen = from?.fen ?? DEFAULT_POSITION
    const played: PlaySetup = from ? { ...s, color, clock: 'none' } : s
    const now = Date.now()
    const id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    setFreshGame(from ? null : id)
    setGame({
      id,
      startFen,
      color,
      setup: played,
      moves: [],
      // The clocks start once the players' face-to-face has cleared.
      clock: startClock(played.clock, now + INTRO_MS, turnOf(startFen)),
      takebacks: 0,
      hints: 0,
      outcome: null,
      startedAt: now,
      saved: false,
      practice: from ? { from: from.from } : undefined,
    })
  }
  // Play it out: a position handed over from a puzzle or a board starts as Play shows (before the first paint).
  useLayoutEffect(() => {
    if (!active || view !== 'computer') return
    const ask = takePracticeAsk()
    if (!ask) return
    if (online) {
      saveLiveOnline(null)
      setOnline(null)
    }
    start(setup, ask)
  })

  return (
    <div className="play-page">
      <PageHeader
        // Desktop has the page's heading and actions in the panel, so the board gets the height.
        phoneOnly
        title="Play"
        back={game?.practice ? game.practice.from : game || online ? '/' : view !== 'hub' ? '/play' : undefined}
        phoneTitle={online ? 'Online' : game ? `${game.practice ? 'Practice · ' : ''}Level ${game.setup.level} · ${levelInfo(game.setup.level).rating}` : view !== 'hub' ? WAY_TITLES[view] : undefined}
        phoneSub={online ? `On Lichess · you play ${online.color}` : game ? `${clockLabel(game.setup.clock)} · you play ${game.color}` : undefined}
      >
        {phone && gear}
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
          fresh={online.id === freshId}
          settings={settings}
          phone={phone}
          active={active}
          gear={gear}
          onToggleSound={() => updateSettings({ soundVolume: settings.soundVolume === 0 ? DEFAULT_SETTINGS.soundVolume : 0 })}
          onReview={(pgn, color) => {
            writeSession({ pgn, orientation: color, currentPly: 0, evals: {}, review: true, from: '/play/online' })
            onOpenAnalysis()
          }}
          onAgain={searchAgain}
          engine={ready ? engine : null}
          engineStatus={status}
          nextClock={onlineSetup.clock}
          newGame={
            <NewOnlineGame setup={onlineSetup} onChange={setOnlineSetup} onFind={searchAgain} playing={!onlineOver} />
          }
          onStarted={startOnline}
          onOver={markOver}
          onDone={() => {
            saveLiveOnline(null)
            setOnline(null)
          }}
        />
      ) : game ? (
        <GameView
          key={game.id}
          fresh={game.id === freshGame}
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
          onRematch={() => start(game.setup, game.practice ? { fen: game.startFen, color: game.color, from: game.practice.from } : undefined)}
          onNewGame={() => {
            clearLiveGame()
            setGame(null)
          }}
          onReview={() => {
            writeSession({ pgn: playPgn(game.moves, { ...meta(game), date: new Date(game.startedAt) }, game.clocks), orientation: game.color, currentPly: 0, evals: {}, review: true, from: '/play/computer' })
            onOpenAnalysis()
          }}
        />
      ) : (
        <SetupView
          setup={setup}
          onChange={setSetup}
          onStart={() => start(setup)}
          gear={gear}
          view={view}
          online={onlineSetup}
          onOnline={setOnlineSetup}
          searching={searching?.since ?? null}
          waitingFor={searching?.friend ?? null}
          note={onlineNote}
          onFind={() => void (view === 'friend' ? challengeOne(onlineSetup) : findOpponent(onlineSetup))}
          onCancel={() => searching?.ctrl.abort()}
          onStarted={startOnline}
          settings={settings}
          phone={phone}
          active={active}
        />
      )}
    </div>
  )
}

const meta = (g: LiveGame) => ({ color: g.color, level: g.setup.level, clock: g.setup.clock, outcome: g.outcome, startFen: g.startFen })

/** The time controls on offer, in their speed groups: what's kept (`value`) and what's shown ("10+5"). */
interface ClockGroup {
  name: string
  clocks: { value: string; label: string }[]
}

const COMPUTER_CLOCKS: ClockGroup[] = CLOCK_GROUPS.map((g) => ({ name: g.name, clocks: g.settings.map((value) => ({ value, label: clockLabel(value) })) }))
const ONLINE_CLOCK_GROUPS: ClockGroup[] = ONLINE_CLOCKS.map((g) => ({ name: g.group, clocks: g.clocks.map((value) => ({ value, label: value })) }))

// A setup's title: a new game, online or against the computer (the icon beside it says which); a friend's is its own.
const WAY_TITLES: Record<Exclude<PlayView, 'hub'>, string> = { online: 'New game', computer: 'New game', friend: 'Play a friend' }

/**
 * Before a game: on desktop the board as it will start, and beside it Play's front (the ways to play) or the setup
 * for one of them. A phone has the same front and setups, without the board.
 */
function SetupView({
  view,
  setup,
  onChange,
  onStart,
  gear,
  online,
  onOnline,
  searching,
  waitingFor,
  note,
  onFind,
  onCancel,
  onStarted,
  settings,
  phone,
  active,
}: {
  view: PlayView
  setup: PlaySetup
  onChange: (s: PlaySetup) => void
  onStart: () => void
  gear: ReactNode
  online: OnlineSetup
  onOnline: (s: OnlineSetup) => void
  /** When the search for an opponent (or the wait for a friend) began, while it runs. */
  searching: number | null
  /** The friend a challenge is waiting on. */
  waitingFor: string | null
  note: string | null
  /** Find an opponent, or challenge the friend, as the view says. */
  onFind: () => void
  onCancel: () => void
  /** A game of yours started from a challenge you accepted here. */
  onStarted: (g: StartedGame) => void
  settings: Settings
  phone: boolean
  active: boolean
}) {
  const { link, busy, error } = useLichess()
  // Your games, for your Lichess rating on the front's Play card (kept from Home, not fetched again).
  const { games } = useMyGames({ chesscom: settings.chesscomUser, lichess: settings.lichessUser }, active && view === 'hub')
  const { account, username } = useAccount()
  const { friends } = useFriends()
  // A tall desktop lists every time. A phone shows the one picked and opens the rest as a page of their own; a
  // window too short for the list opens them in a small dialog.
  const compact = useMediaQuery('(max-height: 859px)') || phone
  const [picking, setPicking] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (searching == null) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [searching])

  const linked = Boolean(link && canPlay(link))
  // Challenges to you, from friends (on Rookahead or lichess.org), while Play is showing: accept one and its game starts here.
  const [incoming, setIncoming] = useState<IncomingChallenge[]>([])
  const accepted = useRef<string | null>(null)
  const [answering, setAnswering] = useState(false)
  useEffect(() => {
    if (!active || !linked || searching != null) return
    const ctrl = new AbortController()
    void watchEvents(
      {
        onGameStart: (g) => g.id === accepted.current && onStarted(g),
        onChallenge: (c) => !c.rematchOf && setIncoming((list) => (list.some((x) => x.id === c.id) ? list : [...list, c])),
        onChallengeGone: (id) => setIncoming((list) => list.filter((x) => x.id !== id)),
      },
      ctrl.signal,
    ).catch(() => {})
    return () => {
      ctrl.abort()
      setIncoming([])
    }
  }, [active, linked, searching, onStarted])
  const challenger = incoming[0]
  const answer = async (yes: boolean) => {
    if (!challenger) return
    setAnswering(true)
    if (yes) accepted.current = challenger.id
    const ok = yes ? await acceptChallenge(challenger.id) : await declineChallenge(challenger.id)
    setAnswering(false)
    if (ok || !yes) setIncoming((list) => list.filter((x) => x.id !== challenger.id))
  }

  const isComputer = view === 'computer'
  const onlineSetupShown = !isComputer && view !== 'hub'
  const isFriend = view === 'friend'
  const level = levelInfo(setup.level)
  const side = isComputer ? setup.color : isFriend ? online.color : 'random'
  const orientation: Color = side === 'black' ? 'black' : 'white'
  const groups = isComputer ? COMPUTER_CLOCKS : ONLINE_CLOCK_GROUPS
  const clock: string = isComputer ? setup.clock : online.clock
  const chosen = groups.flatMap((g) => g.clocks.map((c) => ({ ...c, group: g.name }))).find((c) => c.value === clock)
  // Both clocks start on the time picked: online times are minutes, the computer's are seconds.
  const seconds = view === 'hub' || clock === 'none' ? null : Number(clock.split('+')[0]) * (isComputer ? 1 : 60)
  const face = seconds == null ? undefined : <span className="player-clock">{formatClockFace(seconds)}</span>
  const pick = (value: string) => {
    if (isComputer) onChange({ ...setup, clock: value as ClockSetting })
    else onOnline({ ...online, clock: value as OnlineClock })
    setPicking(false)
  }
  const busyNow = searching != null
  const picker = <ClockPicker groups={groups} value={clock} onPick={pick} untimed={isComputer} disabled={busyNow} />
  const waited = searching == null ? 0 : Math.floor((now - searching) / 1000)
  const onlineRule = 'Lichess lets apps like Rookahead play rapid and classical only.'
  const timeRule = isComputer ? 'Minutes each + seconds added a move.' : `Minutes each + seconds added a move. ${onlineRule}`
  const friendName = online.friend.trim()
  const lichessFriends = friends.filter((f) => f.status === 'accepted' && f.lichess)

  const opponentName = isComputer
    ? `Coach · Level ${level.level}`
    : isFriend
      ? friendName || 'Your friend'
      : view === 'online'
        ? busyNow
          ? 'Looking for an opponent…'
          : 'Your opponent'
        : 'Opponent'
  const opponent = (
    <PlayerBar
      color={other(orientation)}
      name={opponentName}
      rating={isComputer ? String(level.rating) : undefined}
      avatar={
        isComputer ? (
          <svg className="player-avatar-mark" viewBox="0 0 24 24" fill="currentColor">
            <path d={ROOK} />
          </svg>
        ) : isFriend && friendName ? undefined : busyNow ? (
          <SearchingRook />
        ) : (
          '?'
        )
      }
      captured={[]}
      advantage={0}
      clock={face}
    />
  )
  const lichessYou = !isComputer && view !== 'hub' && link
  const you = (
    <PlayerBar
      color={orientation}
      name={lichessYou ? link.username : (username ?? 'You')}
      avatar={username && !lichessYou ? <AvatarFace account={account} /> : undefined}
      captured={[]}
      advantage={0}
      clock={face}
    />
  )

  const colourField = (value: Side | 'random', onPick: (c: Side | 'random') => void) => (
    <div className="setup-field">
      <h3 className="setup-label" id="colour-label">
        You play
      </h3>
      <div className="setup-tiles colour-tiles" role="radiogroup" aria-labelledby="colour-label">
        {(['white', 'random', 'black'] as const).map((c) => (
          <button key={c} role="radio" aria-checked={value === c} className={`setup-tile ${value === c ? 'active' : ''}`} disabled={busyNow} onClick={() => onPick(c)}>
            {c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}
          </button>
        ))}
      </div>
    </div>
  )
  const timeField = compact ? (
    <div className="setup-field">
      <h3 className="setup-label">Time</h3>
      <button className="setup-time" aria-haspopup="dialog" disabled={busyNow} onClick={() => setPicking(true)}>
        <strong>{chosen?.label ?? 'Untimed'}</strong>
        <span>{chosen?.group ?? 'No clock'}</span>
        <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  ) : (
    <>
      {picker}
      {!isComputer && <p className="setup-rule muted">{onlineRule}</p>}
    </>
  )
  const ratedField = (
    <label className="online-rated">
      <span>Rated</span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={online.rated} disabled={busyNow} onChange={() => onOnline({ ...online, rated: !online.rated })} />
        <span className="switch-track" />
      </span>
    </label>
  )
  // A challenge to you, at the top of whatever's showing.
  const challengeCard = challenger && (
    <div className="setup-challenge" role="status">
      <p>
        <span>
          <strong>{challenger.from}</strong> challenges you
        </span>
        {challenger.playable ? (
          <span className="muted">{[challenger.clock ?? 'No clock', challenger.rated ? 'Rated' : 'Casual'].join(' · ')}</span>
        ) : (
          <span className="muted">To a game Rookahead can’t play here. {onlineRule}</span>
        )}
      </p>
      <div className="setup-challenge-actions">
        {challenger.playable ? (
          <button className="btn accent-btn small" disabled={answering} onClick={() => void answer(true)}>
            Accept
          </button>
        ) : (
          <a className="btn ghost small" href={`https://lichess.org/${challenger.id}`} target="_blank" rel="noreferrer">
            Open on Lichess
          </a>
        )}
        <button className="btn ghost small" disabled={answering} onClick={() => void answer(false)}>
          Decline
        </button>
      </div>
    </div>
  )

  const needsLichess = onlineSetupShown && !linked
  // Play's front, on a phone as on a computer: an online game at the time you last picked, one press away (Home's own
  // card), then the coach and a friend.
  const front = <HomePlay active={active} games={games} tiles={['coach', 'friend']} />
  // While it looks (or waits on a friend) the choices are gone: the panel is the search, what it's for and how long
  // it has run. They come back when it ends.
  const searchFor = [chosen?.group, online.rated ? 'Rated' : 'Casual', isFriend && online.color !== 'random' ? `You play ${online.color === 'white' ? 'White' : 'Black'}` : null].filter(Boolean).join(' · ')
  const search = (
    <div className="setup-search">
      <span className="player-avatar setup-search-rook" aria-hidden>
        <SearchingRook />
      </span>
      <div className="setup-search-lines" role="status">
        <h3>{waitingFor ? `Waiting for ${waitingFor}` : `Looking for a ${online.clock} game`}</h3>
        <p className="muted">{waitingFor ? `${online.clock} · ${searchFor}` : searchFor}</p>
      </div>
      <span className="setup-search-time" role="timer" aria-label="Time waited">
        {Math.floor(waited / 60)}:{String(waited % 60).padStart(2, '0')}
      </span>
      <p className="setup-search-note muted">
        {waitingFor ? `The game starts when ${waitingFor} accepts, on Lichess or on Rookahead.` : `A real player near your rating, on Lichess as ${link?.username}.`}
      </p>
    </div>
  )
  const body =
    busyNow ? (
      search
    ) : view === 'hub' ? (
      front
    ) : needsLichess ? (
      <p className="muted">
        {link
          ? 'One more step: allow Rookahead to play games for your Lichess account. It’s one tap on Lichess.'
          : isFriend
            ? 'Games with friends are played on Lichess, through your account. Your friend needs a Lichess account too.'
            : 'Real players, through your Lichess account. Rated games count for your Lichess rating, the one on your profile.'}
      </p>
    ) : isComputer ? (
      <>
        <div className="setup-field">
          <div className="setup-readout">
            <h3 className="setup-label" id="level-label">
              Level
            </h3>
            <span>Strength {level.rating}</span>
          </div>
          <div className="setup-tiles level-tiles" role="radiogroup" aria-labelledby="level-label">
            {LEVELS.map((l) => (
              <button
                key={l.level}
                role="radio"
                aria-checked={l.level === setup.level}
                aria-label={`Level ${l.level}, strength ${l.rating}`}
                className={`setup-tile ${l.level === setup.level ? 'active' : ''}`}
                onClick={() => onChange({ ...setup, level: l.level })}
              >
                {l.level}
              </button>
            ))}
          </div>
        </div>
        {colourField(setup.color, (c) => onChange({ ...setup, color: c }))}
        {timeField}
      </>
    ) : isFriend ? (
      <>
        <div className="setup-field">
          <label className="setup-label" htmlFor="friend-name">
            Their Lichess username
          </label>
          <input
            id="friend-name"
            className="setup-input"
            value={online.friend}
            placeholder="Username"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={busyNow}
            onChange={(e) => onOnline({ ...online, friend: e.target.value.replace(/\s/g, '') })}
          />
          {lichessFriends.length > 0 && (
            <div className="friend-picks" aria-label="Your friends on Lichess">
              {lichessFriends.map((f) => (
                <button
                  key={f.id}
                  className={`setup-tile friend-pick ${friendName.toLowerCase() === f.lichess!.toLowerCase() ? 'active' : ''}`}
                  disabled={busyNow}
                  onClick={() => onOnline({ ...online, friend: f.lichess! })}
                >
                  {f.username}
                </button>
              ))}
            </div>
          )}
        </div>
        {colourField(online.color, (c) => onOnline({ ...online, color: c }))}
        {timeField}
        {ratedField}
      </>
    ) : (
      <>
        <p className="muted">
          Real players on Lichess, as <b>{link?.username}</b>. No engine while you play: that’s Lichess’s rule.
        </p>
        {timeField}
        {ratedField}
      </>
    )

  const foot =
    view === 'hub' ? null : isComputer ? (
      <>
        <p className="muted">Takebacks and hints allowed. Saved to My recent games.</p>
        <button className="btn accent-btn" onClick={onStart}>
          Start game
        </button>
      </>
    ) : needsLichess ? (
      <>
        <button className="btn accent-btn" disabled={busy} onClick={() => void connectLichess()}>
          {busy ? 'Connecting…' : link ? 'Allow on Lichess' : 'Connect Lichess'}
        </button>
        {error && <p className="form-error">{error}</p>}
      </>
    ) : (
      <>
        {busyNow ? (
          // The panel above is the search: here there's only the way out.
          <button className="btn ghost" onClick={onCancel}>
            {waitingFor ? `Cancel the challenge to ${waitingFor}` : 'Cancel search'}
          </button>
        ) : (
          <button className="btn accent-btn" disabled={isFriend && !friendName} onClick={onFind}>
            {isFriend ? 'Send challenge' : 'Find an opponent'}
          </button>
        )}
        {note && <p className="form-error">{note}</p>}
      </>
    )

  return (
    <main className={`play-layout play-new ${view === 'hub' ? 'play-hub' : ''}`}>
      {/* A phone has no room for both: the choices come first, all on one screen, and the board arrives with the game. */}
      {!phone && (
        <section className="play-board">
          {opponent}
          <Board fen={DEFAULT_POSITION} orientation={orientation} shapes={NO_SHAPES} theme={settings.boardTheme} coordinates={settings.coordinates} onMove={noMove} viewOnly />
          {you}
        </section>
      )}

      <aside className="panel play-panel">
        <div className="panel-card setup-panel">
          {phone && picking ? (
            <div className="setup-body setup-pick">
              <div className="setup-head setup-back">
                <button className="icon-btn" onClick={() => setPicking(false)} aria-label="Back">
                  <NavIcon name="back" />
                </button>
                <h2>Time</h2>
              </div>
              <p className="muted">{timeRule}</p>
              {picker}
              {!isComputer && ratedField}
            </div>
          ) : (
            // The card stays put while what's in it slides across between Play's front and a setup (index.css).
            <div className="setup-slide">
              {/* Desktop: the panel's title in the middle of its top, like the review's and Puzzles', Back on its left. */}
              {!phone && (
                <div className="panel-top">
                  <div className="panel-top-side">
                    {view !== 'hub' && (
                      <Link to="/play" className="icon-btn" aria-label="Back to the ways to play" title="Back to the ways to play">
                        <NavIcon name="back" />
                      </Link>
                    )}
                  </div>
                  <h2 className="panel-title" id="setup-title">
                    <svg className="line-icon panel-title-icon" viewBox="0 0 24 24" aria-hidden>
                      <path d={TILE_ICONS[view === 'hub' ? 'play' : view]} />
                    </svg>
                    {view === 'hub' ? 'Play' : WAY_TITLES[view]}
                  </h2>
                  <div className="panel-top-side end">{gear}</div>
                </div>
              )}
              <div className="setup-body">
                {challengeCard}
                {body}
              </div>
              {foot && <div className="setup-foot">{foot}</div>}
            </div>
          )}
        </div>
      </aside>

      {picking && !phone && (
        <Sheet title="Time" sub={timeRule} onClose={() => setPicking(false)}>
          {picker}
        </Sheet>
      )}
    </main>
  )
}

const NO_SHAPES: DrawShape[] = []
const noMove = () => {}

/** The time controls, a section a speed (Bullet, Blitz, Rapid, Classical), and no clock at all against the computer. */
/**
 * The next online game's setup, in the New game tab beside the game: its time and Rated. Its search waits for the
 * game on the board to end, then runs on Play online's board like any other.
 */
function NewOnlineGame({ setup, onChange, onFind, playing }: { setup: OnlineSetup; onChange: (s: OnlineSetup) => void; onFind: () => void; playing: boolean }) {
  return (
    <>
      <div className="setup-body">
        <ClockPicker groups={ONLINE_CLOCK_GROUPS} value={setup.clock} onPick={(v) => onChange({ ...setup, clock: v as OnlineClock })} untimed={false} disabled={false} />
        <p className="setup-rule muted">Lichess lets apps like Rookahead play rapid and classical only.</p>
        <label className="online-rated">
          <span>Rated</span>
          <span className="switch">
            <input type="checkbox" role="switch" checked={setup.rated} onChange={() => onChange({ ...setup, rated: !setup.rated })} />
            <span className="switch-track" />
          </span>
        </label>
      </div>
      <div className="setup-foot">
        {playing && <p className="muted">Finish the game on the board first.</p>}
        <button className="btn accent-btn" disabled={playing} onClick={onFind}>
          Find an opponent
        </button>
      </div>
    </>
  )
}

/** A search that Lichess ends sooner than this, ms, with no game, was ended by Lichess (often a time-out). */
const QUICK_END_MS = 8000
const TIMED_OUT = 'If you’ve aborted several games lately, Lichess times you out from playing for a few minutes: lichess.org shows how long.'

/** The opponent's picture while the search runs: the Rookahead rook, looking left and right for someone to play. */
function SearchingRook() {
  return (
    // Its head and shoulders, peeking up from the tile's foot, so the eyes read at an avatar's size.
    <svg className="searching-rook" viewBox="10 2 100 100" aria-hidden>
      <path className="searching-rook-body" d={ROOK_PATH} />
      <g className="searching-rook-eyes">
        <ellipse cx="47" cy="60" rx="7" ry="9" />
        <ellipse cx="73" cy="60" rx="7" ry="9" />
      </g>
    </svg>
  )
}

function ClockPicker({ groups, value, onPick, untimed, disabled }: { groups: ClockGroup[]; value: string; onPick: (value: string) => void; untimed: boolean; disabled: boolean }) {
  const tile = (v: string, label: string) => (
    <button key={v} role="radio" aria-checked={value === v} className={`setup-tile ${value === v ? 'active' : ''}`} disabled={disabled} onClick={() => onPick(v)}>
      {label}
    </button>
  )
  return (
    <div className="clock-groups" role="radiogroup" aria-label="Time">
      {groups.map((g) => (
        <div key={g.name} className="setup-field">
          <h3 className="setup-label">{g.name}</h3>
          <div className="setup-tiles clock-tiles">{g.clocks.map((c) => tile(c.value, c.label))}</div>
        </div>
      ))}
      {untimed && (
        <div className="setup-field">
          <h3 className="setup-label">No clock</h3>
          <div className="setup-tiles untimed-tile">{tile('none', 'Untimed')}</div>
        </div>
      )}
    </div>
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
  /** Just started here: the players meet over the board first. */
  fresh: boolean
}

function GameView({ game, setGame, engine, settings, onRematch, onNewGame, onReview, active, gear, sharing, onShare, onToggleSound, onCloseShare, phone, fresh }: GameViewProps) {
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

  // A new game opens with you and the computer face to face over the board, with the start clank, as online games do.
  // The computer waits for it to clear before its first move (the clocks start then too, see start()).
  const [intro, setIntro] = useState(fresh)
  const introShown = intro && game.moves.length === 0 && !game.outcome
  useEffect(() => {
    if (!introShown) return
    playSound('start', settings.soundVolume)
    const t = setTimeout(() => setIntro(false), INTRO_MS)
    return () => clearTimeout(t)
    // Only the intro starting plays it, not a change of volume during it.
  }, [introShown])

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
    // Practice from a position isn't a game of yours: nothing saved or counted.
    if (game.outcome && !savedGame.current && game.practice) savedGame.current = true
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
    if (!engine || game.outcome || turn === game.color || introShown) return
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
  }, [engine, node.fen, turn, game.color, game.outcome, game.moves.length, level, book, play, introShown])

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
    else decline('The coach declines the draw.')
  }

  const onMove = (move: { from: string; to: string; promotion?: string }) => {
    if (!yourTurn) return
    const uci = move.from + move.to + (move.promotion ?? '')
    if (!new Chess(node.fen).moves({ verbose: true }).some((m) => m.lan === uci)) return
    setHint(null)
    play(uci)
  }

  const shapes: DrawShape[] = hint && hint.ply === game.moves.length && viewPly === null ? [{ orig: hint.uci.slice(0, 2) as Key, dest: hint.uci.slice(2, 4) as Key, brush: 'suggest' }] : []
  // The end gets its own sound, whatever ended it (a resignation or a flag too), once, as it happens.
  useMoveSounds(tree, shown, settings.soundVolume, false)
  const hadOutcome = useRef(Boolean(game.outcome))
  useEffect(() => {
    if (game.outcome && !hadOutcome.current) playSound('gameover', settings.soundVolume)
    hadOutcome.current = Boolean(game.outcome)
    // Only the outcome arriving plays it.
  }, [game.outcome])

  const material = materialState(shown.fen)
  const computerName = `Coach · Level ${level.level}`
  // You: your username and photo once signed in (else "You" and its initial); the computer: the Rookahead rook.
  const { account, username } = useAccount()
  const yourName = username ?? 'You'
  const yourFace = username ? <AvatarFace account={account} /> : undefined
  const computerFace = (
    <svg className="player-avatar-mark" viewBox="0 0 24 24" fill="currentColor">
      <path d={ROOK} />
    </svg>
  )
  // Your time running low: your clock turns red (both do, below the game's mark) and pulses once, with a tick-tock.
  const startMs = game.setup.clock === 'none' ? 0 : Number(game.setup.clock.split('+')[0]) * 1000
  const nudging = useLowTimeNudge(game.clock && !game.outcome ? remaining(game.clock, game.color, now) : null, startMs, settings.soundVolume)
  const clockOf = (c: Color) =>
    game.clock && (
      <span
        className={`player-clock ${game.clock.running === c && !game.outcome ? 'running' : ''} ${remaining(game.clock, c, now) < lowTimeMs(startMs) ? 'low' : ''} ${c === game.color && nudging ? 'nudge' : ''}`}
      >
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
  const face = (c: Color) => {
    const mine = c === game.color
    return (
      <div className={`vs-card ${mine ? 'you' : 'them'}`}>
        <span className={`player-avatar ${c}`}>{mine ? (yourFace ?? yourName[0]?.toUpperCase()) : computerFace}</span>
        <span className="vs-name">
          <strong>{mine ? yourName : computerName}</strong>
          {!mine && <span>{level.rating}</span>}
        </span>
      </div>
    )
  }
  const lastMove = shown.from && shown.to ? ([shown.from, shown.to] as [typeof shown.from, typeof shown.to]) : undefined
  // How the game ended, on the kings, once it's over and the final position is on the board.
  const ends = game.outcome && viewPly === null ? endMarks(shown.fen, { result: game.outcome.result, termination: game.outcome.reason }) : undefined
  const canTakeBack = !game.outcome && takebackPlies(game.moves.length, game.color, turnOf(game.startFen)) > 0
  // Until both sides have moved, the game can be called off instead: not saved, not counted.
  const canAbort = !game.outcome && (game.moves.length < 2 || Boolean(game.practice))

  // The opening the moves on show have reached: it stays named once the game leaves the book.
  const opening = useMemo(() => (book ? openingOf(book, line.slice(0, shownPly + 1)) : undefined), [book, line, shownPly])
  const openingText = game.practice ? 'Practice from a position · not saved' : shownPly === 0 ? 'Starting position' : opening ? opening.name : '\u00a0'

  const headers = playHeaders({ ...meta(game), date: new Date(game.startedAt) })

  return (
    <main className="play-layout play-game">
      {confirming === 'abort' && (
        <ConfirmDialog title="Abort this game?" confirm="Abort game" cancel="Keep playing" onConfirm={onNewGame} onClose={() => setConfirming(null)}>
          {game.practice ? 'Practice games aren’t saved or counted.' : 'It’s called off: not saved to My games and not counted as a loss.'}
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
        {introShown && (
          <div className="vs-intro" aria-hidden>
            {face(other(orientation))}
            <span className="vs-chip">VS</span>
            {face(orientation)}
          </div>
        )}
      </section>

      <aside className="panel play-panel">
        <div className="panel-card">
          <header className="play-panel-head">
            <div className="play-panel-title">
              <strong className={`play-status ${game.outcome ? 'over' : ''}`} role="status">
                {game.outcome ? outcomeText(game.outcome, game.color) : notice ?? (yourTurn ? 'Your move' : thinking || !engine ? 'The coach is thinking…' : 'The coach to move')}
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
              <MoveList tree={tree} currentId={shown.id} onSelect={(id) => showPly(line.findIndex((n) => n.id === id))} report={null} times={spent} emptyText="Your moves and the coach’s appear here." />
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
            <div className="play-quiet">
              <button className="quiet-act" onClick={takeback} disabled={!canTakeBack}>
                <ToolIcon name="takeback" />
                Takeback
                {game.takebacks > 0 && <span className="quiet-count">{game.takebacks}</span>}
              </button>
              <button className="quiet-act" onClick={() => void showHint()} disabled={!yourTurn || !engine}>
                <ToolIcon name="hint" />
                Hint
                {game.hints > 0 && <span className="quiet-count">{game.hints}</span>}
              </button>
              <button className="quiet-act" onClick={() => void offerDraw()} disabled={!engine || !yourTurn} title="Offer a draw">
                <span className="play-tool-half" aria-hidden>
                  ½
                </span>
                Draw
              </button>
              {canAbort ? (
                <button className="quiet-act" onClick={() => setConfirming('abort')} title="Call the game off: it isn’t saved or counted">
                  <ToolIcon name="abort" />
                  Abort
                </button>
              ) : (
                <button className="quiet-act" onClick={() => setConfirming('resign')}>
                  <ToolIcon name="resign" />
                  Resign
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
  return `${youWon ? 'You won' : 'The coach won'} ${REASONS[outcome.reason]}`
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
        <button className="btn ghost" onClick={onNewGame}>
          <ToolIcon name="plus" />
          New game
        </button>
        <button className="btn ghost" onClick={onRematch}>
          <ToolIcon name="rematch" />
          {game.practice ? 'Try again' : 'Rematch'}
        </button>
      </div>
    </div>
  )
}
