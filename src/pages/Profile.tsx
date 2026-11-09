import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { GameDays, GameDaysSkeleton, GameLines, GameLinesSkeleton, HomeGames, HomeGamesSkeleton, QualityKey } from '../components/HomeGames'
import { IconTile } from '../components/IconTile'
import { Link } from '../components/Link'
import { OpenGameDialog } from '../components/LoadGameDialog'
import { PageHeader } from '../components/PageHeader'
import { Skel } from '../components/Skeleton'
import { AvatarFace, Gear } from '../components/UserCard'
import { UsernameForm } from '../components/UsernameForm'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { useSettled } from '../hooks/useSettled'
import { ACCOUNTS_ENABLED, openAccountPage, useAccount } from '../lib/account'
import type { Color } from '../lib/evaluation'
import { byOpening } from '../lib/gameRecord'
import { gameDays } from '../lib/homeGames'
import { SOURCE_LABEL, type GameSource, type MyGame } from '../lib/myGames'
import { LOAD_GAME_EVENT } from '../lib/nav'
import { PHASES, phaseAccuracy, phaseMoves, type Phase } from '../lib/phases'
import { perfsFor, perfStats, type Perf, type RatingPoint, type Results } from '../lib/profile'
import { loadProgress, type PuzzleProgress } from '../lib/puzzleStore'
import { SPRINT_MODES, type SprintMode } from '../lib/puzzles'
import type { CachedReview } from '../lib/reviewCache'
import { navigate, usePathname } from '../lib/router'
import type { Settings } from '../lib/settings'
import { decodeSaved, type SharedGame } from '../lib/share'
import { useStoreVersion } from '../lib/syncBus'

const PAGE = 40
/** A phone shows a few at a time, so it has a much shorter list to draw before the page can open. */
const PHONE_PAGE = 15
const MONTH_MS = 30 * 86400000
/** Reviewed games a rating's accuracy by phase is read from. */
const PHASE_GAMES = 20

type Tab = 'overview' | 'games' | 'stats'
type Show = 'all' | 'unreviewed' | MyGame['result']
type SourceFilter = 'all' | GameSource
/** Where a rating comes from on the Stats tab: Rookahead (online play through Lichess, our puzzles, the computer) or Chess.com. */
type StatsSource = 'rookahead' | 'chesscom'

const PUZZLES = 'puzzles'

/** /profile, /profile/games (or the old /games), /profile/stats. */
const tabFor = (path: string): Tab => (/\/stats\/?$/.test(path) ? 'stats' : /games\/?$/.test(path) ? 'games' : 'overview')
const TABS: Tab[] = ['overview', 'games', 'stats']
const TAB_PATH: Record<Tab, string> = { overview: '/profile', games: '/profile/games', stats: '/profile/stats' }

const matches = (g: MyGame, s: Show, reviews: Record<string, CachedReview>) => (s === 'all' ? true : s === 'unreviewed' ? !reviews[g.key] : g.result === s)
const pct = (n: number, of: number) => `${Math.round((n / Math.max(1, of)) * 100)}%`
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const day = (ms: number) => SHORT_DATE.format(ms)

/** How far a rating moved in the last 30 days, or across its line when it doesn't go back that far. */
function recentChange(points: RatingPoint[], now = Date.now()): { change: number; since: number } | null {
  if (points.length < 2) return null
  const last = points[points.length - 1]
  const then = [...points].reverse().find((p) => p.at <= now - MONTH_MS)
  const from = then ?? points[0]
  return { change: last.rating - from.rating, since: from.at }
}

interface Props {
  /** It stays mounted: whether it's the page on screen. */
  active: boolean
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  onOpenAnalysis: () => void
  onOpenSettings: () => void
}

/**
 * Your profile, seen only by you: who you are, your ratings on Rookahead (online play goes through Lichess, so those
 * are your Lichess ratings, and our puzzles), and three tabs: an overview of the rating you pick with your latest
 * games, every game wherever it was played, and the stats for each rating, Chess.com's kept apart as history.
 */
