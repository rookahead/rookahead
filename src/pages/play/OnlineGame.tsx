import { Chess, DEFAULT_POSITION } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Board } from '../../components/Board'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Link } from '../../components/Link'
import { MoveList } from '../../components/MoveList'
import { MoveStrip } from '../../components/MoveStrip'
import { FlipIcon, NavIcon, SoundIcon } from '../../components/NavIcons'
import { PlayerBar } from '../../components/PlayerBar'
import { ToolIcon } from '../../components/PlayToolIcon'
import { AvatarFace } from '../../components/UserCard'
import { useMoveSounds } from '../../hooks/useMoveSounds'
import { useAccount } from '../../lib/account'
import { formatClockFace } from '../../lib/clocks'
import { endMarks } from '../../lib/gameEnd'
import {
  abort,
  acceptChallenge,
  answerDraw,
  challenge,
  claimVictory,
  clockNow,
  declineChallenge,
  endText,
  followGame,
  gamePgn,
  LIVE_STATUSES,
  NEW_ACCOUNT_DAYS,
  playerFacts,
  resign,
  saveLiveOnline,
  sendMove,
  sideToMove,
  speedOf,
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
/** Lichess keeps a game's connection busy (keep-alives): this long without a word, it's opened again. */
const QUIET_MS = 20000

interface Props {
  started: StartedGame
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
}

/**
 * A game against a real player, played on Lichess with your account (Board API) and shown on Rookahead's board.
 * Lichess keeps the moves and the clocks; this page follows them, sends your moves, and has no engine in it
 * (outside help is against Lichess's rules).
 */
export function OnlineGameView({ started, settings, phone, active, gear, onToggleSound, onReview, onAgain, onStarted, onDone }: Props) {
  const [game, setGame] = useState<Game | null>(null)
  const [state, setState] = useState<OnlineState | null>(null)
  const [gone, setGone] = useState<{ claimAt: number } | null>(null)
  // Your move, sent and waiting for Lichess to confirm it (it shows at once), and how many moves there were then.
  const [sent, setSent] = useState<{ uci: string; after: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'resign' | 'abort' | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [now, setNow] = useState(Date.now)
  const you = started.color

  // Follow the game; a dropped connection reconnects while the game is on. A connection can also die without
  // closing (Lichess drops it when the game is opened elsewhere, a network blip): one that's gone quiet for a
  // while, or that just missed a move Lichess turned down, is dropped and opened again, which brings the game
  // back up to date.
  // Since when the connection has been down (null: up); a quick reopen doesn't flash a message.
  const [downSince, setDownSince] = useState<number | null>(null)
  const resync = useRef<() => void>(() => {})
  useEffect(() => {
    const ctrl = new AbortController()
    let over = false
    let lastHeard = Date.now()
    let current: AbortController | null = null
    resync.current = () => current?.abort()
    const watchdog = setInterval(() => {
      if (!over && Date.now() - lastHeard > QUIET_MS) current?.abort()
    }, 5000)
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
              setGame(g)
              setState(g.state)
              setDownSince(null)
              over = !LIVE_STATUSES.has(g.state.status)
            },
            onState: (s) => {
              setState(s)
              over = !LIVE_STATUSES.has(s.status)
            },
            onGone: (seconds) => setGone(seconds === null ? null : { claimAt: Date.now() + seconds * 1000 }),
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
          await new Promise((r) => setTimeout(r, current?.signal.aborted ? 300 : RETRY_MS))
        }
      }
    })()
    return () => {
      clearInterval(watchdog)
      ctrl.abort()
    }
  }, [started.id])

  const live = Boolean(state && LIVE_STATUSES.has(state.status))
  const over = Boolean(state && !live)
  useEffect(() => {
    if (over) saveLiveOnline(null)
  }, [over])
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

  // Clocks tick between Lichess's updates.
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [live])

  const say = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 3000)
  }

  const onMove = (move: { from: string; to: string; promotion?: string }) => {
    if (!yourTurn) return
    const uci = move.from + move.to + (move.promotion ?? '')
    if (!new Chess(line[lastPly].fen).moves({ verbose: true }).some((m) => m.lan === uci)) return
    setSent({ uci, after: confirmed.length })
    void sendMove(started.id, uci).then((problem) => {
      if (!problem) return
      setSent((p) => (p?.uci === uci ? null : p))
      // Most likely this page missed a move: catch up, then say what Lichess said.
      resync.current()
      say(`Lichess didn’t take that move (${problem}). The board is catching up: try again.`)
    })
  }

  const [book, setBook] = useState<OpeningBook | null>(null)
  useEffect(() => {
    void loadOpeningBook().then(setBook)
  }, [])
  const opening = useMemo(() => (book ? openingOf(book, line.slice(0, shownPly + 1)) : undefined), [book, line, shownPly])

  useMoveSounds(tree, shown, settings.soundVolume, !live && Boolean(state))

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
  const note = theirs?.marked ? <span className="player-note bad">Marked by Lichess</span> : theirAge != null && theirAge < NEW_ACCOUNT_DAYS ? <span className="player-note warn">New account</span> : null
  const cardFor = (c: Side) =>
    card === c && game && <PlayerCard facts={factsBy[c] ?? null} name={game[c].name} ageDays={daysOld(factsBy[c])} yours={c === you} onClose={() => setCard(null)} />

  const { account, username } = useAccount()
  const material = materialState(shown.fen)
  const clocks = state ? clockNow(state, now) : null
  const runningSide = state && live && state.moves.length >= 2 ? turn : null
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
        captured={material.captured[c]}
        advantage={material.advantage[c]}
        clock={
          ms != null && (
            <span className={`player-clock ${runningSide === c ? 'running' : ''} ${ms < 30000 ? 'low' : ''}`}>{formatClockFace(Math.max(0, ms) / 1000)}</span>
          )
        }
      />
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
          It’s called off before it starts: no result and no rating change.
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
          shapes={[]}
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
      </section>

      <aside className="panel play-panel">
        <div className="panel-card">
          <header className="play-panel-head">
            <div className="play-panel-title">
              <strong className={`play-status ${state && !live ? 'over' : ''}`} role="status">
                {status}
              </strong>
              <span className="play-opening muted">
                {game ? `Online · ${game.initial / 60000}+${game.increment / 1000} · ${game.rated ? 'rated' : 'casual'}` : 'Online'}
                {opening && shownPly > 0 ? ` · ${opening.name}` : ''}
              </span>
            </div>
            {!phone && gear}
          </header>
          <div className="panel-body">
            {phone ? (
              <MoveStrip tree={tree} currentId={shown.id} onSelect={(id) => showPly(line.findIndex((n) => n.id === id))} />
            ) : (
              <MoveList tree={tree} currentId={shown.id} onSelect={(id) => showPly(line.findIndex((n) => n.id === id))} report={null} emptyText="Your moves and your opponent’s appear here." />
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
          {state && !live ? (
            <div className="result-card">
              {result && (
                <button className="btn accent-btn" onClick={() => void review()} disabled={reviewing || confirmed.length < 2}>
                  {reviewing ? 'Getting the game…' : 'Review this game'}
                </button>
              )}
              <div className="result-more">
                {rematch ? (
                  <button className="btn ghost" onClick={() => rematch.ctrl.abort()}>
                    Cancel rematch
                  </button>
                ) : (
                  <button className={`btn ${incoming ? 'accent-btn' : 'ghost'}`} onClick={() => void askRematch()} disabled={!game}>
                    {incoming ? 'Accept rematch' : 'Rematch'}
                  </button>
                )}
                {incoming && !rematch && (
                  <button className="btn ghost" onClick={() => void declineChallenge(incoming.id).then(() => setIncoming(null))}>
                    Decline
                  </button>
                )}
              </div>
              <div className="result-more">
                <button className="btn ghost" onClick={onAgain}>
                  New opponent
                </button>
                <button className="btn ghost" onClick={onDone}>
                  Done
                </button>
              </div>
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
            <div className="play-actions play-tools">
              <button
                className={`ctrl ${offerFromYou ? 'active' : ''}`}
                onClick={() => void answerDraw(started.id, true).then((ok) => say(ok ? 'Draw offered' : 'Couldn’t offer a draw.'))}
                disabled={!live || offerFromYou || confirmed.length < 2}
                aria-label="Offer draw"
                title={offerFromYou ? 'Draw offered' : 'Offer draw'}
              >
                <span className="play-tool-half" aria-hidden>
                  ½
                </span>
              </button>
              {canAbort ? (
                <button className="ctrl" onClick={() => setConfirming('abort')} disabled={!state} aria-label="Abort" title="Abort: call the game off before it starts">
                  <ToolIcon name="abort" />
                </button>
              ) : (
                <button className="ctrl" onClick={() => setConfirming('resign')} disabled={!live} aria-label="Resign" title="Resign">
                  <ToolIcon name="resign" />
                </button>
              )}
            </div>
          )}
          <div className="panel-strip">
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
    </main>
  )
}

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
