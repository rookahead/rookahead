import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ClassIcon } from '../components/ClassIcon'
import { GameList } from '../components/GameList'
import { MiniBoard } from '../components/MiniBoard'
import { PageHeader } from '../components/PageHeader'
import { UsernameForm } from '../components/UsernameForm'
import { useMistakes } from '../hooks/useMistakes'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { useAccount } from '../lib/account'
import { currentGame, formatDay, greeting, nudge } from '../lib/home'
import type { MistakePuzzle } from '../lib/mistakes'
import { finalPosition, gameStats, SOURCE_LABEL, type MyGame } from '../lib/myGames'
import { dailyLine } from '../lib/puzzleData'
import { dayNumber, parsePuzzleLine, playerColor, positionAfter, type Puzzle } from '../lib/puzzles'
import { dayStreak, loadProgress } from '../lib/puzzleStore'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { readSession, requestLoadDialog } from '../lib/session'
import type { BoardTheme, Settings } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'
import { DayStreak } from './puzzles/shared'

const SHOWN = 6

interface Props {
  avatar?: ReactNode
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
export function HomePage({ avatar, settings, updateSettings, onOpenAnalysis }: Props) {
  const users = { chesscom: settings.chesscomUser, lichess: settings.lichessUser }
  const { games, reviews, loading, errors } = useMyGames(users)
  const account = useAccount()
  // Only the Rookahead username: the Google name would show first and then swap on every reload.
  const name = account.status === 'guest' ? null : account.username
  const stats = useMemo(() => gameStats(games, reviews), [games, reviews])
  const current = useMemo(() => currentGame(readSession()), [])
  const puzzlesVersion = useStoreVersion('puzzles')
  const progress = useMemo(() => loadProgress(), [puzzlesVersion])
  const today = dayNumber(new Date())

  const mistakes = useMistakes()

  const open = async (game: MyGame, review?: CachedReview, genius = false) => {
    await openMyGame(game, review, { genius })
    onOpenAnalysis()
  }
  const geniusGame = games.find((g) => g.key === stats.geniusKey)
  const loadGame = () => {
    requestLoadDialog()
    onOpenAnalysis()
  }

  const hasUsers = !!(users.chesscom || users.lichess)
  const firstVisit = games.length === 0 && !loading
  const importError = Object.values(errors).find(Boolean)
  const latest = games[0]
  const streak = dayStreak(progress, today)
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

  return (
    <div className="home-page">
      <PageHeader phoneOnly avatar={avatar} />
      <main className="home">
        <div className="home-main">
          <div className="home-welcome">
            <h1>{firstVisit && !name ? 'Welcome to Rookahead' : greeting(new Date().getHours(), name)}</h1>
            {!firstVisit && <span>{line}</span>}
          </div>

          {latest && (
            <div className="phone-first">
              <LatestCard game={latest} review={reviews[latest.key]} theme={settings.boardTheme} onOpen={() => void open(latest, reviews[latest.key])} />
            </div>
          )}

          {firstVisit ? (
            <section className="home-card accent-card hero-card" aria-labelledby="hero">
              <h2 id="hero">Review your games, free</h2>
              <p>Stockfish 19 grades every move, from Genius to Blunder. No limits, no sign-up needed.</p>
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
            <section className="stat-grid" aria-label="Your numbers">
              <StatCard tone="accuracy" label="Accuracy" empty="Not yet" value={stats.accuracy?.toFixed(1)} spark={stats.recent} onClick={() => navigate('/games')}>
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
                tone="genius"
                label="Genius moves"
                empty="None yet"
                value={stats.genius ? String(stats.genius) : undefined}
                onClick={geniusGame ? () => void open(geniusGame, reviews[geniusGame.key], true) : undefined}
              >
                {geniusGame ? 'This week · see it ›' : 'This week'}
              </StatCard>
              <StatCard
                tone="mistakes"
               
                label="Mistakes to fix"
                empty={mistakes ? 'All clear' : '–'}
                value={mistakes?.length ? String(mistakes.length) : undefined}
                onClick={() => navigate('/puzzles/mistakes')}
              >
                {mistakes?.length ? 'Practise them ›' : 'From your games'}
              </StatCard>
              <StatCard tone="streak" label="Day streak" empty="Start today" value={streak ? String(streak) : undefined} onClick={() => navigate('/puzzles')}>
                {streak ? `Puzzles${progress.days?.best ? ` · best ${progress.days.best}` : ''}` : 'Solve one puzzle'}
              </StatCard>
            </section>
          )}

          <section className="home-card games-card" aria-labelledby="my-games">
            <header className="home-card-head">
              <h2 id="my-games">My games</h2>
              {games.length > 0 && (
                <button className="link-btn see-all" onClick={() => navigate('/games')}>
                  All games ›
                </button>
              )}
            </header>
            {importError && hasUsers && !firstVisit && <p className="games-error">{importError}</p>}
            {games.length ? (
              <GameList games={games.slice(0, SHOWN)} reviews={reviews} theme={settings.boardTheme} onOpen={(g, r) => void open(g, r)} />
            ) : loading ? (
              <p className="games-loading">Loading your games…</p>
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
          {latest && <LatestCard className="desktop-first" game={latest} review={reviews[latest.key]} theme={settings.boardTheme} onOpen={() => void open(latest, reviews[latest.key])} />}
          <button className="home-card quick-card" onClick={() => navigate('/play')}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 4l14 8-14 8z" />
            </svg>
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
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
            </svg>
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
  tone: 'accuracy' | 'genius' | 'mistakes' | 'streak'
  label: string
  /** The number; left out, the card says `empty` in words instead of a lone "0". */
  value?: string
  empty: string
  spark?: number[]
  onClick?: () => void
  children: ReactNode
}

/** One of the four numbers: its label, the number (or words when there's nothing yet), a line of context. */
function StatCard({ tone, label, value, empty, spark, onClick, children }: StatCardProps) {
  const body = (
    <>
      <span className="stat-head">{label}</span>
      <span className="stat-row">
        {value ? <b className="stat-value">{value}</b> : <b className="stat-empty">{empty}</b>}
        {value && spark && <Sparkline values={spark} />}
      </span>
      <span className="stat-sub">{children}</span>
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

/** Today's puzzle: the position to solve, and whether it's done. Hidden until it loads (or if it can't). */
function DailyCard({ theme }: { theme: BoardTheme }) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  useEffect(() => {
    dailyLine().then(
      (l) => setPuzzle(parsePuzzleLine(l)),
      () => {},
    )
  }, [])
  const version = useStoreVersion('puzzles')
  const { done, days } = useMemo(() => {
    const progress = loadProgress()
    const today = dayNumber(new Date())
    return { done: progress.daily?.day === today ? progress.daily.result : undefined, days: dayStreak(progress, today) }
  }, [version])
  if (!puzzle) return null
  const color = playerColor(puzzle)
  const first = puzzle.moves[0]
  const open = () => navigate('/puzzles/daily')
  return (
    <section className="home-card daily-card" aria-labelledby="daily-puzzle">
      <header className="daily-head">
        <h2 id="daily-puzzle">
          Daily puzzle <span className="muted">{formatDay(Date.now() / 1000)}</span>
        </h2>
        <DayStreak days={days} />
      </header>
      <button className="daily-board" onClick={open} aria-label="Solve the daily puzzle">
        <MiniBoard fen={positionAfter(puzzle, [first]).fen()} orientation={color} theme={theme} lastMove={[first.slice(0, 2), first.slice(2, 4)]} />
      </button>
      <div className="daily-foot">
        <p>
          <strong>{color === 'white' ? 'White' : 'Black'} to play</strong>
          <span className="muted">
            {done === 'solved' ? 'Solved · next one tomorrow' : done === 'failed' ? 'Missed · next one tomorrow' : `Rated ${puzzle.rating}`}
          </span>
        </p>
        <button className={`btn small ${done ? 'ghost' : 'primary'}`} onClick={open}>
          {done ? 'See it' : 'Solve'}
        </button>
      </div>
    </section>
  )
}
