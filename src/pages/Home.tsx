import { useEffect, useMemo, useState } from 'react'
import { ClassIcon } from '../components/ClassIcon'
import { DailyCard } from '../components/DailyCard'
import { HomeFooter } from '../components/HomeFooter'
import { FormStrip, PlanCard, PlanCardSkeleton, type AccuracyPoint } from '../components/HomeCards'
import { GameLines, GameLinesSkeleton, HomeGames, HomeGamesSkeleton } from '../components/HomeGames'
import { IconTile } from '../components/IconTile'
import { OpenGameDialog } from '../components/LoadGameDialog'
import { Link } from '../components/Link'
import { MiniBoard } from '../components/MiniBoard'
import { PageHeader } from '../components/PageHeader'
import { LegendaryRowSkeleton, Skel } from '../components/Skeleton'
import { UsernameForm } from '../components/UsernameForm'
import { useLegendaryMoves } from '../hooks/useLegendaryMoves'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { transitionsDone, useSettled } from '../hooks/useSettled'
import { useMistakes } from '../hooks/useMistakes'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount } from '../lib/account'
import type { Color } from '../lib/evaluation'
import { dismissedNudges, dismissNudge, pickGuestNudge } from '../lib/guestNudge'
import { greeting, nudge } from '../lib/home'
import { ratingLine } from '../lib/gameRecord'
import { sinceFor } from '../lib/legendary'
import { dayLabel, gameStats, type MyGame } from '../lib/myGames'
import { phaseMoves, weakestPhase, type Phase } from '../lib/phases'
import { localDayNumber } from '../lib/puzzles'
import { dayStreak, loadProgress } from '../lib/puzzleStore'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { decodeSaved, type SharedGame } from '../lib/share'
import type { BoardTheme, Settings } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'
import { DayStreak } from './puzzles/shared'

/** Reviewed games the accuracy bars show and your weakest phase is read from. */
const RECENT_GAMES = 10
/** The last reading of your weakest phase, and what it was read from. */
let phasesRead: { key: string; weakest: { phase: Phase; accuracy: number } | null; reviewed: number } | null = null

/** Your latest games, for the line under the greeting. */
const FORM_GAMES = 10
/** Legendary moves in Home's strip; the rest are a tap away. */
const STRIP = 8

interface Props {
  /** It stays mounted: whether it's the page on screen. */
  active: boolean
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  /** A game has been put in the session (or the Load dialog requested): show Analysis. */
  onOpenAnalysis: () => void
}

