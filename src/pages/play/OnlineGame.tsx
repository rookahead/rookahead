import type { Key } from '@lichess-org/chessground/types'
import { Chess, DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Sheet } from '../../components/Sheet'
import { EngineLines } from '../../components/EngineLines'
import { EvalBar } from '../../components/EvalBar'
import { Explorer } from '../../components/Explorer'
import { Link } from '../../components/Link'
import { MoveList } from '../../components/MoveList'
import { MoveStrip } from '../../components/MoveStrip'
import { FlipIcon, NavIcon, SoundIcon } from '../../components/NavIcons'
import { PlayerBar } from '../../components/PlayerBar'
import { ToolIcon } from '../../components/PlayToolIcon'
import { Tabs } from '../../components/Tabs'
import { AvatarFace } from '../../components/UserCard'
import { useMoveSounds } from '../../hooks/useMoveSounds'
import { useLowTimeNudge } from '../../hooks/useLowTime'
import { lowTimeMs } from '../../lib/clock'
import { playSound } from '../../lib/sound'
import { terminalState, useLiveAnalysis } from '../../hooks/useAnalysis'
import type { EngineStatus, StockfishEngine } from '../../engine/Engine'
import { useAccount } from '../../lib/account'
import { formatClockFace } from '../../lib/clocks'
import { endMarks } from '../../lib/gameEnd'
import {
  abort,
  acceptChallenge,
  answerDraw,
  challenge,
  chatHistory,
  CHAT_MAX,
  claimVictory,
  clockNow,
  declineChallenge,
  endText,
  firstMoveMs,
  followGame,
  gamePgn,
  LIVE_STATUSES,
  NEW_ACCOUNT_DAYS,
  playerFacts,
  ratingAfter,
  resign,
  saveLiveOnline,
  sendChat,
  sendMove,
  sideToMove,
  speedOf,
  type ChatLine,
  type OnlineGame as Game,
  type PlayerFacts,
  type OnlineState,
  type Side,
  type IncomingChallenge,
  type StartedGame,
  watchEvents,
} from '../../lib/lichessPlay'
import { lichessNow } from '../../lib/lichessAuth'
import { materialState } from '../../lib/material'
import { importGames } from '../../lib/myGames'
import { loadOpeningBook, openingOf, type OpeningBook } from '../../lib/openings'
import type { Settings } from '../../lib/settings'
import { storesReplaced } from '../../lib/syncBus'
import { addLine, createTree, mainline, ROOT_ID } from '../../lib/tree'

const other = (c: Side): Side => (c === 'white' ? 'black' : 'white')
/** A dropped connection is tried again after this long. */
const RETRY_MS = 2000
/** Lichess sends a keep-alive every 7 seconds: this long without a word, the connection is opened again. */
const QUIET_MS = 11000
/** Lichess shows a move it took on the game's connection at once: this long without it, the connection is dead. */
const CONFIRM_MS = 2500

interface Props {
  started: StartedGame
  /** It just started here (not a reload coming back to it): the players are shown face to face first. */
  fresh: boolean
  settings: Settings
  phone: boolean
  /** Play is the page showing: the arrow keys step through the moves. */
  active: boolean
  gear: ReactNode
  onToggleSound: () => void
  /** The finished game's PGN, for the review. */
  onReview: (pgn: string, color: Side) => void
  /** Look for another game at the same time control. */
  onAgain: () => void
  /** A new game of yours started (a rematch): play it. */
  onStarted: (game: StartedGame) => void
  /** Back to choosing a game. */
  onDone: () => void
  /** The game ended (or is gone from Lichess): nothing left to come back to. */
  onOver: () => void
  /** Play's engine: off while the game is on (Lichess's rule), yours to switch on once it's over. */
  engine: StockfishEngine | null
  engineStatus: EngineStatus | null
  /** The New game tab: the next game's setup, beside this one. */
  newGame: ReactNode
  /** The time the next game is looked for at ("10+0"). */
  nextClock: string
}

type PanelTab = 'game' | 'new'
type GameTab = 'moves' | 'chat' | 'info' | 'openings'
/** How long a new game's face-to-face lasts, ms (index.css times its parts to it). */
const INTRO_MS = 1900
const noLine = () => {}
const noMove = () => {}

/**
 * A game against a real player, played on Lichess with your account (Board API) and shown on Rookahead's board.
 * Lichess keeps the moves and the clocks; this page follows them, sends your moves, and has no engine in it
 * (outside help is against Lichess's rules).
 */
