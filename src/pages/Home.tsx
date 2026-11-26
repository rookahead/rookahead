import { useEffect, useMemo, useRef, useState } from 'react'
import { DailyCard } from '../components/DailyCard'
import { HomeFooter } from '../components/HomeFooter'
import { HomeGrid, HomeTopTiles } from '../components/HomePlay'
import { FormStrip, PlanCard, PlanCardSkeleton, type AccuracyPoint } from '../components/HomeCards'
import { HomeWidgets, HomeWidgetsSkeleton, type WidgetData } from '../components/HomeWidgets'
import { GameLines, GameLinesSkeleton, HomeGames, HomeGamesSkeleton } from '../components/HomeGames'
import { IconTile } from '../components/IconTile'
import { LegendaryStrip } from '../components/LegendaryStrip'
import { OpenGameDialog } from '../components/LoadGameDialog'
import { Link } from '../components/Link'
import { PageHeader } from '../components/PageHeader'
import { Flame } from '../components/PuzzleIcons'
import { CoachFace } from '../components/CoachFace'
import { TypedLine } from '../components/TypedLine'
import { BatchCard, ReviewGamesDialog } from '../components/ReviewGamesDialog'
import { ScrollHandle } from '../components/ScrollHandle'
import { Skel } from '../components/Skeleton'
import { UsernameForm } from '../components/UsernameForm'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { transitionsDone, useSettled } from '../hooks/useSettled'
import { useMistakes } from '../hooks/useMistakes'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount } from '../lib/account'
import { MAX_BATCH, unreviewed, useBatchActive } from '../lib/batchReview'
import { tallyToday } from '../lib/dailyTally'
import type { Color } from '../lib/evaluation'
import { dismissedNudges, dismissNudge, pickGuestNudge } from '../lib/guestNudge'
import { greeting, nudges } from '../lib/home'
import { hasLegendary } from '../lib/legendary'
import { ratedSpeeds, ratingLine } from '../lib/gameRecord'
import { loadOnlineSetup } from '../lib/onlineSetup'
import { speedOf } from '../lib/speed'
import { gameStats, type MyGame } from '../lib/myGames'
import { phaseMoves, WEAKEST_MIN_REVIEWED, weakestPhase, type Phase } from '../lib/phases'
import { localDayNumber } from '../lib/puzzles'
import { setReviewBadge } from '../lib/reviewBadge'
import { dayStreak, loadProgress, visitStreak } from '../lib/puzzleStore'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { decodeSaved, type SharedGame } from '../lib/share'
import type { Settings } from '../lib/settings'
import { useStoreVersion } from '../lib/syncBus'
import { cleanWidgets } from '../lib/widgets'
import { DayStreak } from './puzzles/shared'

/** Reviewed games the accuracy bars show and your weakest phase is read from. */
const RECENT_GAMES = 10
/** The last reading of your weakest phase, and what it was read from. */
let phasesRead: { key: string; weakest: { phase: Phase; accuracy: number } | null; reviewed: number } | null = null

/** Your latest games, for the line under the greeting. */
const FORM_GAMES = 10

interface Props {
  /** It stays mounted: whether it's the page on screen. */
  active: boolean
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  /** A game has been put in the session (or the Load dialog requested): show Analysis. */
  onOpenAnalysis: () => void
}

/** How long one of the coach's lines stays before the next, ms. */
const LINE_MS = 20_000
/** Which line the coach said last, so the next visit opens on the one after it. */
const LINE_KEY = 'rookahead.homeLine'

/** The coach's turn through its lines: the next one each time Home opens, then a new one every LINE_MS while it's on screen. */
function useLineTurn(active: boolean) {
  const [turn, setTurn] = useState(() => Number(localStorage.getItem(LINE_KEY)) || 0)
  useEffect(() => {
    if (!active) return
    const next = () => {
      lastLineStep = Date.now()
      const t = (Number(localStorage.getItem(LINE_KEY)) || 0) + 1
      localStorage.setItem(LINE_KEY, String(t))
      setTurn(t)
    }
    // Once per visit, however many times the page wakes on the way in (with two lines, two steps would be none).
    if (Date.now() - lastLineStep > 2000) next()
    const timer = setInterval(() => document.visibilityState === 'visible' && next(), LINE_MS)
    return () => clearInterval(timer)
  }, [active])
  return turn
}

