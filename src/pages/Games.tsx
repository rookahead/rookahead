import { useMemo, useState } from 'react'
import { OpeningsCard, RecordStrip, TimeControlsCard } from '../components/GamesCards'
import { GameDays, GameDaysSkeleton, QualityKey } from '../components/HomeGames'
import { IconTile } from '../components/IconTile'
import { Link } from '../components/Link'
import { PageHeader } from '../components/PageHeader'
import { Skel } from '../components/Skeleton'
import { UsernameForm } from '../components/UsernameForm'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { useSettled } from '../hooks/useSettled'
import { byOpening, byTimeControl, openingKey, ratingLine, results, timeKey } from '../lib/gameRecord'
import { gameDays } from '../lib/homeGames'
import { gameStats, SOURCE_LABEL, type GameSource, type MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'
import { requestLoadDialog } from '../lib/session'
import type { Settings } from '../lib/settings'

const PAGE = 40
/** Reviewed games the accuracy bars show. */
const RECENT_GAMES = 10

const LOAD_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
)

type Show = 'all' | 'unreviewed' | MyGame['result']
type SourceFilter = 'all' | GameSource
/** A time control or an opening picked on the right: only its games. */
type Picked = { kind: 'time' | 'opening'; key: string; label: string } | null

const matches = (g: MyGame, s: Show, reviews: Record<string, CachedReview>) => (s === 'all' ? true : s === 'unreviewed' ? !reviews[g.key] : g.result === s)

interface Props {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  onOpenAnalysis: () => void
  onOpenSettings: () => void
}

