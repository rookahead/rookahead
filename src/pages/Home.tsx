import { useMemo, useState, type ReactNode } from 'react'
import { ClassIcon } from '../components/ClassIcon'
import { DailyCard } from '../components/DailyCard'
import { GameList } from '../components/GameList'
import { IconTile } from '../components/IconTile'
import { Link } from '../components/Link'
import { MiniBoard } from '../components/MiniBoard'
import { PageHeader } from '../components/PageHeader'
import { GameListSkeleton, LatestCardSkeleton, LegendaryRowSkeleton, Skel } from '../components/Skeleton'
import { UsernameForm } from '../components/UsernameForm'
import { useLegendaryMoves } from '../hooks/useLegendaryMoves'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useSettled } from '../hooks/useSettled'
import { useMistakes } from '../hooks/useMistakes'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount } from '../lib/account'
import { dismissedNudges, dismissNudge, pickGuestNudge } from '../lib/guestNudge'
import { currentGame, greeting, nudge } from '../lib/home'
import type { MistakePuzzle } from '../lib/mistakes'
import { sinceFor } from '../lib/legendary'
import { dayLabel, finalPosition, gameStats, SOURCE_LABEL, type MyGame } from '../lib/myGames'
import { localDayNumber } from '../lib/puzzles'
import { dayStreak, loadProgress } from '../lib/puzzleStore'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { readSession, requestLoadDialog } from '../lib/session'
import type { BoardTheme, Settings } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'
import { DayStreak } from './puzzles/shared'