/** The home dashboard: your games from everywhere, your numbers, and the ways into review, puzzles and play. */
export function HomePage({ active, settings, updateSettings, onOpenAnalysis }: Props) {
  const users = { chesscom: settings.chesscomUser, lichess: settings.lichessUser }
  const { games, reviews, loading: importing, errors } = useMyGames(users, active)
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
  // Read again on coming back: puzzles solved meanwhile are in it.
  const progress = useMemo(() => loadProgress(), [puzzlesVersion, active])
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
  // Your weakest phase means replaying your last reviewed games. It's kept between visits, so Home opens with it;
  // new reviews read one game at a time after the page has arrived, so the page's animation never stalls for it.
  const phasesKey = points.map((p) => `${p.game.key}:${p.review.at}`).join()
  const [phases, setPhases] = useState(phasesRead)
  useEffect(() => {
    if (phasesRead?.key === phasesKey) return setPhases(phasesRead)
    let live = true
    void (async () => {
      await transitionsDone()
      const read: { game: SharedGame; color: Color }[] = []
      for (const p of points) {
        const game = await decodeSaved(p.review.token)
        if (!live) return
        if (!game) continue
        phaseMoves(game, p.game.color)
        read.push({ game, color: p.game.color })
        await new Promise((next) => setTimeout(next))
        if (!live) return
      }
      phasesRead = { key: phasesKey, weakest: weakestPhase(read), reviewed: read.length }
      setPhases(phasesRead)
    })()
    return () => {
      live = false
    }
  }, [points, phasesKey])
  const known = phases?.key === phasesKey ? phases : undefined

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
  const rating = useMemo(() => ratingLine(games), [games])
  const lastGames = games.slice(0, FORM_GAMES)
  const line =
    loading && !games.length
      ? 'Loading your games…'
      : nudge({
          mistakes: mistakes?.length ?? 0,
          streak,
          solvedToday: progress.days?.last === today,
          legendary: stats.legendary,
          ratingUp:
            rating && rating.change > 0 && (rating.over === 'month' || rating.points.length >= FORM_GAMES)
              ? { points: rating.change, time: rating.label.split(',')[0], over: rating.over === 'month' ? 'this month' : `over your last ${rating.points.length} games` }
              : null,
          trend: stats.trend,
          won: lastGames.filter((g) => g.result === 'win').length,
          played: lastGames.length,
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

  const latestReview = latest && reviews[latest.key]
  const openLatest = () => latest && void open(latest, reviews[latest.key])
  const hasReviews = Object.keys(reviews).length > 0
  const loadDialog = <OpenGameDialog open={loadOpen} onClose={() => setLoadOpen(false)} settings={settings} updateSettings={updateSettings} onOpenAnalysis={onOpenAnalysis} />

  const opponentOf = (g: MyGame) => (g.color === 'white' ? g.black : g.white).name
  // Phones: the page's one big card.
  const reviewStyle = phone ? 'accent-card game-review' : ''
  const reviewAction = waiting ? (
    <div className={`home-card quick-card skel-group ${reviewStyle}`} aria-busy aria-label="Loading your latest game">
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <Skel w="150px" h="16px" />
        <Skel w="200px" h="12px" />
      </span>
    </div>
  ) : latest ? (
    <button className={`home-card quick-card ${reviewStyle}`} onClick={openLatest}>
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <strong>{phone ? 'Game review' : 'Review latest game'}</strong>
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
    <button className={`home-card quick-card ${reviewStyle}`} onClick={loadGame}>
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <strong>{phone ? 'Game review' : 'Review a game'}</strong>
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

  const formStrip = (
    <FormStrip
      pending={waiting}
      accuracy={stats.accuracy}
      trend={stats.trend}
      recent={points.map((p) => p.accuracy)}
      progress={progress}
      weakest={known?.weakest}
      reviewed={known?.reviewed ?? 0}
      legendary={phone ? { all: stats.legendaryAll, week: stats.legendary } : undefined}
    />
  )
  // Whether Legendary moves are coming: from your games' reviews once the games are here, from any saved review
  // before that, and assumed while neither has come.
  const reviewList = Object.values(reviews)
  const legendaryExpected = games.length
    ? stats.legendaryAll > 0
    : reviewList.length
      ? reviewList.some((r) => r.brilliant.white + r.brilliant.black > 0)
      : arriving
  const legendaryRow = (
    <LegendaryStrip pending={arriving} expected={legendaryExpected} games={games} reviews={reviews} theme={settings.boardTheme} onOpenAnalysis={onOpenAnalysis} />
  )
  const gamesCard = (
    <section className="home-card games-card" aria-labelledby="my-games">
      {waiting || (loading && !games.length) ? (
        phone ? <GameLinesSkeleton /> : <HomeGamesSkeleton reviewed={hasReviews} />
      ) : games.length ? (
        phone ? (
          <GameLines games={games} reviews={reviews} error={hasUsers ? importError : undefined} onOpen={(g, r) => void open(g, r)} />
        ) : (
          <HomeGames games={games} reviews={reviews} theme={settings.boardTheme} error={hasUsers ? importError : undefined} onOpen={(g, r) => void open(g, r)} />
        )
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
  )
  const playAction = (
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
  )

  // Phones: beside the daily puzzle, your own mistakes while any are waiting, else more puzzles.
  const mistakesLeft = mistakes?.filter((m) => !progress.mistakesSolved.includes(m.id)).length ?? 0
  const practiseAction =
    mistakesLeft || (mistakes === null && hasReviews) ? (
      <button className="home-card quick-card" onClick={() => navigate('/puzzles/mistakes')}>
        <IconTile tone="mistakes" size="big" />
        <span className="quick-lines">
          <strong>Fix your mistakes</strong>
          <small>{mistakes === null ? 'Finding them' : `${mistakesLeft} waiting as puzzles`}</small>
        </span>
      </button>
    ) : (
      <button className="home-card quick-card" onClick={() => navigate('/puzzles/rated')}>
        <IconTile tone="puzzles" size="big" />
        <span className="quick-lines">
          <strong>Rated puzzles</strong>
          <small>Rating {progress.rating}</small>
        </span>
      </button>
    )

  if (phone) {
    // Phones: the desktop page's parts, kept to about a screen: your numbers, and the puzzle and the computer, are
    // rows you swipe, and your games plain lines. Play stays above the tabs. The site's links are in the You tab.
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
              </p>
            ) : (
              !firstVisit && <p>{line}</p>
            )}
          </div>
          {guestNudge}
          {firstVisit ? (
            <>
              {hero}
              <DailyCard compact theme={settings.boardTheme} />
            </>
          ) : (
            <>
              {reviewAction}
              {formStrip}
              {waiting ? (
                <PlanCardSkeleton compact />
              ) : (
                <PlanCard compact latest={latest} review={latestReview} games={games} mistakes={mistakes ? mistakes.length : null} progress={progress} onOpenLatest={openLatest} />
              )}
              <div className="phone-swipe" aria-label="Puzzles">
                <DailyCard compact theme={settings.boardTheme} />
                {practiseAction}
              </div>
              {gamesCard}
            </>
          )}
        </main>
        {loadDialog}
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
              {formStrip}
              {legendaryRow}
            </>
          )}

          {gamesCard}
        </div>

        <aside className="home-side" aria-label="Today">
          {!firstVisit &&
            (waiting ? (
              <PlanCardSkeleton steps={3 + (hasReviews ? 1 : 0)} />
            ) : (
              <PlanCard expectMistakes={hasReviews} latest={latest} review={latestReview} games={games} mistakes={mistakes ? mistakes.length : null} progress={progress} onOpenLatest={openLatest} />
            ))}
          {playAction}
          <DailyCard theme={settings.boardTheme} />
          {firstVisit && analysisAction}
        </aside>
        <HomeFooter />
      </main>
      {loadDialog}
    </div>
  )
}

/** Your Legendary moves as a row of small boards, or what they are when there are none yet. */
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
  // Only a row of moves on its way gets the row's placeholder: with none to find, the teaser shows at once.
  const busy = useSettled(expected && (pending || loading) && !moves.length)
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