/** Every game in one list, newest first and grouped by day, wherever it was played; your record across them beside. */
export function GamesPage({ settings, updateSettings, onOpenAnalysis, onOpenSettings }: Props) {
  const users = { chesscom: settings.chesscomUser, lichess: settings.lichessUser }
  const { games, reviews, loading, errors } = useMyGames(users)
  // Placeholders until the games come, then they turn into them (useSettled).
  const busy = useSettled(loading && !games.length)
  const [show, setShow] = useState<Show>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [picked, setPicked] = useState<Picked>(null)
  const [shown, setShown] = useState(PAGE)
  const phone = useMediaQuery('(max-width: 1000px)')

  // The source and a picked group narrow the list; the chips' counts are of what's left.
  const narrowed = useMemo(
    () =>
      games.filter(
        (g) =>
          (source === 'all' || g.source === source) &&
          (!picked || (picked.kind === 'time' ? timeKey(g) : openingKey(g)) === picked.key),
      ),
    [games, source, picked],
  )
  const filtered = useMemo(() => narrowed.filter((g) => matches(g, show, reviews)), [narrowed, show, reviews])
  // Filtered, a day's heading counts the games that match, and leaves out a rating the other games moved too.
  const narrow = show !== 'all' || source !== 'all' || !!picked
  const days = useMemo(
    () => gameDays(filtered.slice(0, shown), narrow ? filtered : games).map((d) => (narrow ? { ...d, rating: null } : d)),
    [filtered, shown, games, narrow],
  )
  const count = (s: Show) => narrowed.filter((g) => matches(g, s, reviews)).length
  const sources = (['chesscom', 'lichess', 'rookahead'] as const).filter((s) => games.some((g) => g.source === s))

  const stats = useMemo(() => gameStats(games, reviews), [games, reviews])
  const record = useMemo(() => results(games), [games])
  const rating = useMemo(() => ratingLine(games), [games])
  const recent = useMemo(
    () =>
      games
        .flatMap((g) => reviews[g.key]?.accuracy[g.color] ?? [])
        .slice(0, RECENT_GAMES)
        .reverse(),
    [games, reviews],
  )
  const times = useMemo(() => byTimeControl(games), [games])
  const openings = useMemo(() => byOpening(games), [games])

  const open = async (game: MyGame, review?: CachedReview) => {
    await openMyGame(game, review)
    onOpenAnalysis()
  }
  const loadGame = () => {
    requestLoadDialog()
    onOpenAnalysis()
  }
  const reset = () => setShown(PAGE)
  const pick = (kind: 'time' | 'opening', label: (key: string) => string) => (key: string | null) => {
    setPicked(key ? { kind, key, label: label(key) } : null)
    reset()
  }
  const importError = Object.values(errors).find(Boolean)
  const accounts = (['chesscom', 'lichess'] as const).filter((s) => users[s])
  const none = games.length === 0 && !loading && !busy

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
      {id !== 'all' && <span className="filter-count">{count(id)}</span>}
    </button>
  )

  const list = busy ? (
    <div className="skel-group" aria-busy aria-label="Loading your games">
      <header className="home-card-head games-toolbar">
        <span className="filter-chips">
          {[44, 118, 74, 84, 76].map((w, i) => (
            <Skel key={i} w={`${w}px`} h="30px" className="skel-pill" />
          ))}
        </span>
      </header>
      <GameDaysSkeleton rows={8} />
    </div>
  ) : (
    <>
      <header className="home-card-head games-toolbar">
        <div className="filter-chips" role="radiogroup" aria-label="Show">
          {chip('all', 'All')}
          {chip('unreviewed', 'Not reviewed')}
          {chip('win', 'Wins')}
          {chip('loss', 'Losses')}
          {chip('draw', 'Draws')}
        </div>
        {sources.length > 1 && (
          <div className="filter-chips games-sources" role="radiogroup" aria-label="Where from">
            {(['all', ...sources] as const).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={source === s}
                className={`filter-chip all ${source === s ? 'on' : ''}`}
                onClick={() => {
                  setSource(s)
                  reset()
                }}
              >
                {s === 'all' ? 'Everywhere' : SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </header>
      {picked && (
        <p className="games-picked">
          Only {picked.kind === 'time' ? `${picked.label} games` : picked.label}
          <button
            className="link-btn"
            onClick={() => {
              setPicked(null)
              reset()
            }}
          >
            Show all
          </button>
        </p>
      )}
      {importError && <p className="games-error">{importError}</p>}
      {days.length ? (
        <GameDays days={days} reviews={reviews} theme={settings.boardTheme} onOpen={(g, r) => void open(g, r)} />
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
        <button className="btn ghost games-older" onClick={() => setShown((n) => n + PAGE)}>
          Show older games
        </button>
      )}
      {filtered.slice(0, shown).some((g) => reviews[g.key]) && <QualityKey />}
    </>
  )

  return (
    <div className="home-page">
      <PageHeader phoneOnly />
      <main className="home games-page">
        <div className="home-main">
          <header className="home-welcome games-title">
            <h1>{phone ? 'Review' : 'My games'}</h1>
            <span>
              {accounts.map((s) => (
                <span key={s}>
                  {SOURCE_LABEL[s]} <strong>{users[s]}</strong> ·{' '}
                </span>
              ))}
              games played here ·{' '}
              <button className="link-btn" onClick={onOpenSettings}>
                {accounts.length ? 'Change' : 'Add your usernames'}
              </button>
            </span>
          </header>

          {/* Phones: the Review tab is also where a game is loaded and the analysis board opened. */}
          {phone && (
            <div className="games-start">
              <button className="btn accent-btn" onClick={loadGame}>
                {LOAD_ICON}
                Load a game
              </button>
              <Link to="/board" className="btn ghost">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.6 15.6" />
                  <path className="icon-fill" d="M7 7h3.5v3.5H7zM10.5 10.5H14V14h-3.5z" />
                </svg>
                Analysis board
              </Link>
            </div>
          )}

          {none ? (
            <section className="home-card accent-card hero-card" aria-labelledby="games-hero">
              <h2 id="games-hero">Bring in your games</h2>
              <p>Add your Chess.com or Lichess username and your recent games show up here, ready to review.</p>
              <UsernameForm
                key={importError ?? ''}
                error={importError}
                onSaved={(site, name) => updateSettings(site === 'chesscom' ? { chesscomUser: name } : { lichessUser: name })}
              />
            </section>
          ) : (
            <>
              {!phone && (
                <RecordStrip
                  pending={busy}
                  games={games.length}
                  record={record}
                  accuracy={stats.accuracy}
                  trend={stats.trend}
                  recent={recent}
                  reviewed={stats.reviewed}
                  rating={rating}
                />
              )}
              <section className="home-card games-card" aria-label="Your games">
                {list}
              </section>
            </>
          )}
        </div>

        {!phone && (
          <aside className="home-side" aria-label="More">
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
            {busy ? (
              <GroupCardSkeleton />
            ) : (
              openings.length > 0 && (
                <OpeningsCard
                  groups={openings}
                  picked={picked?.kind === 'opening' ? picked.key : null}
                  onPick={pick('opening', (key) => {
                    const o = openings.find((x) => x.key === key)!
                    return `${o.label} as ${o.color === 'white' ? 'White' : 'Black'}`
                  })}
                />
              )
            )}
            {!busy && times.length > 1 && (
              <TimeControlsCard
                groups={times}
                picked={picked?.kind === 'time' ? picked.key : null}
                onPick={pick('time', (key) => {
                  const t = times.find((x) => x.key === key)!
                  return t.site ? `${t.label} ${t.site}` : t.label
                })}
              />
            )}
          </aside>
        )}
      </main>
    </div>
  )
}

/** The openings card on its way. */
function GroupCardSkeleton() {
  return (
    <section className="home-card group-card skel-group" aria-busy aria-label="Loading your openings">
      <header className="home-card-head">
        <IconTile tone="openings" />
        <h2>Openings</h2>
      </header>
      <ul className="group-list">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i}>
            <span className="group-row">
              <span className="group-text">
                <Skel w={`${70 - (i % 3) * 12}%`} h="13px" />
                <Skel w="45%" h="11px" />
              </span>
              <Skel w="64px" h="6px" />
              <span className="group-score" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