const SHOWN = 6
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
  const current = useMemo(() => currentGame(readSession()), [])
  const puzzlesVersion = useStoreVersion('puzzles')
  const progress = useMemo(() => loadProgress(), [puzzlesVersion])
  const today = localDayNumber(new Date())
  const hour = new Date().getHours()
  const phone = useMediaQuery('(max-width: 1000px)')

  const mistakes = useMistakes()

  const open = async (game: MyGame, review?: CachedReview) => {
    await openMyGame(game, review)
    onOpenAnalysis()
  }
  const loadGame = () => {
    requestLoadDialog()
    onOpenAnalysis()
  }

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
  const heroOrStats = firstVisit ? (
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
  ) : (
    <section className="stat-grid" aria-label="Your numbers" aria-busy={waiting || mistakes === null}>
      <StatCard pending={waiting} tone="accuracy" label="Accuracy" empty="Not yet" value={stats.accuracy?.toFixed(1)} spark={stats.recent} onClick={() => navigate('/games')}>
        {stats.accuracy == null ? (
          'Review a game to see it'
        ) : stats.trend != null ? (
          <>
            <span className={stats.trend >= 0 ? 'up' : 'down'}>
              {stats.trend >= 0 ? '+' : ''}
              {stats.trend.toFixed(1)}
            </span>{' '}
            over your last 10
          </>
        ) : (
          'Your last 10 reviewed'
        )}
      </StatCard>
      <StatCard
        pending={waiting}
        tone="legendary"
        label="Legendary"
        empty="None yet"
        value={stats.legendary ? String(stats.legendary) : undefined}
        onClick={stats.legendaryAll ? () => navigate('/legendary') : undefined}
      >
        {stats.legendaryAll ? 'This week · see all ›' : 'This week'}
      </StatCard>
      <StatCard
        pending={waiting || mistakes === null}
        tone="mistakes"
        label="Mistakes to fix"
        empty="All clear"
        value={mistakes?.length ? String(mistakes.length) : undefined}
        onClick={() => navigate('/puzzles/mistakes')}
      >
        {mistakes?.length ? 'Practise them ›' : 'From your games'}
      </StatCard>
      <StatCard pending={waiting} tone="streak" label="Puzzle streak" empty="Start today" value={streak ? String(streak) : undefined} onClick={() => navigate('/puzzles')}>
        {streak ? `${streak === 1 ? 'Day' : 'Days'} in a row${progress.days?.best ? ` · best ${progress.days.best}` : ''}` : 'Solve one puzzle'}
      </StatCard>
    </section>
  )

  if (phone) {
    // Phones: one thing per card, most exciting first. Your latest game to review, your Legendary moves,
    // your accuracy beside your mistakes to fix, the mistakes themselves, then the daily puzzle that keeps
    // your streak. Playing, loading a game and the analysis board are the tab bar's job.
    return (
      <div className="home-page">
        <PageHeader phoneOnly>
          <Link to="/puzzles" className="home-streak" aria-label={streak ? `Puzzle streak: ${streak} ${streak === 1 ? 'day' : 'days'}` : 'Puzzles'}>
            <DayStreak days={streak} />
          </Link>
        </PageHeader>
        <main className="phone-home">
          <div className="phone-welcome">
            {name ? (
              <>
                <span>{greeting(hour).replace(/^Good (\w+)$/, 'Good $1,')}</span>
                <h1>{name}</h1>
              </>
            ) : (
              <h1>{firstVisit ? 'Welcome to Rookahead' : greeting(hour)}</h1>
            )}
            {waiting ? <Skel w="72%" h="15px" className="skel-gap" /> : !firstVisit && <p>{line}</p>}
          </div>
          {guestNudge}
          {firstVisit && heroOrStats}
          {waiting ? (
            <LatestCardSkeleton />
          ) : (
            latest && !firstVisit && <LatestCard game={latest} review={reviews[latest.key]} theme={settings.boardTheme} onOpen={() => void open(latest, reviews[latest.key])} />
          )}
          {!firstVisit && <LegendaryStrip pending={arriving} games={games} reviews={reviews} theme={settings.boardTheme} onOpenAnalysis={onOpenAnalysis} />}
          {!firstVisit && <FormCard pending={waiting} accuracy={stats.accuracy} trend={stats.trend} recent={stats.recent} mistakes={mistakes ? mistakes.length : null} />}
          {mistakes && mistakes.length > 0 && <MistakesCard mistakes={mistakes} theme={settings.boardTheme} />}
          <DailyCard theme={settings.boardTheme} />
        </main>
      </div>
    )
  }

  return (
    <div className="home-page">
      <PageHeader phoneOnly />
      <main className="home">
        <div className="home-main">
          <div className="home-welcome">
            <h1>{firstVisit && !name ? 'Welcome to Rookahead' : greeting(hour, name)}</h1>
            {waiting ? <Skel w="320px" h="14px" className="skel-gap" /> : !firstVisit && <span>{line}</span>}
          </div>

          {guestNudge}

          {heroOrStats}

          <section className="home-card games-card" aria-labelledby="my-games">
            <header className="home-card-head">
              <IconTile tone="games" />
              <h2 id="my-games">My games</h2>
              {games.length > 0 && (
                <button className="link-btn see-all" onClick={() => navigate('/games')}>
                  All games ›
                </button>
              )}
            </header>
            {importError && hasUsers && !firstVisit && <p className="games-error">{importError}</p>}
            {waiting ? (
              <GameListSkeleton rows={SHOWN} />
            ) : games.length ? (
              <GameList games={games.slice(0, SHOWN)} reviews={reviews} theme={settings.boardTheme} onOpen={(g, r) => void open(g, r)} />
            ) : loading ? (
              <GameListSkeleton rows={SHOWN} />
            ) : (
              <div className="games-empty">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M4 5h16M4 12h16M4 19h10" />
                </svg>
                <p>
                  <strong>Your games show up here, newest first</strong>
                  <span>From Chess.com, Lichess and games you play on Rookahead, each with your accuracy.</span>
                </p>
              </div>
            )}
          </section>

          {mistakes && mistakes.length > 0 && <MistakesCard mistakes={mistakes} theme={settings.boardTheme} />}
        </div>

        <aside className="home-side" aria-label="Start">
          {waiting ? <LatestCardSkeleton /> : latest && <LatestCard game={latest} review={reviews[latest.key]} theme={settings.boardTheme} onOpen={() => void open(latest, reviews[latest.key])} />}
          <button className="home-card quick-card" onClick={() => navigate('/play')}>
            <IconTile tone="play" size="big" />
            <span>
              <strong>Play the computer</strong>
              <small>8 levels, 400 to 2600, any time control</small>
            </span>
            <span className="quick-go" aria-hidden>
              ›
            </span>
          </button>
          <DailyCard theme={settings.boardTheme} />
          <PuzzlesCard rating={progress.rating} />
          <button className="home-card quick-card" onClick={() => navigate(current ? '/analysis' : '/board')}>
            <IconTile tone="analyze" size="big" />
            <span>
              <strong>{current ? 'Continue on the board' : 'Analysis board'}</strong>
              <small>{current ? `${current.title} · ${current.moves} ${current.moves === 1 ? 'move' : 'moves'}` : 'Any position, PGN or FEN'}</small>
            </span>
            <span className="quick-go" aria-hidden>
              ›
            </span>
          </button>
        </aside>
      </main>
    </div>
  )
}