export function ProfilePage({ active, settings, updateSettings, onOpenAnalysis, onOpenSettings }: Props) {
  const users = { chesscom: settings.chesscomUser, lichess: settings.lichessUser }
  const { games, reviews, loading, errors } = useMyGames(users, active)
  const busy = useSettled(loading && !games.length)
  const phone = useMediaQuery('(max-width: 1000px)')
  const tab = tabFor(usePathname())
  // The tab before: the new one slides in from the side it's on.
  const [was, setWas] = useState({ tab, dir: '' })
  if (was.tab !== tab) setWas({ tab, dir: TABS.indexOf(tab) > TABS.indexOf(was.tab) ? 'from-right' : 'from-left' })
  const puzzlesVersion = useStoreVersion('puzzles')
  const puzzles = useMemo(() => loadProgress(), [puzzlesVersion])

  const online = useMemo(() => perfsFor(games, 'lichess'), [games])
  const chesscom = useMemo(() => perfsFor(games, 'chesscom'), [games])
  const computer = useMemo(() => perfsFor(games, 'rookahead'), [games])
  const ratings = online.filter((p) => p.rating != null)
  const [picked, setPicked] = useState<string | null>(null)
  // What you picked, while it's still there; else your most played online rating, else puzzles.
  const all = [...online, ...computer, ...chesscom]
  const perf = all.find((p) => p.id === picked) ?? null
  const selected = perf ? perf.id : picked === PUZZLES ? PUZZLES : (ratings[0]?.id ?? PUZZLES)
  const shown = perf ?? all.find((p) => p.id === selected) ?? null

  const open = async (game: MyGame, review?: CachedReview) => {
    await openMyGame(game, review)
    onOpenAnalysis()
  }
  const [loadOpen, setLoadOpen] = useState(false)
  const loadGame = () => setLoadOpen(true)
  // Phones: Load a game is the tab bar's button on this page (TabBar.tsx).
  useEffect(() => {
    window.addEventListener(LOAD_GAME_EVENT, loadGame)
    return () => window.removeEventListener(LOAD_GAME_EVENT, loadGame)
  }, [])
  const importError = Object.values(errors).find(Boolean)
  const none = games.length === 0 && !loading && !busy

  // Picking a rating on the Games tab shows its stats; on the others it stays put.
  const pick = (id: string) => {
    setPicked(id)
    if (tab === 'games') navigate(TAB_PATH.stats)
  }

  const bringIn = (
    <section className="home-card accent-card hero-card" aria-labelledby="games-hero">
      <h2 id="games-hero">Bring in your games</h2>
      <p>Add your Chess.com or Lichess username and your recent games show up here, ready to review.</p>
      <UsernameForm key={importError ?? ''} error={importError} onSaved={(site, name) => updateSettings(site === 'chesscom' ? { chesscomUser: name } : { lichessUser: name })} />
    </section>
  )

  let body
  if (tab === 'overview') {
    body = (
      <>
        {selected === PUZZLES ? <PuzzleCard progress={puzzles} /> : shown && <RatingCard perf={shown} pending={busy} />}
        {none ? (
          bringIn
        ) : (
          <section className="home-card games-card" aria-labelledby="my-games">
            {/* Home's own list: rows with boards on a computer, plain lines on a phone. */}
            {busy ? (
              phone ? <GameLinesSkeleton /> : <HomeGamesSkeleton />
            ) : phone ? (
              <GameLines games={games} reviews={reviews} error={importError} onOpen={(g, r) => void open(g, r)} />
            ) : (
              <HomeGames games={games} reviews={reviews} theme={settings.boardTheme} error={importError} onOpen={(g, r) => void open(g, r)} />
            )}
          </section>
        )}
      </>
    )
  } else if (tab === 'games') {
    body = none ? bringIn : <GamesCard games={games} reviews={reviews} busy={busy} phone={phone} error={importError} theme={settings.boardTheme} onOpen={(g, r) => void open(g, r)} />
  } else {
    const source: StatsSource = selected.startsWith('chesscom:') ? 'chesscom' : 'rookahead'
    const chips: { id: string; label: string }[] =
      source === 'chesscom' ? chesscom.map((p) => ({ id: p.id, label: p.label })) : [...online.map((p) => ({ id: p.id, label: p.label })), { id: PUZZLES, label: 'Puzzles' }, ...computer.map((p) => ({ id: p.id, label: p.label }))]
    body = (
      <>
        <div className="profile-stats-head">
          {chesscom.length > 0 && (
            <div className="segmented profile-sources" role="radiogroup" aria-label="Where from">
              {(['rookahead', 'chesscom'] as const).map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={source === s}
                  className={source === s ? 'active' : ''}
                  onClick={() => source !== s && setPicked(s === 'chesscom' ? chesscom[0].id : (ratings[0]?.id ?? PUZZLES))}
                >
                  {s === 'chesscom' ? 'Chess.com' : 'Rookahead'}
                </button>
              ))}
            </div>
          )}
          <div className="filter-chips" role="radiogroup" aria-label="Rating">
            {chips.map((c) => (
              <button key={c.id} role="radio" aria-checked={selected === c.id} className={`filter-chip all ${selected === c.id ? 'on' : ''}`} onClick={() => setPicked(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {source === 'chesscom' && <p className="profile-history">Your Chess.com games, kept as history. Ratings on Rookahead come from playing here.</p>}
        {selected === PUZZLES ? <PuzzleStats progress={puzzles} /> : shown ? <PerfStatsView perf={shown} reviews={reviews} /> : busy ? <StatsSkeleton /> : bringIn}
      </>
    )
  }

  const loadDialog = <OpenGameDialog open={loadOpen} onClose={() => setLoadOpen(false)} settings={settings} updateSettings={updateSettings} onOpenAnalysis={onOpenAnalysis} />

  // Phones have no room for the list under your card and ratings: All games is a page of its own, just the list.
  if (phone && tab === 'games')
    return (
      <div className="home-page">
        <PageHeader phoneOnly back="/profile" phoneTitle="Games" phoneSub={games.length ? `${games.length} games` : undefined} />
        <main className="profile games-page profile-games-full">{body}</main>
        {loadDialog}
      </div>
    )

  return (
    <div className="home-page">
      {/* Phones: this is the You tab, and its settings are behind the gear. */}
      <PageHeader phoneOnly>
        <Link to="/settings" className="icon-btn profile-gear" aria-label="Settings" title="Settings">
          <Gear />
        </Link>
      </PageHeader>
      <main className="profile games-page">
        <ProfileCard tab={tab} games={games.length} users={users} onLinked={onOpenSettings} />
        <div className="profile-cols">
          <aside className="profile-side" aria-label="Ratings">
            <RatingsCard
              ratings={ratings}
              puzzles={puzzles}
              selected={selected}
              pending={busy}
              hasLichess={!!users.lichess.trim()}
              onPick={pick}
              onLinked={onOpenSettings}
            />
            {!phone && (
              <button className="home-card quick-card" onClick={loadGame}>
                <IconTile tone="review" size="big" />
                <span className="quick-lines">
                  <strong>Load a game</strong>
                  <small>Paste a PGN or a game link</small>
                </span>
                <span className="quick-go" aria-hidden>
                  ›
                </span>
              </button>
            )}
          </aside>
          <div key={tab} className={`profile-main ${was.dir}`} role="tabpanel" aria-label={tab === 'overview' ? 'Overview' : tab === 'games' ? 'Games' : 'Stats'}>
            {body}
          </div>
        </div>
      </main>
      {loadDialog}
    </div>
  )
}

/** You, the accounts your games come from, and the page's tabs. */
function ProfileCard({ tab, games, users, onLinked }: { tab: Tab; games: number; users: { chesscom: string; lichess: string }; onLinked: () => void }) {
  const { status, account, username } = useAccount()
  const signedIn = status === 'signed-in' && account
  const name = username ?? (signedIn ? account.name : status === 'loading' ? 'Signing in…' : 'Guest')
  const linked = (['lichess', 'chesscom'] as const).filter((s) => users[s].trim())
  // The underline sits under the tab picked and slides to the next one (the tabs aren't all one width).
  const bar = useRef<HTMLElement>(null)
  const counted = games > 0
  const [ink, setInk] = useState<{ left: number; width: number; moved: boolean } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const active = bar.current?.querySelector<HTMLElement>('.profile-tab.active')
      if (active) setInk((was) => ({ left: active.offsetLeft, width: active.offsetWidth, moved: was != null }))
    }
    place()
    const watch = new ResizeObserver(place)
    if (bar.current) watch.observe(bar.current)
    return () => watch.disconnect()
  }, [tab, counted])
  return (
    <section className="home-card profile-card" aria-label="You">
      <div className="profile-who">
        <span className={`user-avatar profile-avatar ${signedIn || status === 'loading' ? '' : 'guest'}`} aria-hidden>
          <AvatarFace account={account} />
        </span>
        <div className="profile-name">
          <h1>{name}</h1>
          <p>{signedIn ? 'Only you see this page' : 'Your games and puzzles on this device'}</p>
          {/* With none yet, the page's Bring in your games card asks for them. */}
          {linked.length > 0 && (
            <p className="profile-linked">
              {linked.map((s) => (
                <span key={s} className="profile-site">
                  {SOURCE_LABEL[s]} <b>{users[s]}</b>
                </span>
              ))}
              <button className="link-btn" onClick={onLinked}>
                Change
              </button>
            </p>
          )}
        </div>
        {signedIn ? (
          <button className="btn ghost profile-edit" onClick={() => navigate('/settings/profile')}>
            Edit profile
          </button>
        ) : (
          ACCOUNTS_ENABLED &&
          status === 'guest' && (
            <div className="profile-edit profile-guest-actions">
              <button className="btn primary" onClick={() => openAccountPage('signup')}>
                Sign up
              </button>
              <button className="btn ghost" onClick={() => openAccountPage('login')}>
                Log in
              </button>
            </div>
          )
        )}
      </div>
      <nav ref={bar} className="profile-tabs" role="tablist" aria-label="Profile">
        {ink && <span className={`profile-tabs-ink ${ink.moved ? 'moves' : ''}`} aria-hidden style={{ '--x': `${ink.left}px`, '--w': `${ink.width}px` } as CSSProperties} />}
        {TABS.map((t) => (
          <Link key={t} to={TAB_PATH[t]} role="tab" aria-selected={tab === t} className={`profile-tab ${tab === t ? 'active' : ''}`}>
            {t === 'overview' ? 'Overview' : t === 'games' ? 'Games' : 'Stats'}
            {t === 'games' && games > 0 && <span className="profile-tab-count">{games}</span>}
          </Link>
        ))}
      </nav>
    </section>
  )
}

