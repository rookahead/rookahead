import { useEffect, useMemo, useState } from 'react'
import { ClassIcon } from '../components/ClassIcon'
import { DailyCard } from '../components/DailyCard'
import { HomeFooter } from '../components/HomeFooter'
import { FormStrip, PlanCard, PlanCardSkeleton, type AccuracyPoint } from '../components/HomeCards'
import { HomeGames, HomeGamesSkeleton } from '../components/HomeGames'
import { IconTile } from '../components/IconTile'
import { OpenGameDialog } from '../components/LoadGameDialog'
import { Link } from '../components/Link'
import { MiniBoard } from '../components/MiniBoard'
import { PageHeader } from '../components/PageHeader'
import { LatestCardSkeleton, LegendaryRowSkeleton, MistakesCardSkeleton, Skel } from '../components/Skeleton'
import { UsernameForm } from '../components/UsernameForm'
import { useLegendaryMoves } from '../hooks/useLegendaryMoves'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useSettled } from '../hooks/useSettled'
import { useMistakes } from '../hooks/useMistakes'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount } from '../lib/account'
import { dismissedNudges, dismissNudge, pickGuestNudge } from '../lib/guestNudge'
import { greeting, nudge } from '../lib/home'
import type { MistakePuzzle } from '../lib/mistakes'
import { sinceFor } from '../lib/legendary'
import { dayLabel, finalPosition, gameStats, type MyGame } from '../lib/myGames'
import { weakestPhase, type Phase } from '../lib/phases'
import { localDayNumber } from '../lib/puzzles'
import { dayStreak, loadProgress } from '../lib/puzzleStore'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { decodeSaved } from '../lib/share'
import type { BoardTheme, Settings } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'
import { DayStreak } from './puzzles/shared'

/** Reviewed games the accuracy bars show and your weakest phase is read from. */
const RECENT_GAMES = 10
/** Legendary moves in Home's row on a phone; the rest are a tap away. */
const STRIP = 8

interface Props {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  /** A game has been put in the session (or the Load dialog requested): show Analysis. */
  onOpenAnalysis: () => void
}