export function OnlineGameView({ started, fresh, settings, phone, active, gear, onToggleSound, onReview, onAgain, onStarted, onDone, onOver, engine, engineStatus, newGame, nextClock }: Props) {
  const [game, setGame] = useState<Game | null>(null)
  const [state, setState] = useState<OnlineState | null>(null)
  const [gone, setGone] = useState<{ claimAt: number } | null>(null)
  // Your move, sent and waiting for Lichess to confirm it (it shows at once), and how many moves there were then.
  // `problem`: sending it went wrong, which doesn't say Lichess hasn't got it (its answer can be lost on the way),
  // so the move stays on the board until the game has been read again and shows which it is.
  const [sent, setSent] = useState<{ uci: string; after: number; problem?: string } | null>(null)
  const sentNow = useRef(sent)
  useEffect(() => {
    sentNow.current = sent
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'resign' | 'abort' | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [now, setNow] = useState(Date.now)
  const you = started.color

  // The panel's tabs: this game or the next one's setup, and in this game its moves, chat and facts.
  const [tab, setTab] = useState<PanelTab>('game')
  const [sub, setSub] = useState<GameTab>('moves')
  // A phone has no room for the tabs: the chat and the game's facts open in a sheet from the foot of the panel.
  const [phoneSheet, setPhoneSheet] = useState<'chat' | 'info' | null>(null)
  // The players' chat: what was said before the connection opened, then each line as it comes. Lines from your
  // opponent while the chat isn't showing are counted on its tab.
  const [chat, setChat] = useState<ChatLine[]>([])
  const [unread, setUnread] = useState(0)
  const reading = phone ? phoneSheet === 'chat' : tab === 'game' && sub === 'chat'
  const readingNow = useRef(reading)
  useEffect(() => {
    readingNow.current = reading
    if (reading) setUnread(0)
  }, [reading])
  const yourName = useRef('')
  // How long each move took (by ply), worked out from Lichess's clocks as each move arrives: Lichess doesn't send
  // them for earlier moves, so after a reload only the moves from then on have a time.
  const [spentByPly, setSpentByPly] = useState<Record<number, number>>({})
  const clockSeen = useRef<{ plies: number; left: Record<Side, number>; increment: number } | null>(null)
  const noteClocks = (s: OnlineState, increment: number) => {
    const was = clockSeen.current
    const left = { white: s.wtime, black: s.btime }
    const ply = s.moves.length
    // Lichess starts the clocks after each side's first move.
    if (was && ply === was.plies + 1 && ply > 2) {
      const mover: Side = ply % 2 === 1 ? 'white' : 'black'
      const took = Math.max(0, (was.left[mover] - left[mover] + increment) / 1000)
      setSpentByPly((p) => ({ ...p, [ply]: Math.round(took * 10) / 10 }))
    }
    clockSeen.current = { plies: ply, left, increment }
  }

  const say = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 3000)
  }

  // Follow the game; a dropped connection reconnects while the game is on. A connection can also die without
  // closing (Lichess drops it when the game is opened elsewhere, a network blip): one that's gone quiet for a
  // while, that hasn't shown a move Lichess took, or that just missed a move Lichess turned down, is dropped
  // and opened again, which brings the game back up to date. So is one that slept through the page being
  // hidden or the network changing.
  // Since when the connection has been down (null: up); a quick reopen doesn't flash a message.
  const [downSince, setDownSince] = useState<number | null>(null)
  const resync = useRef<() => void>(() => {})
  // How many moves the connection has shown.
  const heard = useRef(0)
  useEffect(() => {
    const ctrl = new AbortController()
    let over = false
    let lastHeard = Date.now()
    let current: AbortController | null = null
    // Tries in a row that brought no game.
    let failed = 0
    resync.current = () => current?.abort()
    const check = () => {
      if (!over && Date.now() - lastHeard > QUIET_MS) current?.abort()
    }
    const watchdog = setInterval(check, 2000)
    // Back on the page (a phone's browser stops a hidden page, and its connection dies unnoticed): look at once.
    const woke = () => document.visibilityState === 'visible' && check()
    // The network came back or changed: the old connection is gone with it.
    const online = () => current?.abort()
    document.addEventListener('visibilitychange', woke)
    window.addEventListener('pageshow', woke)
    window.addEventListener('online', online)
    void (async () => {
      while (!ctrl.signal.aborted && !over) {
        current = new AbortController()
        const stop = () => current?.abort()
        ctrl.signal.addEventListener('abort', stop)
        lastHeard = Date.now()
        const status = await followGame(
          started.id,
          {
            onGame: (g) => {
              failed = 0
              heard.current = g.state.moves.length
              yourName.current = g[you].name.toLowerCase()
              noteClocks(g.state, g.increment)
              void chatHistory(started.id).then((lines) => lines && setChat(lines))
              setGame(g)
              setState(g.state)
              setDownSince(null)
              // A move that went wrong on the way, and the game read again doesn't have it: it comes off the board.
              const p = sentNow.current
              if (p?.problem && g.state.moves.length <= p.after) {
                setSent(null)
                say(`Lichess didn’t take that move (${p.problem}). Try again.`)
              }
              over = !LIVE_STATUSES.has(g.state.status)
            },
            onState: (s) => {
              noteClocks(s, clockSeen.current?.increment ?? 0)
              heard.current = s.moves.length
              setState(s)
              over = !LIVE_STATUSES.has(s.status)
            },
            onGone: (seconds) => setGone(seconds === null ? null : { claimAt: Date.now() + seconds * 1000 }),
            onChat: (l) => {
              setChat((was) => [...was, l])
              if (!readingNow.current && l.user.toLowerCase() !== yourName.current && l.user !== 'lichess') setUnread((n) => n + 1)
            },
            onAlive: () => {
              lastHeard = Date.now()
            },
          },
          current.signal,
        ).catch(() => 0)
        ctrl.signal.removeEventListener('abort', stop)
        if (status === 404 || status === 401) {
          setNotice(status === 404 ? 'This game isn’t on Lichess any more.' : 'Your Lichess connection ended.')
          saveLiveOnline(null)
          return
        }
        if (!over && !ctrl.signal.aborted) {
          setDownSince((d) => d ?? Date.now())
          // A connection that was working is opened again at once; one that won't open is given a moment.
          await new Promise((r) => setTimeout(r, failed++ ? RETRY_MS : 300))
        }
      }
    })()
    return () => {
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', woke)
      window.removeEventListener('pageshow', woke)
      window.removeEventListener('online', online)
      ctrl.abort()
    }
  }, [started.id])

  const live = Boolean(state && LIVE_STATUSES.has(state.status))
  const over = Boolean(state && !live)
  // The game ending while you watched it (not one that was already over when the page opened) closes with a clank.
  const seenLive = useRef(false)
  if (live) seenLive.current = true
  useEffect(() => {
    if (!over) return
    saveLiveOnline(null)
    onOver()
    if (seenLive.current) playSound('gameover', settings.soundVolume)
    // Only the game ending plays it, not a change of volume afterwards.
  }, [over, onOver])
  // Over: it's a Lichess game now, so fetch your Lichess games again and it shows in My games straight away
  // (a moment first, for Lichess to file it).
  const lichessUser = (settings.lichessUser || lichessNow()?.username || '').trim()
  useEffect(() => {
    if (!over || !lichessUser) return
    const t = setTimeout(() => void importGames('lichess', lichessUser).then(() => storesReplaced(['games']), () => {}), 1500)
    return () => clearTimeout(t)
  }, [over, lichessUser])

  // Lichess's moves, plus yours while it's on its way: once Lichess has more moves than when you sent it, it has
  // yours (and maybe already the reply).
  const confirmed = useMemo(() => state?.moves ?? [], [state])
  if (sent && (confirmed.length > sent.after || (state && !LIVE_STATUSES.has(state.status)))) setSent(null)
  const pending = sent?.uci ?? null
  const moves = useMemo(() => (pending ? [...confirmed, pending] : confirmed), [confirmed, pending])
  const { tree, line } = useMemo(() => {
    const t = addLine(createTree(DEFAULT_POSITION), ROOT_ID, moves).tree
    return { tree: t, line: mainline(t) }
  }, [moves])
  const lastPly = line.length - 1
  const times = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [ply, took] of Object.entries(spentByPly)) if (line[Number(ply)]) out[line[Number(ply)].id] = took
    return Object.keys(out).length ? out : undefined
  }, [spentByPly, line])

  // Looking back through the game: the ply on show, or null for the live position. A new move returns to live.
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [seen, setSeen] = useState(moves.length)
  if (seen !== moves.length) {
    setSeen(moves.length)
    setViewPly(null)
  }
  const shownPly = viewPly ?? lastPly
  const shown = line[shownPly]
  const showPly = useCallback((ply: number) => setViewPly(ply >= lastPly ? null : Math.max(0, ply)), [lastPly])
  const [flipped, setFlipped] = useState(false)
  const orientation = flipped ? other(you) : you
  const turn = sideToMove(moves)
  const yourTurn = live && turn === you && !pending

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return
      const actions: Record<string, () => void> = {
        ArrowLeft: () => showPly(shownPly - 1),
        ArrowRight: () => showPly(shownPly + 1),
        ArrowUp: () => showPly(0),
        ArrowDown: () => showPly(lastPly),
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

  // Another browser tab in front while it's your move: this tab's title flashes "Your move" and their last move,
  // so you notice from the tab bar. The page's own title comes back when you return, or when you've moved.
  const theirLast = line[lastPly]?.san
  useEffect(() => {
    if (!yourTurn) return
    let saved: string | null = null
    let timer = 0
    const sync = () => {
      clearInterval(timer)
      if (document.visibilityState === 'hidden') {
        saved ??= document.title
        const flash = `● Your move${theirLast ? ` · they played ${theirLast}` : ''}`
        let on = true
        const show = () => {
          document.title = on ? flash : saved!
          on = !on
        }
        show()
        timer = window.setInterval(show, 1000)
      } else if (saved !== null) {
        document.title = saved
        saved = null
      }
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
      if (saved !== null) document.title = saved
    }
  }, [yourTurn, theirLast])

  // Clocks tick between Lichess's updates.
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [live])


  const onMove = (move: { from: string; to: string; promotion?: string }) => {
    if (!yourTurn) return
    const uci = move.from + move.to + (move.promotion ?? '')
    if (!new Chess(line[lastPly].fen).moves({ verbose: true }).some((m) => m.lan === uci)) return
    const after = confirmed.length
    setSent({ uci, after })
    void sendMove(started.id, uci).then((problem) => {
      if (!problem) {
        // Lichess has the move, so the connection should show it: if it doesn't, it's dead, and your opponent's
        // reply would never arrive on it.
        setTimeout(() => heard.current <= after && resync.current(), CONFIRM_MS)
        return
      }
      // The move stays where it is, and the board shut, until the game read again says whether Lichess has it:
      // taking it back now would invite a second move while the first one stands.
      setSent((p) => (p?.uci === uci && p.after === after ? { ...p, problem } : p))
      resync.current()
    })
  }

  const [book, setBook] = useState<OpeningBook | null>(null)
  useEffect(() => {
    void loadOpeningBook().then(setBook)
  }, [])
  const opening = useMemo(() => (book ? openingOf(book, line.slice(0, shownPly + 1)) : undefined), [book, line, shownPly])

  // The end gets its own sound (above), not the review's chime on the last move.
  useMoveSounds(tree, shown, settings.soundVolume, false)

  // After the game, the engine can look at it (never before: outside help is against Lichess's rules). Off until
  // you switch it on; its best move is drawn on the board.
  const [engineOn, setEngineOn] = useState(false)
  const analysis = useLiveAnalysis({
    engine,
    ready: engineStatus?.state === 'ready',
    fen: shown.fen,
    enabled: over && engineOn,
    multiPv: settings.lines,
    depth: settings.liveDepth,
    paused: !active || tab !== 'game',
  })
  const terminal = useMemo(() => terminalState(shown.fen), [shown.fen])
  const best = over && engineOn ? analysis.result?.lines[0]?.pv[0] : undefined
  const shapes = useMemo(() => (best ? [{ orig: best.slice(0, 2) as Key, dest: best.slice(2, 4) as Key, brush: 'best' }] : []), [best])

  // A rated game's effect on your rating, once Lichess has filed the game.
  const [afterRating, setAfterRating] = useState<{ rating: number; diff: number } | null>(null)
  const ratedGame = Boolean(game?.rated)
  useEffect(() => {
    if (!over || !ratedGame) return
    const t = setTimeout(() => void ratingAfter(started.id, you).then(setAfterRating), 1500)
    return () => clearTimeout(t)
  }, [over, ratedGame, started.id, you])

  // Both players' Lichess accounts, to spot a brand-new (or flagged) opponent: tap a name for the card.
  const [factsBy, setFactsBy] = useState<Partial<Record<Side, PlayerFacts>>>({})
  const [card, setCard] = useState<Side | null>(null)
  const whiteName = game?.white.name
  const blackName = game?.black.name
  const speed = game ? speedOf(game.initial, game.increment) : null
  useEffect(() => {
    if (!speed) return
    let alive = true
    for (const [side, name] of [['white', whiteName], ['black', blackName]] as const) {
      if (name) void playerFacts(name, speed).then((f) => alive && f && setFactsBy((was) => ({ ...was, [side]: f })))
    }
    return () => {
      alive = false
    }
  }, [whiteName, blackName, speed])
  const daysOld = (f?: PlayerFacts) => (f?.createdAt ? Math.floor((now - f.createdAt) / 86400000) : null)
  const theirs = factsBy[other(you)]
  const theirAge = daysOld(theirs)
  // Lichess calls the game off if a side doesn't make its first move in time: the side to move sees how long is left.
  const plies = confirmed.length
  const [waitFrom, setWaitFrom] = useState<{ plies: number; at: number } | null>(null)
  if (live && plies < 2 && waitFrom?.plies !== plies) setWaitFrom({ plies, at: plies === 0 && game?.createdAt ? Math.min(game.createdAt, Date.now()) : Date.now() })
  const firstLeft = live && plies < 2 && waitFrom && game ? Math.max(0, Math.ceil((firstMoveMs(game.initial, game.increment) - (now - waitFrom.at)) / 1000)) : null
  const firstNote = (c: Side) =>
    firstLeft != null &&
    turn === c && (
      <span className={`player-sub ${firstLeft <= 10 ? 'bad' : ''}`} title="Lichess calls the game off if the first move doesn’t come in time">
        {c === you ? 'Your move' : 'Their first move'} · called off in 0:{String(firstLeft).padStart(2, '0')}
      </span>
    )
  const note = theirs?.marked ? <span className="player-note bad">Marked by Lichess</span> : theirAge != null && theirAge < NEW_ACCOUNT_DAYS ? <span className="player-note warn">New account</span> : null
  const cardFor = (c: Side) =>
    card === c && game && <PlayerCard facts={factsBy[c] ?? null} name={game[c].name} ageDays={daysOld(factsBy[c])} yours={c === you} onClose={() => setCard(null)} />

  const { account, username } = useAccount()
  const material = materialState(shown.fen)
  const clocks = state ? clockNow(state, now) : null
  const runningSide = state && live && state.moves.length >= 2 ? turn : null
  // Your time running low: red below the game's mark, and one pulse with a tick-tock as you cross it.
  const startMs = game?.initial ?? 0
  const nudging = useLowTimeNudge(live && clocks ? clocks[you] : null, startMs, settings.soundVolume)
  const bar = (c: Side) => {
    const p = game?.[c]
    const mine = c === you
    const ms = clocks?.[c]
    return (
      <PlayerBar
        color={c}
        name={p ? `${p.title ? `${p.title} ` : ''}${p.name}` : mine ? (username ?? 'You') : 'Opponent'}
        rating={p?.rating != null ? `${p.rating}${factsBy[c]?.provisional ? '?' : ''}` : undefined}
        avatar={mine && username ? <AvatarFace account={account} /> : undefined}
        onName={p ? () => setCard((open) => (open === c ? null : c)) : undefined}
        note={mine ? undefined : note}
        sub={firstNote(c) || undefined}
        captured={material.captured[c]}
        advantage={material.advantage[c]}
        clock={
          ms != null && (
            <span className={`player-clock ${runningSide === c ? 'running' : ''} ${startMs && ms < lowTimeMs(startMs) ? 'low' : ''} ${mine && nudging ? 'nudge' : ''}`}>{formatClockFace(Math.max(0, ms) / 1000)}</span>
          )
        }
      />
    )
  }

  // A new game opens with both players face to face over the board for a moment, as the game arrives.
  const [intro, setIntro] = useState(fresh)
  const introShown = intro && Boolean(game) && confirmed.length < 2
  useEffect(() => {
    if (!introShown) return
    // A sound says the game is on, for when you looked away while it searched.
    playSound('start', settings.soundVolume)
    const t = setTimeout(() => setIntro(false), INTRO_MS)
    return () => clearTimeout(t)
    // Only the intro starting plays it, not a change of volume during it.
  }, [introShown])
  const face = (c: Side) => {
    const p = game![c]
    const mine = c === you
    return (
      <div className={`vs-card ${mine ? 'you' : 'them'}`}>
        <span className={`player-avatar ${c}`}>{mine && username ? <AvatarFace account={account} /> : p.name[0]?.toUpperCase()}</span>
        <span className="vs-name">
          <strong>
            {p.title && <span className="opponent-title">{p.title}</span>}
            {p.name}
          </strong>
          {p.rating != null && <span>{p.rating}</span>}
        </span>
      </div>
    )
  }

  const lastMove = shown.from && shown.to ? ([shown.from, shown.to] as [typeof shown.from, typeof shown.to]) : undefined
  const result = state && !live ? (state.winner === 'white' ? '1-0' : state.winner === 'black' ? '0-1' : state.status === 'aborted' || state.status === 'noStart' ? null : '1/2-1/2') : null
  const ends = result && viewPly === null ? endMarks(shown.fen, { result, termination: state!.status === 'resign' ? 'resignation' : state!.status === 'outoftime' ? 'timeout' : state!.status }) : undefined
  // Lichess lets either side call the game off until both have moved.
  const canAbort = live && confirmed.length < 2
  const offerFromThem = state?.drawOffer === other(you)
  const offerFromYou = state?.drawOffer === you
  const canClaim = gone && now >= gone.claimAt

  // After the game: a rematch, asked for by you (a challenge kept open until answered) or by your opponent.
  const [rematch, setRematch] = useState<{ ctrl: AbortController } | null>(null)
  const [incoming, setIncoming] = useState<IncomingChallenge | null>(null)
  useEffect(() => {
    if (!over) return
    const ctrl = new AbortController()
    void watchEvents(
      {
        onGameStart: (g) => g.id !== started.id && onStarted(g),
        onChallenge: (c) => c.rematchOf === started.id && setIncoming(c),
        onChallengeGone: (id) => setIncoming((c) => (c?.id === id ? null : c)),
      },
      ctrl.signal,
    ).catch(() => {})
    return () => ctrl.abort()
  }, [over, started.id, onStarted])
  useEffect(() => () => rematch?.ctrl.abort(), [rematch])
  const askRematch = async () => {
    if (!game) return
    if (incoming) {
      if (!(await acceptChallenge(incoming.id))) say('Couldn’t accept the rematch. Try again.')
      return
    }
    const ctrl = new AbortController()
    setRematch({ ctrl })
    const done = await challenge(game[other(you)].name, game, other(you), ctrl.signal)
    setRematch((r) => (r?.ctrl === ctrl ? null : r))
    if (done === 'declined') say('Your opponent declined the rematch.')
    else if (done === 'failed') say('Lichess didn’t send the rematch. Your opponent may have left.')
  }

  const status = !state
    ? 'Connecting to Lichess…'
    : !live
      ? (notice ?? (incoming ? `${incoming.from} wants a rematch` : rematch ? 'Rematch offered · waiting…' : endText(state, you)))
      : (notice ?? (downSince && now - downSince > 1500 ? 'Reconnecting to Lichess…' : offerFromThem ? 'Your opponent offers a draw' : gone ? (canClaim ? 'Your opponent left' : `Your opponent left · ${Math.ceil((gone.claimAt - now) / 1000)} s`) : yourTurn ? 'Your move' : pending ? 'Sending…' : 'Their move'))

  const review = async () => {
    setReviewing(true)
    const pgn = await gamePgn(started.id)
    setReviewing(false)
    if (pgn) onReview(pgn, you)
    else say('Couldn’t get the game from Lichess. Try again.')
  }

  return (
    <main className="play-layout play-game online-game">
      {confirming === 'resign' && (
        <ConfirmDialog
          title="Resign this game?"
          confirm="Resign"
          cancel="Keep playing"
          danger
          onConfirm={() => {
            setConfirming(null)
            void resign(started.id).then((ok) => ok || say('Couldn’t resign. Try again.'))
          }}
          onClose={() => setConfirming(null)}
        >
          {game?.rated ? 'Your opponent wins, and it counts for your Lichess rating.' : 'Your opponent wins.'}
        </ConfirmDialog>
      )}
      {confirming === 'abort' && (
        <ConfirmDialog
          title="Abort this game?"
          confirm="Abort game"
          cancel="Keep playing"
          onConfirm={() => {
            setConfirming(null)
            void abort(started.id).then((ok) => ok || say('Couldn’t abort. Try again.'))
          }}
          onClose={() => setConfirming(null)}
        >
          It’s called off before it starts: no result and no rating change. Abort often, though, and Lichess times you out from playing for a while.
        </ConfirmDialog>
      )}
      <section className="play-board">
        <div className="online-bar">
          {bar(other(orientation))}
          {cardFor(other(orientation))}
        </div>
        <Board
          fen={shown.fen}
          orientation={orientation}
          lastMove={lastMove}
          shapes={shapes}
          theme={settings.boardTheme}
          coordinates={settings.coordinates}
          onMove={onMove}
          locked={!live || viewPly !== null || Boolean(pending) || (!settings.premoves && !yourTurn)}
          premove={settings.premoves ? you : undefined}
          autoQueen={settings.autoQueen}
          ends={ends}
        />
        <div className="online-bar">
          {bar(orientation)}
          {cardFor(orientation)}
        </div>
        {/* After the game, with the engine on: its eval bar in the place Play keeps for it beside the board. */}
        {!phone && over && engineOn && (
          <EvalBar score={terminal?.score ?? analysis.result?.lines[0]?.score ?? null} orientation={orientation} active theme={settings.boardTheme} />
        )}
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
          {!phone && (
            <Tabs
              label="Play"
              value={tab}
              onSelect={setTab}
              items={[
                {
                  id: 'game',
                  label: over ? 'Analysis' : 'Play',
                  icon: over ? PANEL_ICONS.analysis : PANEL_ICONS.play,
                  close: over ? { label: 'Close this game', onClose: onDone } : undefined,
                },
                { id: 'new', label: 'New game', icon: PANEL_ICONS.newGame },
              ]}
            />
          )}
          {!phone && tab === 'new' ? (
            newGame
          ) : (
            <>
              <header className="play-panel-head">
                <div className="play-panel-title">
                  <strong className={`play-status ${over ? 'over' : ''}`} role="status">
                    {status}
                  </strong>
                  <span className="play-opening muted">
                    {game ? `Online · ${game.initial / 60000}+${game.increment / 1000} · ${game.rated ? 'rated' : 'casual'}` : 'Online'}
                    {opening && shownPly > 0 ? ` · ${opening.name}` : ''}
                  </span>
                </div>
              </header>
              {!phone && (
                <Tabs
                  label="Game"
                  value={sub}
                  onSelect={setSub}
                  items={[
                    { id: 'moves', label: 'Moves' },
                    { id: 'chat', label: 'Chat', count: unread || undefined },
                    { id: 'info', label: 'Info' },
                    ...(over ? [{ id: 'openings' as const, label: 'Openings' }] : []),
                  ]}
                />
              )}
              {phone || sub === 'moves' ? (
                <>
                  {!phone && over && (
                    <EngineLines
                      fen={shown.fen}
                      status={engineStatus}
                      enabled={engineOn}
                      onToggle={() => setEngineOn((on) => !on)}
                      result={engineOn ? analysis.result : null}
                      searching={analysis.searching}
                      maxLines={settings.lines}
                      terminal={terminal}
                      reviewing={false}
                      onPlayLine={noLine}
                    />
                  )}
                  <div className="panel-body">
                    {phone ? (
                      <MoveStrip tree={tree} currentId={shown.id} onSelect={(id) => showPly(line.findIndex((n) => n.id === id))} />
                    ) : (
                      <MoveList tree={tree} currentId={shown.id} onSelect={(id) => showPly(line.findIndex((n) => n.id === id))} report={null} times={times} emptyText="Your moves and your opponent’s appear here." />
                    )}
                  </div>
                </>
              ) : sub === 'chat' ? (
                <ChatPanel lines={chat} game={game} you={you} over={over ? endText(state!, you) : null} rated={afterRating} onSend={(text) => sendChat(started.id, text)} />
              ) : sub === 'info' ? (
                <InfoPanel game={game} state={state} you={you} rated={afterRating} id={started.id} onReview={result ? () => void review() : undefined} reviewing={reviewing} />
              ) : (
                <div className="panel-body online-openings">
                  <Explorer fen={shown.fen} onPlay={noMove} />
                </div>
              )}
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
              {over ? (
                <div className="result-card">
                  {result && (
                    <button className="btn accent-btn" onClick={() => void review()} disabled={reviewing || confirmed.length < 2}>
                      {reviewing ? 'Getting the game…' : 'Review this game'}
                    </button>
                  )}
                  <div className="result-more">
                    <button className="btn ghost" onClick={onAgain}>
                      <ToolIcon name="plus" />
                      New {nextClock}
                    </button>
                    {rematch ? (
                      <button className="btn ghost" onClick={() => rematch.ctrl.abort()}>
                        Cancel rematch
                      </button>
                    ) : (
                      <button className={`btn ${incoming ? 'primary' : 'ghost'}`} onClick={() => void askRematch()} disabled={!game}>
                        <ToolIcon name="rematch" />
                        {incoming ? 'Accept rematch' : 'Rematch'}
                      </button>
                    )}
                  </div>
                  {incoming && !rematch && (
                    <button className="btn ghost small" onClick={() => void declineChallenge(incoming.id).then(() => setIncoming(null))}>
                      Decline the rematch
                    </button>
                  )}
                </div>
              ) : offerFromThem ? (
                <div className="play-actions online-offer">
                  <button className="btn accent-btn" onClick={() => void answerDraw(started.id, true)}>
                    Accept draw
                  </button>
                  <button className="btn ghost" onClick={() => void answerDraw(started.id, false)}>
                    Decline
                  </button>
                </div>
              ) : canClaim ? (
                <div className="play-actions online-offer">
                  <button className="btn accent-btn" onClick={() => void claimVictory(started.id).then((ok) => ok || say('Couldn’t claim the win yet.'))}>
                    Claim the win
                  </button>
                </div>
              ) : (
                <div className="play-quiet">
                  <button
                    className={`quiet-act ${offerFromYou ? 'active' : ''}`}
                    onClick={() => void answerDraw(started.id, true).then((ok) => say(ok ? 'Draw offered' : 'Couldn’t offer a draw.'))}
                    disabled={!live || offerFromYou || confirmed.length < 2}
                    title={offerFromYou ? 'Draw offered' : 'Offer a draw'}
                  >
                    <span className="play-tool-half" aria-hidden>
                      ½
                    </span>
                    {offerFromYou ? 'Draw offered' : 'Draw'}
                  </button>
                  {canAbort ? (
                    <button className="quiet-act" onClick={() => setConfirming('abort')} disabled={!state} title="Call the game off before it starts">
                      <ToolIcon name="abort" />
                      Abort
                    </button>
                  ) : (
                    <button className="quiet-act" onClick={() => setConfirming('resign')} disabled={!live}>
                      <ToolIcon name="resign" />
                      Resign
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          <div className="panel-strip">
            {!phone && gear}
            {phone && (
              <>
                <button className="icon-btn strip-badged" onClick={() => setPhoneSheet('chat')} aria-label={unread ? `Chat, ${unread} new` : 'Chat'} title="Chat">
                  <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
                    <path d={CHAT_ICON} />
                  </svg>
                  {unread > 0 && <span className="strip-badge">{unread > 9 ? '9+' : unread}</span>}
                </button>
                <button className="icon-btn" onClick={() => setPhoneSheet('info')} aria-label="Game info" title="Game info">
                  <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
                    <path d={INFO_ICON} />
                  </svg>
                </button>
              </>
            )}
            <a className="icon-btn" href={`https://lichess.org/${started.id}`} target="_blank" rel="noreferrer" aria-label="Open on Lichess" title="Open on Lichess">
              <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
            <button className="icon-btn panel-strip-end" onClick={onToggleSound} aria-label={settings.soundVolume === 0 ? 'Sounds on' : 'Sounds off'} title={settings.soundVolume === 0 ? 'Sounds on' : 'Sounds off'}>
              <SoundIcon muted={settings.soundVolume === 0} />
            </button>
            <button className="icon-btn" onClick={() => setFlipped((f) => !f)} aria-label="Flip board" title="Flip board (F)">
              <FlipIcon />
            </button>
          </div>
        </div>
      </aside>
      {phone && phoneSheet && (
        <Sheet bottom title={phoneSheet === 'chat' ? 'Chat' : 'Game info'} sub={game ? `${nameOf(game.white)} vs ${nameOf(game.black)}` : undefined} onClose={() => setPhoneSheet(null)}>
          {phoneSheet === 'chat' ? (
            <ChatPanel lines={chat} game={game} you={you} over={over ? endText(state!, you) : null} rated={afterRating} onSend={(text) => sendChat(started.id, text)} />
          ) : (
            <InfoPanel game={game} state={state} you={you} rated={afterRating} id={started.id} onReview={result ? () => void review() : undefined} reviewing={reviewing} />
          )}
        </Sheet>
      )}
    </main>
  )
}

const CHAT_ICON = 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'
const INFO_ICON = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.5'

const ago = (days: number) => (days < 1 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} days ago` : days < 730 ? `${Math.round(days / 30)} months ago` : `${Math.round(days / 365)} years ago`)
// The country by name: Windows draws flag emoji as two letters.
const countryOf = (code: string) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * A player at a glance, from their Lichess account: how old it is, how much they've played, any mark. Your
 * opponent's warns about a young account; yours adds the way to your profile here.
 */
function PlayerCard({ facts, name, ageDays, yours, onClose }: { facts: PlayerFacts | null; name: string; ageDays: number | null; yours: boolean; onClose: () => void }) {
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as HTMLElement).closest('.opponent-card, .player-name-btn')) onClose()
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [onClose])
  // Your own account gets no warnings.
  const isNew = !yours && ageDays != null && ageDays < NEW_ACCOUNT_DAYS
  const watch = (bad: boolean) => (!yours && bad ? 'warn' : '')
  return (
    <div className="opponent-card" role="dialog" aria-label={`About ${name}`}>
      <div className="opponent-head">
        <strong>
          {facts?.title && <span className="opponent-title">{facts.title}</span>}
          {facts?.name ?? name}
        </strong>
        {facts?.country && <span className="opponent-country">{countryOf(facts.country)}</span>}
      </div>
      {!facts ? (
        <p className="muted">Reading their Lichess account…</p>
      ) : (
        <dl className="opponent-facts">
          <div className={isNew ? 'warn' : ''}>
            <dt>Joined</dt>
            <dd>{ageDays == null ? '—' : ago(ageDays)}</dd>
          </div>
          <div className={watch(facts.rated < 50)}>
            <dt>Rated games</dt>
            <dd>{facts.rated.toLocaleString('en-US')}</dd>
          </div>
          <div className={watch(facts.provisional)}>
            <dt>Rating here</dt>
            <dd>
              {facts.rating ?? '—'}
              {facts.provisional ? '?' : ''} <small>{facts.speedGames} games</small>
            </dd>
          </div>
        </dl>
      )}
      {facts?.marked && <p className="opponent-alert">Lichess has marked this account for breaking its rules.</p>}
      {facts && !facts.marked && isNew && <p className="opponent-warn">A new account: most are fine, but keep an eye on it.</p>}
      <div className="opponent-links">
        {yours && (
          <Link to="/profile" className="btn ghost small">
            Your profile
          </Link>
        )}
        <a className="btn ghost small" href={facts?.url ?? `https://lichess.org/@/${name}`} target="_blank" rel="noreferrer">
          Profile on Lichess
        </a>
      </div>
    </div>
  )
}

/** The panel's tab icons (strokes, 24×24). */
const PANEL_ICONS = {
  play: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 2M9.5 3h5M12 3v3" />
    </>
  ),
  analysis: <path d="M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.6 15.6M7 7h3.5v3.5H7zM10.5 10.5H14V14h-3.5z" />,
  newGame: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
}

const timeOf = (g: Game) => `${g.initial / 60000}+${g.increment / 1000}`
const nameOf = (p: Game['white']) => `${p.title ? `${p.title} ` : ''}${p.name}${p.rating != null ? ` (${p.rating})` : ''}`
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')

/** Quick things to say, a tap each: hello while the game is on, good game after it. */
const SAY_DURING = ['Hi', 'Good luck', 'Have fun']
const SAY_AFTER = ['Good game', 'Well played', 'Thanks', 'Rematch?']

/**
 * The players' chat, inside the panel (it never covers the board or the game): the game's start and end as
 * notes, Lichess's own messages, and what you and your opponent say.
 */
function ChatPanel({ lines, game, you, over, rated, onSend }: { lines: ChatLine[]; game: Game | null; you: Side; over: string | null; rated: { rating: number; diff: number } | null; onSend: (text: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState('')
  const [failed, setFailed] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  // The newest line in view, as a chat app does.
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length, over])
  const send = async (text: string) => {
    const said = text.trim()
    if (!said) return
    setDraft('')
    setFailed(false)
    if (!(await onSend(said))) {
      setDraft(said)
      setFailed(true)
    }
  }
  const mine = game?.[you].name.toLowerCase()
  return (
    <div className="online-chat">
      <div className="online-chat-lines" ref={list} aria-live="polite">
        {game && (
          <p className="online-chat-note">
            <strong>New game</strong>
            <span>
              {nameOf(game.white)} vs {nameOf(game.black)}
            </span>
            <span className="muted">
              {timeOf(game)} · {game.rated ? 'Rated' : 'Casual'}
            </span>
          </p>
        )}
        {lines.map((l, i) =>
          l.user === 'lichess' ? (
            <p key={i} className="online-chat-note lichess">
              {l.text}
            </p>
          ) : (
            <p key={i} className={`online-chat-line ${l.user.toLowerCase() === mine ? 'mine' : ''}`}>
              <strong>{l.user}</strong> {l.text}
            </p>
          ),
        )}
        {over && (
          <p className="online-chat-note">
            <strong>Game over</strong>
            <span>{over}</span>
            {rated && (
              <span className="muted">
                Your Lichess rating is now {rated.rating} ({signed(rated.diff)})
              </span>
            )}
          </p>
        )}
      </div>
      <div className="online-chat-quick" aria-label="Quick messages">
        {(over ? SAY_AFTER : SAY_DURING).map((t) => (
          <button key={t} className="setup-tile" onClick={() => void send(t)}>
            {t}
          </button>
        ))}
      </div>
      <form
        className="online-chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <input className="setup-input" value={draft} maxLength={CHAT_MAX} placeholder="Send a message…" aria-label="Message" onChange={(e) => setDraft(e.target.value)} />
        <button className="btn accent-btn small" disabled={!draft.trim()}>
          Send
        </button>
      </form>
      {failed && <p className="form-error">Lichess didn’t take that message. Try again.</p>}
    </div>
  )
}

/** The game's facts: when it started, its time, the players; once it's over, the result and what to do next. */
function InfoPanel({
  game,
  state,
  you,
  rated,
  id,
  onReview,
  reviewing,
}: {
  game: Game | null
  state: OnlineState | null
  you: Side
  rated: { rating: number; diff: number } | null
  id: string
  onReview?: () => void
  reviewing: boolean
}) {
  const over = state && !LIVE_STATUSES.has(state.status)
  const them = game?.[other(you)]
  const result = !state || !over ? null : state.winner === 'white' ? '1-0' : state.winner === 'black' ? '0-1' : state.status === 'aborted' || state.status === 'noStart' ? null : '½-½'
  return (
    <div className="panel-body online-info">
      {over && (
        <div className="online-info-result">
          <strong>{endText(state, you)}</strong>
          {result && <span className="muted">{result}</span>}
          {rated && (
            <span>
              Your Lichess rating is now <b>{rated.rating}</b> ({signed(rated.diff)})
            </span>
          )}
        </div>
      )}
      {game && (
        <dl className="online-info-facts">
          {game.createdAt && (
            <div>
              <dt>Started</dt>
              <dd>{new Date(game.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
            </div>
          )}
          <div>
            <dt>Time</dt>
            <dd>
              {timeOf(game)} · {speedOf(game.initial, game.increment) === 'classical' ? 'Classical' : 'Rapid'}
            </dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{game.rated ? 'Rated' : 'Casual'}</dd>
          </div>
          <div>
            <dt>White</dt>
            <dd>{nameOf(game.white)}</dd>
          </div>
          <div>
            <dt>Black</dt>
            <dd>{nameOf(game.black)}</dd>
          </div>
        </dl>
      )}
      <div className="online-info-links">
        {onReview && (
          <button className="link-btn" onClick={onReview} disabled={reviewing}>
            {reviewing ? 'Getting the game…' : 'Review this game'}
          </button>
        )}
        <a className="link-btn" href={`https://lichess.org/${id}`} target="_blank" rel="noreferrer">
          Open on Lichess
        </a>
        {them && (
          <a className="link-btn" href={`https://lichess.org/@/${them.name}`} target="_blank" rel="noreferrer">
            {them.name}’s profile on Lichess
          </a>
        )}
      </div>
    </div>
  )
}