/** Your ratings on Rookahead: online (your Lichess ratings, one per speed you play) and puzzles. Pick one to see it. */
function RatingsCard({
  ratings,
  puzzles,
  selected,
  pending,
  hasLichess,
  onPick,
  onLinked,
}: {
  ratings: Perf[]
  puzzles: PuzzleProgress
  selected: string
  pending: boolean
  hasLichess: boolean
  onPick: (id: string) => void
  onLinked: () => void
}) {
  return (
    <section className="home-card profile-ratings" aria-labelledby="ratings-head">
      <h2 id="ratings-head">Ratings</h2>
      <ul>
        {pending && hasLichess && !ratings.length ? (
          <li>
            <span className="profile-rating">
              <span className="profile-rating-text">
                <Skel w="64px" h="14px" />
                <Skel w="96px" h="11px" />
              </span>
              <Skel w="44px" h="18px" />
            </span>
          </li>
        ) : (
          ratings.map((p) => {
            const moved = recentChange(p.points)
            return (
              <li key={p.id}>
                <button className={`profile-rating ${selected === p.id ? 'on' : ''}`} aria-pressed={selected === p.id} onClick={() => onPick(p.id)}>
                  <span className="profile-rating-text">
                    <strong>{p.label}</strong>
                    <small>
                      Online · {p.games.length} {p.games.length === 1 ? 'game' : 'games'}
                    </small>
                  </span>
                  <span className="profile-rating-value">
                    <b>{p.rating}</b>
                    {moved && moved.change !== 0 && <small className={moved.change > 0 ? 'up' : 'down'}>{signed(moved.change)}</small>}
                  </span>
                </button>
              </li>
            )
          })
        )}
        {!hasLichess && (
          <li>
            <button className="profile-rating add" onClick={onLinked}>
              <span className="profile-rating-text">
                <strong>Online</strong>
                <small>Add your Lichess username</small>
              </span>
              <span className="profile-rating-value" aria-hidden>
                ›
              </span>
            </button>
          </li>
        )}
        <li>
          <button className={`profile-rating ${selected === PUZZLES ? 'on' : ''}`} aria-pressed={selected === PUZZLES} onClick={() => onPick(PUZZLES)}>
            <span className="profile-rating-text">
              <strong>Puzzles</strong>
              <small>{puzzles.solved} solved</small>
            </span>
            <span className="profile-rating-value">
              <b>{Math.round(puzzles.rating)}</b>
            </span>
          </button>
        </li>
      </ul>
      <p className="profile-note">Online ratings are your Lichess ratings: games you play online here count there too.</p>
    </section>
  )
}