/** "2 hours ago", "Yesterday"… */
function ago(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

/** The home dashboard: your games from everywhere, your numbers, and the ways into review, puzzles and play. */
export function HomePage({ settings, updateSettings, onOpenAnalysis }: Props) {
  const users = { chesscom: settings.chesscomUser, lichess: settings.lichessUser }
  const { games, reviews, loading: importing, errors } = useMyGames(users)
  const account = useAccount()
  // Just signed in on a device with nothing yet: your games are on their way down, so wait for them
  // rather than showing the empty welcome for a moment.
  const restoring = !games.length && (account.status === 'loading' || (account.status === 'signed-in' && account.sync === 'syncing'))
  const loading = importing || restoring
  // The numbers wait for your games, so they don't show "Not yet" and then change a moment later. When
  // they come, the placeholders turn into them (useSettled).
  const arriving = loading && !games.length
  const waiting = useSettled(arriving)
  // Only the Rookahead username: the Google name would show first and then swap on every reload.
  const name = account.status === 'guest' ? null : account.username
  const stats = useMemo(() => gameStats(games, reviews), [games, reviews])
  const puzzlesVersion = useStoreVersion('puzzles')
  const progress = useMemo(() => loadProgress(), [puzzlesVersion])
  const today = localDayNumber(new Date())
  const hour = new Date().getHours()
  const phone = useMediaQuery('(max-width: 1000px)')

  const mistakes = useMistakes()

  // Your latest reviewed games, oldest first: the accuracy bars, and your weakest phase.
  const points = useMemo<AccuracyPoint[]>(
    () =>
      games
        .flatMap((game) => {
          const review = reviews[game.key]
          const accuracy = review?.accuracy[game.color]
          return review && accuracy != null ? [{ game, review, accuracy }] : []
        })
        .slice(0, RECENT_GAMES)
        .reverse(),
    [games, reviews],
  )
  // Undefined while the reviews are read.
  const [weakest, setWeakest] = useState<{ phase: Phase; accuracy: number } | null>()
  const [phaseGames, setPhaseGames] = useState(0)
  useEffect(() => {
    // Phones don't show it.
    if (phone) return
    let live = true
    void Promise.all(points.map(async (p) => ({ game: await decodeSaved(p.review.token), color: p.game.color }))).then((decoded) => {
      const read = decoded.flatMap((d) => (d.game ? [{ game: d.game, color: d.color }] : []))
      if (!live) return
      setWeakest(weakestPhase(read))
      setPhaseGames(read.length)
    })
    return () => {
      live = false
    }
  }, [points, phone])

  const open = async (game: MyGame, review?: CachedReview) => {
    await openMyGame(game, review)
    onOpenAnalysis()
  }
  const [loadOpen, setLoadOpen] = useState(false)
  const loadGame = () => setLoadOpen(true)

  const hasUsers = !!(users.chesscom || users.lichess)
  const firstVisit = games.length === 0 && !loading && !waiting
  const importError = Object.values(errors).find(Boolean)
  const latest = games[0]
  const streak = dayStreak(progress, today)
  const [dismissed, setDismissed] = useState(dismissedNudges)
  const saveNudge =
    ACCOUNTS_ENABLED && account.status === 'guest' ? pickGuestNudge({ streak, reviews: Object.keys(reviews).length, dismissed }) : null
  const line =
    loading && !games.length
      ? 'Loading your games…'
      : nudge({
          unreviewed: latest && !reviews[latest.key] ? { opponent: (latest.color === 'white' ? latest.black : latest.white).name, endedAt: latest.endedAt } : undefined,
          mistakes: mistakes?.length ?? 0,
          streak,
          solvedToday: progress.days?.last === today,
          trend: stats.trend,
          hasGames: games.length > 0,
        })

  const guestNudge = saveNudge && (
    <section className="save-nudge" aria-label="Save your progress">
      <span className="save-nudge-icon" aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9zM12 15V10M9.5 12.5 12 10l2.5 2.5" />
        </svg>
      </span>
      <span className="save-nudge-text">
        <strong>{saveNudge.title}</strong>
        <span>{saveNudge.text}</span>
      </span>
      <button className="btn accent-btn save-nudge-cta" onClick={() => openAccountPage('signup')}>
        Sign up
      </button>
      <button
        className="icon-btn save-nudge-close"
        aria-label="Not now"
        title="Not now"
        onClick={() => {
          dismissNudge(saveNudge.kind)
          setDismissed(dismissedNudges())
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </section>
  )
  const hero = (
    <section className="home-card accent-card hero-card" aria-labelledby="hero">
      <h2 id="hero">Review your games, free</h2>
      <p>Stockfish 19 grades every move, from Legendary to Blunder. No limits, no sign-up needed.</p>
      <UsernameForm
        key={importError ?? ''}
        error={hasUsers ? importError : undefined}
        onSaved={(site, name) => updateSettings(site === 'chesscom' ? { chesscomUser: name } : { lichessUser: name })}
      />
      <p className="hero-alt">
        Or{' '}
        <button className="link-btn" onClick={loadGame}>
          paste a PGN
        </button>
      </p>
    </section>
  )

  // Whether the phone's Legendary row has moves to show: from your games' reviews once the games are here, from
  // any saved review before that, and assumed while neither has come.
  const reviewList = Object.values(reviews)
  const legendaryExpected = games.length
    ? stats.legendaryAll > 0
    : reviewList.length
      ? reviewList.some((r) => r.brilliant.white + r.brilliant.black > 0)
      : arriving
  const latestReview = latest && reviews[latest.key]
  const openLatest = () => latest && void open(latest, reviews[latest.key])
  const hasReviews = Object.keys(reviews).length > 0
  // Your mistakes come from reading your reviews, after the rest: a placeholder holds their place meanwhile.
  const mistakesCard =
    mistakes === null ? hasReviews && <MistakesCardSkeleton /> : mistakes.length > 0 && <MistakesCard mistakes={mistakes} theme={settings.boardTheme} />
  const loadDialog = <OpenGameDialog open={loadOpen} onClose={() => setLoadOpen(false)} settings={settings} updateSettings={updateSettings} onOpenAnalysis={onOpenAnalysis} />

  if (phone) {
    // Phones: what to do today, all on the first screen. Your latest game, today's plan as one row and the
    // daily puzzle, then your Legendary moves and your mistakes when you have some. Your numbers are in the You
    // tab; playing, loading a game and the analysis board are the tab bar's job.
    return (
      <div className="home-page">
        <PageHeader phoneOnly>
          <Link to="/puzzles" className="home-streak" aria-label={streak ? `Puzzle streak: ${streak} ${streak === 1 ? 'day' : 'days'}` : 'Puzzles'}>
            <DayStreak days={streak} />
          </Link>
        </PageHeader>
        <main className="phone-home">
          <div className={`phone-welcome ${firstVisit ? 'first' : ''}`}>
            {name ? (
              <>
                <span>{greeting(hour).replace(/^Good (\w+)$/, 'Good $1,')}</span>
                <h1>{name}</h1>
              </>
            ) : (
              <h1>{firstVisit ? 'Welcome to Rookahead' : greeting(hour)}</h1>
            )}
            {waiting ? (
              <p className="skel-lines">
                <span className="skel-line">
                  <Skel w="88%" h="13px" />
                </span>
                <span className="skel-line">
                  <Skel w="40%" h="13px" />
                </span>
              </p>
            ) : (
              !firstVisit && <p>{line}</p>
            )}
          </div>
          {guestNudge}
          {firstVisit && hero}
          {waiting ? (
            <LatestCardSkeleton />
          ) : (
            latest && !firstVisit && <LatestCard game={latest} review={reviews[latest.key]} theme={settings.boardTheme} onOpen={() => void open(latest, reviews[latest.key])} />
          )}
          {waiting && <PlanCardSkeleton compact />}
          {!waiting && !firstVisit && (
            <PlanCard compact latest={latest} review={latestReview} games={games} mistakes={mistakes ? mistakes.length : null} progress={progress} onOpenLatest={openLatest} />
          )}
          <DailyCard compact theme={settings.boardTheme} />
          {!firstVisit && <LegendaryStrip pending={arriving} expected={legendaryExpected} games={games} reviews={reviews} theme={settings.boardTheme} onOpenAnalysis={onOpenAnalysis} />}
          {mistakesCard}
          <HomeFooter />
        </main>
        {loadDialog}
      </div>
    )
  }

  const opponentOf = (g: MyGame) => (g.color === 'white' ? g.black : g.white).name
  const reviewAction = waiting ? (
    <div className="home-card quick-card skel-group" aria-busy aria-label="Loading your latest game">
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <Skel w="150px" h="16px" />
        <Skel w="200px" h="12px" />
      </span>
    </div>
  ) : latest ? (
    <button className="home-card quick-card" onClick={openLatest}>
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <strong>Review latest game</strong>
        <small>
          vs {opponentOf(latest)} ·{' '}
          {latestReview
            ? `${latestReview.accuracy[latest.color]?.toFixed(1) ?? '–'} accuracy`
            : `${latest.result === 'win' ? 'won' : latest.result === 'loss' ? 'lost' : 'drawn'}, ${latest.moves} ${latest.moves === 1 ? 'move' : 'moves'}`}
        </small>
      </span>
      <span className="quick-go" aria-hidden>
        ›
      </span>
    </button>
  ) : (
    <button className="home-card quick-card" onClick={loadGame}>
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <strong>Review a game</strong>
        <small>Paste a PGN or a game link</small>
      </span>
      <span className="quick-go" aria-hidden>
        ›
      </span>
    </button>
  )
  const analysisAction = (
    <button className="home-card quick-card" onClick={() => navigate('/board')}>
      <IconTile tone="analyze" size="big" />
      <span className="quick-lines">
        <strong>Analysis board</strong>
        <small>Any position, PGN or FEN</small>
      </span>
      <span className="quick-go" aria-hidden>
        ›
      </span>
    </button>
  )

  return (
    <div className="home-page">
      <PageHeader phoneOnly />
      <main className="home">
        <div className="home-main">
          <div className="home-welcome">
            <h1>{firstVisit && !name ? 'Welcome to Rookahead' : greeting(hour, name)}</h1>
            {waiting ? (
              <span className="skel-line">
                <Skel w="320px" h="12px" />
              </span>
            ) : (
              !firstVisit && <span>{line}</span>
            )}
          </div>

          {guestNudge}

          {firstVisit && hero}

          {!firstVisit && (
            <>
              <div className="home-actions">
                {reviewAction}
                {analysisAction}
              </div>
              <FormStrip pending={waiting} accuracy={stats.accuracy} trend={stats.trend} recent={points.map((p) => p.accuracy)} progress={progress} weakest={weakest} reviewed={phaseGames} />
            </>
          )}

          <section className="home-card games-card" aria-labelledby="my-games">
            {waiting || (loading && !games.length) ? (
              <HomeGamesSkeleton reviewed={hasReviews} />
            ) : games.length ? (
              <HomeGames games={games} reviews={reviews} theme={settings.boardTheme} error={hasUsers ? importError : undefined} onOpen={(g, r) => void open(g, r)} />
            ) : (
              <>
                <header className="home-card-head">
                  <IconTile tone="games" />
                  <h2 id="my-games">My games</h2>
                </header>
                {importError && hasUsers && !firstVisit && <p className="games-error">{importError}</p>}
                <div className="games-empty">
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M4 5h16M4 12h16M4 19h10" />
                  </svg>
                  <p>
                    <strong>Your games show up here, newest first</strong>
                    <span>From Chess.com, Lichess and games you play on Rookahead, each with your accuracy.</span>
                  </p>
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="home-side" aria-label="Today">
          {!firstVisit &&
            (waiting ? (
              <PlanCardSkeleton steps={3 + (hasReviews ? 1 : 0)} />
            ) : (
              <PlanCard expectMistakes={hasReviews} latest={latest} review={latestReview} games={games} mistakes={mistakes ? mistakes.length : null} progress={progress} onOpenLatest={openLatest} />
            ))}
          <button className="home-card quick-card" onClick={() => navigate('/play')}>
            <IconTile tone="play" size="big" />
            <span className="quick-lines">
              <strong>Play the computer</strong>
              <small>8 levels, 400 to 2600, any time control</small>
            </span>
            <span className="quick-go" aria-hidden>
              ›
            </span>
          </button>
          <DailyCard theme={settings.boardTheme} />
          {firstVisit && analysisAction}
        </aside>
        <HomeFooter />
      </main>
      {loadDialog}
    </div>
  )
}

/** Phones: your Legendary moves as a row of small boards to swipe through, once you have some. */
function LegendaryStrip({
  pending,
  expected,
  games,
  reviews,
  theme,
  onOpenAnalysis,
}: {
  /** Your games are still on their way (not waiting for Home's placeholders to settle, so both settle together). */
  pending: boolean
  /** Your saved reviews count some Legendary moves (known at once, before the games are read for them). */
  expected: boolean
  games: MyGame[]
  reviews: Record<string, CachedReview>
  theme: BoardTheme
  onOpenAnalysis: () => void
}) {
  const { moves, loading } = useLegendaryMoves(games, reviews)
  // Only a row of moves on its way gets the row's placeholder.
  const busy = useSettled(expected && (pending || loading) && !moves.length)
  if (busy) return <LegendaryRowSkeleton />
  if (!moves.length) return null
  const week = moves.filter((m) => m.game.endedAt >= sinceFor('7d')).length
  return (
    <section className="home-card legendary-strip" aria-labelledby="legendary-strip">
      <header className="home-card-head">
        <h2 id="legendary-strip">
          <ClassIcon cls="brilliant" size={20} /> Legendary moves
        </h2>
        <Link to="/legendary" className="link-btn see-all">
          {week ? `${week} this week` : `${moves.length} in all`} ›
        </Link>
      </header>
      <ul className="legendary-row">
        {moves.slice(0, STRIP).map((m) => {
          const them = m.game.color === 'white' ? m.game.black : m.game.white
          return (
            <li key={m.id}>
              <button
                className="legendary-card"
                onClick={async () => {
                  await openMyGame(m.game, m.review, { ply: m.ply })
                  onOpenAnalysis()
                }}
              >
                <MiniBoard fen={m.fen} orientation={m.game.color} theme={theme} lastMove={[m.from, m.to]} grade="brilliant" label={`${m.label} against ${them.name}`} />
                <span className="legendary-meta">
                  <strong>{m.label}</strong>
                </span>
                <span className="legendary-vs">
                  vs {them.name} · {dayLabel(m.game.endedAt)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Phones: the newest game in a short card, a small board, three lines and one button to review it. */
function LatestCard({ game, review, theme, onOpen }: { game: MyGame; review?: CachedReview; theme: BoardTheme; onOpen: () => void }) {
  const final = finalPosition(game)
  const opponent = game.color === 'white' ? game.black : game.white
  const accuracy = review?.accuracy[game.color]
  const result = <span className={`latest-result ${game.result}`}>{game.result === 'win' ? 'Won' : game.result === 'loss' ? 'Lost' : 'Draw'}</span>
  return (
    <section className="home-card accent-card latest-card compact" aria-label="Your latest game">
      <div className="latest-body">
        {final && (
          <div className="latest-board">
            <MiniBoard fen={final.fen} orientation={game.color} theme={theme} lastMove={final.lastMove} />
          </div>
        )}
        <div className="latest-text">
          <span className="muted-on-brand">
            {review ? 'Your latest game' : 'Not reviewed yet'} · {ago(game.endedAt)}
          </span>
          <strong>
            {result} vs {opponent.name} {opponent.rating != null && <span className="muted-on-brand">{opponent.rating}</span>}
          </strong>
          <span className="muted-on-brand">
            {accuracy != null ? `${accuracy.toFixed(1)} accuracy · ` : ''}
            {game.moves} {game.moves === 1 ? 'move' : 'moves'} · {game.time}
          </span>
        </div>
      </div>
      <button className="btn accent-btn" onClick={onOpen}>
        {review ? 'Open the review' : 'Review this game'}
      </button>
    </section>
  )
}

const MISTAKE_KINDS = [
  ['blunder', 'blunders'],
  ['mistake', 'errors'],
  ['miss', 'oversights'],
] as const

/** Phones: "Learn from your mistakes", a small board with the first one beside the counts, the way in below. */
function MistakesCard({ mistakes, theme }: { mistakes: MistakePuzzle[]; theme: BoardTheme }) {
  const first = mistakes[0]
  const games = new Set(mistakes.map((m) => m.gameKey)).size
  return (
    <section className="home-card mistakes-card compact" aria-labelledby="mistakes">
      <div className="mistakes-row">
        <button className="mistakes-board" onClick={() => navigate('/puzzles/mistakes')} aria-label="Practise your mistakes">
          <MiniBoard fen={first.fen} orientation={first.color} theme={theme} />
        </button>
        <div className="mistakes-text">
          <h2 id="mistakes">Learn from your mistakes</h2>
          <p>
            {mistakes.length} {mistakes.length === 1 ? 'position' : 'positions'} from {games} {games === 1 ? 'game' : 'games'}
          </p>
          <div className="chip-row">
            {MISTAKE_KINDS.map(([cls, label]) => {
              const n = mistakes.filter((m) => m.cls === cls).length
              return n ? (
                <span key={cls} className="chip">
                  <ClassIcon cls={cls} size={14} /> {n} {label}
                </span>
              ) : null
            })}
          </div>
        </div>
      </div>
      <button className="btn primary mistakes-go" onClick={() => navigate('/puzzles/mistakes')}>
        Start practice
      </button>
    </section>
  )
}