/** When the coach last moved on a line, ms. */
let lastLineStep = 0

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

  const open = async (game: MyGame, review?: CachedReview, ply?: number) => {
    await openMyGame(game, review, ply ? { ply } : undefined)
    onOpenAnalysis()
  }
  const [loadOpen, setLoadOpen] = useState(false)
  const loadGame = () => setLoadOpen(true)
  const [batchOpen, setBatchOpen] = useState(false)
  const batchActive = useBatchActive()
  // Desktop only: a long run is no use on a phone, so its card stays as it is there.
  const toReview = useMemo(() => (phone ? [] : unreviewed(games, reviews)), [phone, games, reviews])
  const several = toReview.length > 1
  // The sidebar's Game review counts this week's games not reviewed yet.
  useEffect(() => {
    const weekAgo = Date.now() - 7 * 86400000
    setReviewBadge(unreviewed(games, reviews).filter((g) => g.endedAt > weekAgo).length)
  }, [games, reviews])

  const hasUsers = !!(users.chesscom || users.lichess)
  const firstVisit = games.length === 0 && !loading && !waiting
  const importError = Object.values(errors).find(Boolean)
  const latest = games[0]
  const streak = dayStreak(progress, today)
  // Opening Home counts as today's visit (main.tsx notes it); at least 1.
  const visitDays = Math.max(1, visitStreak(progress, today))
  const [dismissed, setDismissed] = useState(dismissedNudges)
  const saveNudge =
    ACCOUNTS_ENABLED && account.status === 'guest' ? pickGuestNudge({ streak, reviews: Object.keys(reviews).length, dismissed }) : null
  const rating = useMemo(() => ratingLine(games), [games])
  const lastGames = games.slice(0, FORM_GAMES)
  const lineTurn = useLineTurn(active)
  // The right column scrolls by itself; its handle shows only while it moves.
  const side = useRef<HTMLElement>(null)
  const lines = nudges({
    mistakes: mistakes?.length ?? 0,
    streak,
    solvedToday: progress.days?.last === today,
    legendary: stats.legendary,
    ratingUp:
      rating && rating.change > 0 && (rating.over === 'week' || rating.points.length >= FORM_GAMES)
        ? { points: rating.change, time: rating.label.split(',')[0].toLowerCase(), over: rating.over === 'week' ? 'this week' : `over your last ${rating.points.length} games` }
        : null,
    trend: stats.trend,
    won: lastGames.filter((g) => g.result === 'win').length,
    played: lastGames.length,
    hasGames: games.length > 0,
  })
  const line = loading && !games.length ? 'Loading your games…' : lines[lineTurn % lines.length]

  const welcomeLine = firstVisit ? 'Welcome! Bring in your games and I’ll go through every move.' : line

  // Good news gets a smile; the rest is said plainly.
  const cheerful = !waiting && /^(You won|Up \d|Your accuracy is up|\d+ Legendary)/.test(line)

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
    <section className="home-card accent-card hero-card home-hero" aria-labelledby="hero">
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
  // No games yet: the goal to review one points at the box that brings them in.
  const addGames = () => document.querySelector<HTMLInputElement>('.hero-card input')?.focus()
  // With one game left to review, the card goes to that one, whether or not it's your latest.
  const next = toReview.length === 1 ? toReview[0] : latest
  const nextReview = next && reviews[next.key]
  const openNext = () => next && void open(next, reviews[next.key])
  const hasReviews = Object.keys(reviews).length > 0
  const loadDialog = (
    <>
      <OpenGameDialog open={loadOpen} onClose={() => setLoadOpen(false)} settings={settings} updateSettings={updateSettings} onOpenAnalysis={onOpenAnalysis} />
      {batchOpen && <ReviewGamesDialog games={games} reviews={reviews} settings={settings} onClose={() => setBatchOpen(false)} />}
    </>
  )

  const opponentOf = (g: MyGame) => (g.color === 'white' ? g.black : g.white).name
  // Phones: the page's one big card.
  const reviewCard = 'home-card quick-card accent-card game-review'
  const reviewAction = batchActive ? (
    <BatchCard />
  ) : waiting ? (
    <div className={`${reviewCard} skel-group`} aria-busy aria-label="Loading your latest game">
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <Skel w="150px" h="16px" />
        <Skel w="200px" h="12px" />
      </span>
    </div>
  ) : (
    <button className={reviewCard} onClick={next ? openNext : loadGame}>
      <IconTile tone="review" size="big" />
      <span className="quick-lines">
        <strong>Game review</strong>
        <small>
          {next
            ? `vs ${opponentOf(next)} · ${
                nextReview
                  ? `${nextReview.accuracy[next.color]?.toFixed(1) ?? '–'} accuracy`
                  : `${next.result === 'win' ? 'won' : next.result === 'loss' ? 'lost' : 'drawn'}, ${next.moves} ${next.moves === 1 ? 'move' : 'moves'}`
              }`
            : 'Paste a PGN or a game link'}
        </small>
      </span>
      <span className="quick-go" aria-hidden>
        ›
      </span>
    </button>
  )

  // Several games not reviewed: My games offers to review them in one go (not while a run is going).
  const reviewMany = several && !batchActive ? { count: toReview.length > MAX_BATCH ? `${MAX_BATCH}+` : `${toReview.length}`, review: () => setBatchOpen(true) } : undefined

  const formStrip = (
    <FormStrip
      pending={waiting}
      accuracy={stats.accuracy}
      trend={stats.trend}
      recent={points.map((p) => p.accuracy)}
      weakest={known?.weakest}
      reviewed={known?.reviewed ?? 0}
      legendary={{ all: stats.legendaryAll, week: stats.legendary }}
    />
  )
  const gamesCard = (
    <section className="home-card games-card" aria-labelledby="my-games">
      {waiting || (loading && !games.length) ? (
        phone ? <GameLinesSkeleton /> : <HomeGamesSkeleton />
      ) : games.length ? (
        phone ? (
          <GameLines games={games} reviews={reviews} error={hasUsers ? importError : undefined} onOpen={(g, r) => void open(g, r)} />
        ) : (
          <HomeGames games={games} reviews={reviews} error={hasUsers ? importError : undefined} onOpen={(g, r) => void open(g, r)} unreviewed={reviewMany} />
        )
      ) : (
        <>
          <header className="home-card-head">
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

  // Your latest Legendary moves, once a review has found one.
  const legendaryStrip = !waiting && hasLegendary(games, reviews) && (
    <LegendaryStrip games={games} reviews={reviews} theme={settings.boardTheme} onOpen={(m) => void open(m.game, m.review, m.ply)} />
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

  // What the widgets show (HomeWidgets): today's counts and your numbers.
  const widgets = cleanWidgets(settings.homeWidgets)
  const midnight = new Date().setHours(0, 0, 0, 0)
  // The play goal is for your time: the speed of the clock you last set up to play online (rapid or classical).
  const playSpeed = speedOf(loadOnlineSetup().clock, 'lichess')
  const widgetData: WidgetData = {
    reviews: tallyToday('review'),
    played: games.filter((g) => g.source === 'rookahead' && g.endedAt >= midnight && speedOf(g.time, g.source) === playSpeed).length,
    playSpeed,
    mistakesFixed: progress.today?.day === today ? progress.today.mistakes : 0,
    mistakesWaiting: mistakes ? mistakes.length : null,
    daily: progress.daily?.day === today ? progress.daily.result : undefined,
    ratingFor: (speed) => (speed ? ratingLine(games, undefined, speed) : rating),
    speeds: ratedSpeeds(games),
    weakest: known?.weakest,
    reviewed: known?.reviewed ?? 0,
    phaseNeeds: WEAKEST_MIN_REVIEWED - (known?.reviewed ?? 0),
  }

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
                <PlanCardSkeleton />
              ) : (
                <PlanCard latest={latest} review={latestReview} games={games} mistakes={mistakes ? mistakes.length : null} progress={progress} onOpenLatest={openLatest} />
              )}
              <div className="phone-swipe" aria-label="Puzzles">
                <DailyCard compact theme={settings.boardTheme} />
                {practiseAction}
              </div>
              {gamesCard}
              {legendaryStrip}
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
          {/* The greeting heads the middle column only: the right column runs the screen's height beside it. */}
          <header className="home-top">
            {/* The coach greets you, and says the one thing worth knowing today. */}
            <div className="home-coach">
              <span className="home-coach-face">
                <CoachFace happy={cheerful} moodKey={line} />
              </span>
              {/* One plain line: the coach's word for today, no headline over it. */}
              <div className="home-welcome">
                {waiting ? (
                  <span className="skel-line">
                    <Skel w="320px" h="14px" />
                  </span>
                ) : (
                  <h1 title={name ? greeting(hour, name) : undefined} aria-label={welcomeLine}>
                    <TypedLine text={welcomeLine} />
                  </h1>
                )}
              </div>
            </div>
            {/* Your visit streak, days in a row you've opened Rookahead (today counts), at the greeting's end. */}
            {!firstVisit && (
              <span className="home-streak-count lit" role="img" title={`${visitDays}-day streak: days in a row you've opened Rookahead`} aria-label={`Streak: ${visitDays} ${visitDays === 1 ? 'day' : 'days'} in a row`}>
                <Flame size={20} />
                <b>{visitDays}</b>
                {/* Pointed at: this week, a dot for each day, lit where you came. */}
                <span className="streak-week" aria-hidden>
                  {Array.from({ length: 7 }, (_, i) => (
                    <i key={i} className={progress.visits?.recent?.includes(today - 6 + i) ? 'lit' : ''} />
                  ))}
                </span>
              </span>
            )}
          </header>

          {guestNudge}

          {/* A first visit: the way to bring your games in heads the page; the rest is the page you'll have after. */}
          {firstVisit && hero}
          {batchActive && <BatchCard />}
          {/* Today's goals: what to do, across the middle column, under the greeting. */}
          {/* Your widgets: the goals and numbers you picked, in your order. */}
          {waiting ? <HomeWidgetsSkeleton /> : <HomeWidgets widgets={widgets} onChange={(homeWidgets) => updateSettings({ homeWidgets })} data={widgetData} onReview={next ? openNext : firstVisit ? addGames : loadGame} />}
          {gamesCard}
          {legendaryStrip}
        </div>

        <aside ref={side} className="home-side" aria-label="Today">
          {/* Your mistakes and puzzles, the coach and Cassie, then playing online. */}
          <HomeTopTiles mistakesWaiting={mistakes ? mistakes.filter((m) => !progress.mistakesSolved.includes(m.id)).length : null} mistakesFixed={progress.mistakesSolved.length} />
          <HomeGrid active={active} games={games} />
        </aside>
        <ScrollHandle target={side} />
        <HomeFooter />
      </main>
      {loadDialog}
    </div>
  )
}