/** A rating's line through your games, with where it is now and how far it moved. */
function RatingCard({ perf, pending = false }: { perf: Perf; pending?: boolean }) {
  const moved = recentChange(perf.points)
  const site = perf.source === 'lichess' ? 'Online, on Lichess' : perf.source === 'chesscom' ? 'On Chess.com' : 'Against the computer'
  if (perf.rating == null) return null
  const high = Math.max(...perf.points.map((p) => p.rating))
  const low = Math.min(...perf.points.map((p) => p.rating))
  return (
    <section className="home-card rating-card" aria-labelledby="rating-head">
      <header className="rating-card-head">
        <span>
          <h2 id="rating-head">{perf.label} rating</h2>
          <small>
            {site} · {perf.points.length} rated {perf.points.length === 1 ? 'game' : 'games'}
          </small>
        </span>
        <span className="rating-card-now">
          <b>{perf.rating}</b>
          {moved && (
            <small className={moved.change > 0 ? 'up' : moved.change < 0 ? 'down' : ''}>
              {signed(moved.change)} since {day(moved.since)}
            </small>
          )}
        </span>
      </header>
      {perf.points.length > 1 ? (
        <>
          <RatingGraph points={perf.points} />
          <p className="rating-card-range">
            <span>
              High <b>{high}</b>
            </span>
            <span>
              Low <b>{low}</b>
            </span>
          </p>
        </>
      ) : (
        !pending && <p className="rating-card-empty">Your line starts after a few more rated {perf.label.toLowerCase()} games.</p>
      )}
    </section>
  )
}

