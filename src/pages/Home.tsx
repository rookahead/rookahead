import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ClassIcon } from '../components/ClassIcon'
import { GameTable } from '../components/GameTable'
import { MiniBoard } from '../components/MiniBoard'
import { PageHeader } from '../components/PageHeader'
import { UsernameForm } from '../components/UsernameForm'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { currentGame, formatDay } from '../lib/home'
import { loadMistakes, type MistakePuzzle } from '../lib/mistakes'
import { gameStats, SOURCE_LABEL, type MyGame } from '../lib/myGames'
import { dailyLine } from '../lib/puzzleData'
import { dayNumber, parsePuzzleLine, playerColor, positionAfter, type Puzzle } from '../lib/puzzles'
import { dayStreak, loadProgress } from '../lib/puzzleStore'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { readSession, requestLoadDialog } from '../lib/session'
import type { BoardTheme, Settings } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'
import { mainline, treeFromPgn } from '../lib/tree'
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
  const stats = useMemo(() => gameStats(games, reviews), [games, reviews])
  const current = useMemo(() => currentGame(readSession()), [])
  const puzzlesVersion = useStoreVersion('puzzles')
  const progress = useMemo(() => loadProgress(), [puzzlesVersion])
  const today = dayNumber(new Date())

  // Mistake puzzles come from every saved review; decoding them is async.
  const [mistakes, setMistakes] = useState<MistakePuzzle[] | null>(null)
  useEffect(() => {
    let live = true
    loadMistakes(progress.mistakesSolved).then((m) => live && setMistakes(m), () => live && setMistakes([]))
    return () => {
      live = false
    }
  }, [reviews, progress])

  const open = async (game: MyGame, review?: CachedReview) => {
    await openMyGame(game, review)
    onOpenAnalysis()
  }
  const loadGame = () => {
    requestLoadDialog()
    onOpenAnalysis()
  }

  const hasUsers = !!(users.chesscom || users.lichess)
  const firstVisit = games.length === 0 && !loading
  const importError = Object.values(errors).find(Boolean)
  const latest = games[0]
  const sources = [users.chesscom && 'Chess.com', users.lichess && 'Lichess'].filter(Boolean).join(' and ')
  const newSince = games.filter((g) => g.endedAt > Date.now() - 86400000).length

  return (
    <div className="home-page">
      <PageHeader phoneOnly avatar={avatar} />
      <main className="home">
        <div className="home-main">
          <div className="home-welcome">
            <h1>Welcome to Rookahead</h1>
            {!firstVisit && (
              <span>
                {loading && !games.length
                  ? 'Loading your games…'
                  : newSince
                    ? `${newSince} ${newSince === 1 ? 'game' : 'games'} in the last day${sources ? `, from ${sources}` : ''}`
                    : sources
                      ? `Your games from ${sources} and from playing here`
                      : 'Your games from playing here'}
              </span>
            )}
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
              <div className="home-card stat-card">
                <AccuracyRing value={stats.accuracy} />
                <strong>Avg accuracy</strong>
                <span>
                  {stats.accuracy == null ? 'No reviews yet' : 'Last 10 reviewed'}
                  {stats.trend != null && (
                    <>
                      {' · '}
                      <span className={stats.trend >= 0 ? 'up' : 'down'}>
                        {stats.trend >= 0 ? '+' : ''}
                        {stats.trend.toFixed(1)}
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div className="home-card stat-card">
                <b className="stat-number genius">{stats.genius}</b>
                <strong>Genius moves</strong>
                <span>This week</span>
              </div>
              <button className="home-card stat-card" onClick={() => navigate('/puzzles/mistakes')}>
                <b className="stat-number">{mistakes?.length ?? '–'}</b>
                <strong>Mistakes to fix</strong>
                <span>From your games</span>
              </button>
              <button className="home-card stat-card" onClick={() => navigate('/puzzles')}>
                <b className="stat-number streak">{dayStreak(progress, today)}</b>
                <strong>Day streak</strong>
                <span>Puzzles{progress.days?.best ? ` · best ${progress.days.best}` : ''}</span>
              </button>
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
              <GameTable games={games.slice(0, SHOWN)} reviews={reviews} onOpen={(g, r) => void open(g, r)} />
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
          <button className="home-card quick-card" onClick={() => navigate('/analysis')}>
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

/** Average accuracy as a ring that fills to the number. */
function AccuracyRing({ value }: { value: number | null }) {
  const c = 2 * Math.PI * 26
  return (
    <svg className="accuracy-ring" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="26" className="ring-track" />
      {value != null && <circle cx="32" cy="32" r="26" className="ring-fill" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 32 32)" />}
      <text x="32" y="37" textAnchor="middle">
        {value == null ? '–' : value.toFixed(1)}
      </text>
    </svg>
  )
}

/** The newest game, big: its final position and one button to review it. */
function LatestCard({ game, review, theme, onOpen, className = '' }: { game: MyGame; review?: CachedReview; theme: BoardTheme; onOpen: () => void; className?: string }) {
  const final = useMemo(() => {
    try {
      const line = mainline(treeFromPgn(game.pgn).tree)
      const last = line[line.length - 1]
      return { fen: last.fen, lastMove: last.uci ? ([last.uci.slice(0, 2), last.uci.slice(2, 4)] as [string, string]) : undefined }
    } catch {
      return null
    }
  }, [game.pgn])
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