/** Phones: your Legendary moves as a row of small boards to swipe through, or what they are when there are none yet. */
function LegendaryStrip({
  pending,
  games,
  reviews,
  theme,
  onOpenAnalysis,
}: {
  /** Your games are still on their way (not waiting for Home's placeholders to settle, so both settle together). */
  pending: boolean
  games: MyGame[]
  reviews: Record<string, CachedReview>
  theme: BoardTheme
  onOpenAnalysis: () => void
}) {
  const { moves, loading } = useLegendaryMoves(games, reviews)
  const busy = useSettled((pending || loading) && !moves.length)
  if (busy) return <LegendaryRowSkeleton />
  if (!moves.length)
    return (
      <section className="home-card legendary-teaser" aria-labelledby="legendary-strip">
        <ClassIcon cls="brilliant" size={36} />
        <div>
          <h2 id="legendary-strip">Find your Legendary moves</h2>
          <p>The rare sacrifice that only works because you saw further. Review a game and any you played collect here.</p>
        </div>
      </section>
    )
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

/** Phones: how you're playing. Your accuracy and where it's heading, beside the mistakes waiting to be fixed. */
function FormCard({ pending, accuracy, trend, recent, mistakes }: { pending: boolean; accuracy: number | null; trend: number | null; recent: number[]; mistakes: number | null }) {
  return (
    <section className="home-card form-card" aria-label="Your form" aria-busy={pending || mistakes === null}>
      <Link to="/games" className="stat-card accuracy">
        <span className="stat-head">
          <IconTile tone="accuracy" size="small" />
          Accuracy
        </span>
        {pending ? (
          <span className="stat-row">
            <span className="skel stat-skeleton" aria-label="Loading" />
          </span>
        ) : (
          <>
            <span className="stat-row">
              {accuracy != null ? <b className="stat-value">{accuracy.toFixed(1)}</b> : <b className="stat-empty">Not yet</b>}
              {accuracy != null && <Sparkline values={recent} />}
            </span>
            <span className="stat-sub">
              {accuracy == null ? (
                'Review a game to see it'
              ) : trend != null ? (
                <>
                  <span className={trend >= 0 ? 'up' : 'down'}>
                    {trend >= 0 ? '+' : ''}
                    {trend.toFixed(1)}
                  </span>{' '}
                  over your last 10
                </>
              ) : (
                'Your last 10 reviewed'
              )}
            </span>
          </>
        )}
      </Link>
      <Link to="/puzzles/mistakes" className="stat-card mistakes">
        <span className="stat-head">
          <IconTile tone="mistakes" size="small" />
          Mistakes to fix
        </span>
        {pending || mistakes === null ? (
          <span className="stat-row">
            <span className="skel stat-skeleton" aria-label="Loading" />
          </span>
        ) : (
          <>
            <span className="stat-row">{mistakes ? <b className="stat-value">{mistakes}</b> : <b className="stat-empty">All clear</b>}</span>
            <span className="stat-sub">{mistakes ? 'Practise them ›' : 'From your games'}</span>
          </>
        )}
      </Link>
    </section>
  )
}

/** A trend line through the values (oldest first), ending on a dot at the latest one. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const lo = Math.min(...values) - 2
  const hi = Math.max(...values) + 2
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * 70, 28 - ((v - lo) / (hi - lo)) * 24] as const)
  const [x, y] = pts[pts.length - 1]
  return (
    <svg className="stat-spark" viewBox="0 0 74 30" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')} />
      <circle cx={x} cy={y} r="3" />
    </svg>
  )
}

interface StatCardProps {
  /** Still loading: a placeholder where the number goes; the number fades in when it comes. */
  pending?: boolean
  tone: 'accuracy' | 'legendary' | 'mistakes' | 'streak'
  label: string
  /** The number; left out, the card says `empty` in words instead of a lone "0". */
  value?: string
  empty: string
  spark?: number[]
  onClick?: () => void
  children: ReactNode
}

const TILES = { accuracy: 'accuracy', legendary: 'legendary', mistakes: 'mistakes', streak: 'streak' } as const