const GRAPH_W = 600
const GRAPH_H = 150

/** Your rating after each game as one line, with the game under the pointer marked. */
function RatingGraph({ points }: { points: RatingPoint[] }) {
  const [at, setAt] = useState<number | null>(null)
  const ratings = points.map((p) => p.rating)
  const hi = Math.max(...ratings)
  const lo = Math.min(...ratings)
  // A flat line sits in the middle; otherwise the range fills the height with a little room above and below.
  const span = hi - lo || 20
  const top = hi + span * 0.12
  const bottom = lo - span * 0.12
  const x = (i: number) => (i / (points.length - 1)) * GRAPH_W
  const y = (r: number) => ((top - r) / (top - bottom)) * GRAPH_H
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.rating).toFixed(1)}`).join('')
  const area = `${line}L${GRAPH_W} ${GRAPH_H}L0 ${GRAPH_H}Z`
  const grid = [hi, Math.round((hi + lo) / 2), lo].filter((v, i, a) => a.indexOf(v) === i)
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setAt(Math.round(((e.clientX - box.left) / box.width) * (points.length - 1)))
  }
  const point = at != null ? points[Math.max(0, Math.min(points.length - 1, at))] : null
  const i = point ? points.indexOf(point) : 0
  return (
    <figure className="rating-graph">
      <div className="rating-graph-plot" onPointerMove={move} onPointerLeave={() => setAt(null)}>
        {grid.map((v) => (
          <span key={v} className="rating-graph-grid" style={{ top: `${(y(v) / GRAPH_H) * 100}%` }}>
            <small>{v}</small>
          </span>
        ))}
        <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} preserveAspectRatio="none" aria-hidden>
          <path className="rating-graph-area" d={area} />
          <path className="rating-graph-line" d={line} />
        </svg>
        {point && (
          <>
            <i className="rating-graph-dot" style={{ left: `${(x(i) / GRAPH_W) * 100}%`, top: `${(y(point.rating) / GRAPH_H) * 100}%` }} />
            <span className={`rating-graph-tip ${i > points.length / 2 ? 'left' : ''}`} style={{ left: `${(x(i) / GRAPH_W) * 100}%` }}>
              <b>{point.rating}</b> {day(point.at)}
            </span>
          </>
        )}
      </div>
      {/* All on one day, the dates would say it twice. */}
      {day(points[0].at) !== day(points[points.length - 1].at) && (
        <figcaption className="rating-graph-dates">
          <span>{day(points[0].at)}</span>
          <span>{day(points[points.length - 1].at)}</span>
        </figcaption>
      )}
    </figure>
  )
}

/** Your puzzle rating on the overview: no line yet (the puzzles keep only where it stands), so the numbers. */
function PuzzleCard({ progress }: { progress: PuzzleProgress }) {
  return (
    <section className="home-card rating-card" aria-labelledby="rating-head">
      <header className="rating-card-head">
        <span>
          <h2 id="rating-head">Puzzle rating</h2>
          <small>
            {progress.solved} solved of {progress.played} · best run {progress.bestStreak}
          </small>
        </span>
        <span className="rating-card-now">
          <b>{Math.round(progress.rating)}</b>
        </span>
      </header>
      <p className="rating-card-empty">
        <Link to="/puzzles" className="btn primary">
          Solve puzzles
        </Link>
      </p>
    </section>
  )
}

/** One rating's stats: how your games went, highlights, who you played, and what your reviews say. */
function PerfStatsView({ perf, reviews }: { perf: Perf; reviews: Record<string, CachedReview> }) {
  const stats = useMemo(() => perfStats(perf), [perf])
  const [side, setSide] = useState<'all' | Color>('all')
  const r = stats.results[side]
  const rated = perf.rating != null
  return (
    <>
      <RatingCard perf={perf} />
      <section className="home-card profile-stat-card" aria-labelledby="results-head">
        <header className="profile-stat-head">
          <h2 id="results-head">Results</h2>
          <div className="segmented" role="radiogroup" aria-label="Side">
            {(['all', 'white', 'black'] as const).map((s) => (
              <button key={s} role="radio" aria-checked={side === s} className={side === s ? 'active' : ''} onClick={() => setSide(s)}>
                {s === 'all' ? 'All games' : s === 'white' ? 'As White' : 'As Black'}
              </button>
            ))}
          </div>
        </header>
        <ResultsRow r={r} />
      </section>
      <div className="profile-stat-pair">
        <section className="home-card profile-stat-card" aria-labelledby="highlights-head">
          <h2 id="highlights-head">Highlights</h2>
          <ul className="stat-rows">
            {rated && stats.highest && (
              <li>
                <span>Highest rating</span>
                <b>{stats.highest.rating}</b>
                <small>{day(stats.highest.at)}</small>
              </li>
            )}
            {rated && stats.lowest && (
              <li>
                <span>Lowest rating</span>
                <b>{stats.lowest.rating}</b>
                <small>{day(stats.lowest.at)}</small>
              </li>
            )}
            <li>
              <span>Best win</span>
              <b>{stats.bestWin ? stats.bestWin.rating : '–'}</b>
              <small>{stats.bestWin?.name}</small>
            </li>
            <li>
              <span>Longest win streak</span>
              <b>{stats.winStreak}</b>
              <small />
            </li>
            <li>
              <span>Longest losing streak</span>
              <b>{stats.lossStreak}</b>
              <small />
            </li>
          </ul>
        </section>
        <section className="home-card profile-stat-card" aria-labelledby="opponents-head">
          <h2 id="opponents-head">{perf.source === 'rookahead' ? 'Average level' : 'Average opponent'}</h2>
          <ul className="stat-rows two">
            {(['all', 'win', 'draw', 'loss'] as const).map((k) => (
              <li key={k}>
                <span>{k === 'all' ? 'All games' : k === 'win' ? 'In wins' : k === 'draw' ? 'In draws' : 'In losses'}</span>
                <b>{stats.opponents[k] ?? '–'}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <ReviewsCard perf={perf} reviews={reviews} />
    </>
  )
}

/** Games, wins, draws and losses, each with its share, over one bar. */
function ResultsRow({ r }: { r: Results }) {
  return (
    <div className="profile-results">
      <p className="profile-results-nums">
        <span>
          <b>{r.games}</b>
          <small>{r.games === 1 ? 'game' : 'games'}</small>
        </span>
        <span className="result-dot win">
          <b>{r.won}</b>
          <small>won · {pct(r.won, r.games)}</small>
        </span>
        <span className="result-dot">
          <b>{r.drawn}</b>
          <small>drawn · {pct(r.drawn, r.games)}</small>
        </span>
        <span className="result-dot loss">
          <b>{r.lost}</b>
          <small>lost · {pct(r.lost, r.games)}</small>
        </span>
      </p>
      <span className="result-bar profile-results-bar" aria-hidden>
        {r.won > 0 && <i className="win" style={{ flexGrow: r.won }} />}
        {r.drawn > 0 && <i className="draw" style={{ flexGrow: r.drawn }} />}
        {r.lost > 0 && <i className="loss" style={{ flexGrow: r.lost }} />}
      </span>
    </div>
  )
}

// Accuracy by phase means replaying the reviewed games; kept per set of reviews, so the tab opens with it next time.
const phasesRead = new Map<string, Record<Phase, number | null>>()

/** Your accuracy by phase over a rating's latest reviewed games, read one game at a time; undefined while it's read. */
function usePhases(points: { game: MyGame; review: CachedReview }[]): Record<Phase, number | null> | undefined {
  const key = points.map((p) => `${p.game.key}:${p.review.at}`).join()
  const [read, setRead] = useState<{ key: string; value: Record<Phase, number | null> }>()
  useEffect(() => {
    if (phasesRead.has(key)) return
    let live = true
    void (async () => {
      const games: { game: SharedGame; color: Color }[] = []
      for (const p of points) {
        const game = await decodeSaved(p.review.token)
        if (!live) return
        if (!game) continue
        phaseMoves(game, p.game.color)
        games.push({ game, color: p.game.color })
        await new Promise((next) => setTimeout(next))
        if (!live) return
      }
      const value = phaseAccuracy(games)
      phasesRead.set(key, value)
      setRead({ key, value })
    })()
    return () => {
      live = false
    }
  }, [key])
  return phasesRead.get(key) ?? (read?.key === key ? read.value : undefined)
}

const PHASE_LABEL: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }

/** What your reviews of a rating's games say: your accuracy, by phase, and how your openings went. */
function ReviewsCard({ perf, reviews }: { perf: Perf; reviews: Record<string, CachedReview> }) {
  const reviewed = useMemo(() => perf.games.flatMap((game) => (reviews[game.key] ? [{ game, review: reviews[game.key] }] : [])), [perf, reviews])
  const accuracies = reviewed.flatMap((p) => p.review.accuracy[p.game.color] ?? [])
  const accuracy = accuracies.length ? accuracies.reduce((s, a) => s + a, 0) / accuracies.length : null
  const latest = useMemo(() => reviewed.slice(0, PHASE_GAMES), [reviewed])
  const phases = usePhases(latest)
  const openings = useMemo(() => byOpening(perf.games, 5), [perf])
  return (
    <section className="home-card profile-stat-card" aria-labelledby="reviews-head">
      <header className="profile-stat-head">
        <h2 id="reviews-head">From your reviews</h2>
        <small>
          {reviewed.length} of {perf.games.length} reviewed
        </small>
      </header>
      {reviewed.length ? (
        <div className="profile-phases">
          <span>
            <small>Accuracy</small>
            <b>{accuracy != null ? accuracy.toFixed(1) : '–'}</b>
          </span>
          {PHASES.map((p) => (
            <span key={p}>
              <small>{PHASE_LABEL[p]}</small>
              <b>{phases === undefined ? <Skel w="40px" h="18px" /> : phases[p] != null ? phases[p]!.toFixed(1) : '–'}</b>
            </span>
          ))}
        </div>
      ) : (
        <p className="profile-stat-empty">Review a few of these games and your accuracy shows here, by phase of the game.</p>
      )}
      {openings.length > 0 && (
        <table className="profile-openings">
          <thead>
            <tr>
              <th>Opening</th>
              <th>Games</th>
              <th>Win rate</th>
            </tr>
          </thead>
          <tbody>
            {openings.map((o) => (
              <tr key={o.key}>
                <td>
                  {o.label}
                  <small> as {o.color === 'white' ? 'White' : 'Black'}</small>
                </td>
                <td>{o.games}</td>
                <td>{pct(o.won, o.games)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/** Your puzzle numbers: the rating, how many you've solved, your runs, and your Sprint bests. */
function PuzzleStats({ progress }: { progress: PuzzleProgress }) {
  const failed = progress.played - progress.solved
  return (
    <>
      <PuzzleCard progress={progress} />
      <div className="profile-stat-pair">
        <section className="home-card profile-stat-card" aria-labelledby="puzzle-results-head">
          <h2 id="puzzle-results-head">Rated puzzles</h2>
          <ul className="stat-rows">
            <li>
              <span>Tried</span>
              <b>{progress.played}</b>
              <small />
            </li>
            <li>
              <span>Solved</span>
              <b>{progress.solved}</b>
              <small>{pct(progress.solved, progress.played)}</small>
            </li>
            <li>
              <span>Failed</span>
              <b>{failed}</b>
              <small>{pct(failed, progress.played)}</small>
            </li>
            <li>
              <span>Mistakes from your games solved</span>
              <b>{progress.mistakesSolved.length}</b>
              <small />
            </li>
          </ul>
        </section>
        <section className="home-card profile-stat-card" aria-labelledby="puzzle-runs-head">
          <h2 id="puzzle-runs-head">Highlights</h2>
          <ul className="stat-rows">
            <li>
              <span>Longest run</span>
              <b>{progress.bestStreak}</b>
              <small>now {progress.streak}</small>
            </li>
            <li>
              <span>Most days in a row</span>
              <b>{progress.days?.best ?? 0}</b>
              <small>now {progress.days?.count ?? 0}</small>
            </li>
            {(Object.keys(SPRINT_MODES) as SprintMode[]).map((m) => (
              <li key={m}>
                <span>Sprint, {SPRINT_MODES[m].label}</span>
                <b>{progress.sprintBest[m] ?? '–'}</b>
                <small />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

function StatsSkeleton() {
  return (
    <section className="home-card profile-stat-card skel-group" aria-busy aria-label="Loading your stats">
      <Skel w="120px" h="18px" />
      <Skel w="100%" h="40px" />
    </section>
  )
}

/** Every game in one list, newest first and grouped by day, the way Home lists them; chips to narrow it. */
function GamesCard({
  games,
  reviews,
  busy,
  phone,
  error,
  theme,
  onOpen,
}: {
  games: MyGame[]
  reviews: Record<string, CachedReview>
  busy: boolean
  phone: boolean
  error?: string
  theme: Settings['boardTheme']
  onOpen: (game: MyGame, review?: CachedReview) => void
}) {
  const [show, setShow] = useState<Show>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const pageSize = phone ? PHONE_PAGE : PAGE
  const [shown, setShown] = useState(pageSize)
  const narrowed = useMemo(() => games.filter((g) => source === 'all' || g.source === source), [games, source])
  const filtered = useMemo(() => narrowed.filter((g) => matches(g, show, reviews)), [narrowed, show, reviews])
  // Filtered, a day's heading counts the games that match, and leaves out a rating the other games moved too.
  const narrow = show !== 'all' || source !== 'all'
  // In the list's deps: left open overnight, Today has become Yesterday.
  const today = new Date().toDateString()
  const days = useMemo(
    () => gameDays(filtered.slice(0, shown), narrow ? filtered : games).map((d) => (narrow ? { ...d, rating: null } : d)),
    [filtered, shown, games, narrow, today],
  )
  const count = (s: Show) => narrowed.filter((g) => matches(g, s, reviews)).length
  const sources = (['lichess', 'chesscom', 'rookahead'] as const).filter((s) => games.some((g) => g.source === s))
  const reset = () => setShown(pageSize)

  const chip = (id: Show, label: string) => (
    <button
      key={id}
      role="radio"
      aria-checked={show === id}
      className={`filter-chip ${id === 'all' || id === 'unreviewed' ? 'all' : id} ${show === id ? 'on' : ''}`}
      onClick={() => {
        setShow(id)
        reset()
      }}
    >
      {label}
      {id !== 'all' && !phone && <span className="filter-count">{count(id)}</span>}
    </button>
  )

  if (busy)
    return (
      <section className="home-card games-card skel-group" aria-busy aria-label="Loading your games">
        <header className="home-card-head games-toolbar">
          <span className="filter-chips">
            {[44, 118, 74, 84, 76].map((w, i) => (
              <Skel key={i} w={`${w}px`} h="30px" className="skel-pill" />
            ))}
          </span>
        </header>
        <GameDaysSkeleton rows={8} />
      </section>
    )

  return (
    <section className="home-card games-card" aria-labelledby="games-head">
      {/* Where from in a row of its own, so the chips' changing counts below never move it. */}
      <header className="home-card-head profile-games-head">
        <h2 id="games-head">Games</h2>
        <span className="profile-games-count">{narrowed.length}</span>
        {sources.length > 1 && (
          <div className="segmented profile-games-where" role="radiogroup" aria-label="Where from">
            {(['all', ...sources] as const).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={source === s}
                className={source === s ? 'active' : ''}
                onClick={() => {
                  setSource(s)
                  reset()
                }}
              >
                {s === 'all' ? 'Everywhere' : s === 'lichess' ? 'Online' : s === 'rookahead' ? 'Computer' : SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="home-card-head games-toolbar">
        <div className="filter-chips" role="radiogroup" aria-label="Show">
          {chip('all', 'All')}
          {chip('unreviewed', phone ? 'To review' : 'Not reviewed')}
          {chip('win', phone ? 'Won' : 'Wins')}
          {chip('loss', phone ? 'Lost' : 'Losses')}
          {chip('draw', phone ? 'Drawn' : 'Draws')}
        </div>
      </div>
      {error && <p className="games-error">{error}</p>}
      {days.length ? (
        <GameDays days={days} reviews={reviews} theme={theme} onOpen={onOpen} />
      ) : (
        <div className="games-empty">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />
          </svg>
          <p>
            <strong>{show === 'unreviewed' ? 'Every one of these games is reviewed' : 'No games match'}</strong>
            <span>Try another filter, or All.</span>
          </p>
        </div>
      )}
      {filtered.length > shown && (
        <button className="btn ghost games-older" onClick={() => setShown((n) => n + pageSize)}>
          Show older games
        </button>
      )}
      {filtered.slice(0, shown).some((g) => reviews[g.key]) && <QualityKey />}
    </section>
  )
}