/** One of the four numbers: its label, the number (or words when there's nothing yet), a line of context. */
function StatCard({ pending = false, tone, label, value, empty, spark, onClick, children }: StatCardProps) {
  // Only a number that was waited for fades in; one that's there from the start just shows.
  const [waited, setWaited] = useState(pending)
  if (pending && !waited) setWaited(true)
  const arrive = waited && !pending ? 'arrive' : ''
  const body = (
    <>
      <span className="stat-head">
        <IconTile tone={TILES[tone]} size="small" />
        <span className="stat-label">{label}</span>
      </span>
      {pending ? (
        <>
          <span className="stat-row">
            <span className="skel stat-skeleton" aria-label="Loading" />
          </span>
          <span className="skel stat-sub stat-skeleton-line" aria-hidden />
        </>
      ) : (
        <>
          <span className={`stat-row ${arrive}`}>
            {value ? <b className="stat-value">{value}</b> : <b className="stat-empty">{empty}</b>}
            {value && spark && <Sparkline values={spark} />}
          </span>
          <span className={`stat-sub ${arrive}`}>{children}</span>
        </>
      )}
    </>
  )
  return onClick ? (
    <button className={`home-card stat-card ${tone}`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={`home-card stat-card ${tone}`}>{body}</div>
  )
}

/** The newest game, big: its final position and one button to review it. */
function LatestCard({ game, review, theme, onOpen, className = '' }: { game: MyGame; review?: CachedReview; theme: BoardTheme; onOpen: () => void; className?: string }) {
  const final = finalPosition(game)
  const opponent = game.color === 'white' ? game.black : game.white
  const accuracy = review?.accuracy[game.color]
  return (
    <section className={`home-card accent-card latest-card ${className}`} aria-label="Your latest game">
      <div>
        <h2>{review ? 'Your latest game' : 'Review your latest game'}</h2>
        <p>
          {SOURCE_LABEL[game.source]} · {game.time} · {ago(game.endedAt)}
        </p>
      </div>
      <div className="latest-body">
        {final && (
          <div className="latest-board">
            <MiniBoard fen={final.fen} orientation={game.color} theme={theme} lastMove={final.lastMove} />
          </div>
        )}
        <div className="latest-text">
          <span className={`latest-result ${game.result}`}>{game.result === 'win' ? 'Won' : game.result === 'loss' ? 'Lost' : 'Draw'}</span>
          <strong>
            vs {opponent.name} {opponent.rating != null && <span className="muted-on-brand">{opponent.rating}</span>}
          </strong>
          <span className="muted-on-brand">
            You played {game.color === 'white' ? 'White' : 'Black'} · {game.moves} {game.moves === 1 ? 'move' : 'moves'}
            {game.opening ? ` · ${game.opening}` : ''}
          </span>
          {accuracy != null && <span className="latest-accuracy">{accuracy.toFixed(1)} accuracy</span>}
        </div>
      </div>
      <button className="btn accent-btn" onClick={onOpen}>
        {review ? 'Open the review' : 'Review this game'}
      </button>
      <button className="link-btn latest-more" onClick={() => navigate('/games')}>
        Pick another game ›
      </button>
    </section>
  )
}

const MISTAKE_KINDS = [
  ['blunder', 'blunders'],
  ['mistake', 'errors'],
  ['miss', 'oversights'],
] as const

/** "Learn from your mistakes": the first one on a board, the counts, and the way in. */
function MistakesCard({ mistakes, theme }: { mistakes: MistakePuzzle[]; theme: BoardTheme }) {
  const first = mistakes[0]
  const games = new Set(mistakes.map((m) => m.gameKey)).size
  return (
    <section className="home-card mistakes-card" aria-labelledby="mistakes">
      <button className="mistakes-board" onClick={() => navigate('/puzzles/mistakes')} aria-label="Practise your mistakes">
        <MiniBoard fen={first.fen} orientation={first.color} theme={theme} />
      </button>
      <div className="mistakes-text">
        <h2 id="mistakes">Learn from your mistakes</h2>
        <p>
          {mistakes.length} {mistakes.length === 1 ? 'position' : 'positions'} from {games} reviewed {games === 1 ? 'game' : 'games'} where a better move
          was there. Find it this time.
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
        <button className="btn primary mistakes-go" onClick={() => navigate('/puzzles/mistakes')}>
          Start practice
        </button>
      </div>
    </section>
  )
}

/** Puzzles at a glance: your rating and the ways in. */
function PuzzlesCard({ rating }: { rating: number }) {
  return (
    <section className="home-card puzzles-card" aria-labelledby="puzzles-card">
      <header>
        <IconTile tone="puzzles" />
        <h2 id="puzzles-card">Puzzles</h2>
        <span className="muted">Rating {Math.round(rating)}</span>
      </header>
      <div className="chip-row">
        <button className="chip" onClick={() => navigate('/puzzles')}>
          Rated
        </button>
        <button className="chip" onClick={() => navigate('/puzzles/sprint')}>
          Puzzle Sprint
        </button>
        <button className="chip" onClick={() => navigate('/puzzles/mistakes')}>
          Your mistakes
        </button>
      </div>
    </section>
  )
}
