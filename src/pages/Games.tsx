import { useMemo, useState } from 'react'
import { GameList } from '../components/GameList'
import { Link } from '../components/Link'
import { PageHeader } from '../components/PageHeader'
import { GameListSkeleton, Skel } from '../components/Skeleton'
import { Tabs } from '../components/Tabs'
import { UsernameForm } from '../components/UsernameForm'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { useSettled } from '../hooks/useSettled'
import { dayLabel, gameStats, SOURCE_LABEL, type GameSource, type MyGame } from '../lib/myGames'
import type { CachedReview } from '../lib/reviewCache'
import { requestLoadDialog } from '../lib/session'
import type { Settings } from '../lib/settings'

const PAGE = 40

const LOAD_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
)

type SourceFilter = 'all' | GameSource
type ResultFilter = 'all' | MyGame['result']

interface Props {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  onOpenAnalysis: () => void
  onOpenSettings: () => void
}

/** Filter chips, each in its own colour (a dot, and a tint when chosen), with how many games each holds. */
function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, number][]; onChange: (v: T) => void }) {
  return (
    <div className="filter-chips" role="radiogroup" aria-label={label}>
      {options.map(([v, text, count]) => (
        <button key={v} role="radio" aria-checked={value === v} className={`filter-chip ${v} ${value === v ? 'on' : ''}`} onClick={() => onChange(v)}>
          {text}
          <span className="filter-count">{count}</span>
        </button>
      ))}
    </div>
  )
}

/** Every game in one list, newest first and grouped by day, wherever it was played. */
export function GamesPage({ settings, updateSettings, onOpenAnalysis, onOpenSettings }: Props) {
  const users = { chesscom: settings.chesscomUser, lichess: settings.lichessUser }
  const { games, reviews, loading, errors } = useMyGames(users)
  // Placeholder rows until the games come, then they turn into them (useSettled).
  const busy = useSettled(loading && !games.length)
  const [source, setSource] = useState<SourceFilter>('all')
  const [result, setResult] = useState<ResultFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const phone = useMediaQuery('(max-width: 1000px)')

  const fromSource = useMemo(() => games.filter((g) => source === 'all' || g.source === source), [games, source])
  const filtered = useMemo(() => fromSource.filter((g) => result === 'all' || g.result === result), [fromSource, result])
  const bySource = (s: GameSource) => games.filter((g) => g.source === s).length
  const byResult = (r: MyGame['result']) => fromSource.filter((g) => g.result === r).length
  const days = useMemo(() => {
    const groups: { label: string; games: MyGame[] }[] = []
    for (const g of filtered.slice(0, shown)) {
      const label = dayLabel(g.endedAt)
      if (groups.at(-1)?.label === label) groups.at(-1)!.games.push(g)
      else groups.push({ label, games: [g] })
    }
    return groups
  }, [filtered, shown])
  const stats = useMemo(() => gameStats(games, reviews), [games, reviews])
  const reviewedAll = games.filter((g) => reviews[g.key])
  const avgAll = reviewedAll.flatMap((g) => reviews[g.key].accuracy[g.color] ?? [])
  const average = avgAll.length ? avgAll.reduce((s, x) => s + x, 0) / avgAll.length : null

  const open = async (game: MyGame, review?: CachedReview) => {
    await openMyGame(game, review)
    onOpenAnalysis()
  }
  const loadGame = () => {
    requestLoadDialog()
    onOpenAnalysis()
  }
  const importError = Object.values(errors).find(Boolean)
  const accounts = (['chesscom', 'lichess'] as const).filter((s) => users[s])

  return (
    <div className="home-page">
      <PageHeader phoneOnly />
      <main className="games-page">
        <header className="games-head">
          <div className="games-title">
            <h1>{phone ? 'Review' : 'My games'}</h1>
            <p>
              {accounts.map((s) => (
                <span key={s}>
                  {SOURCE_LABEL[s]} <strong>{users[s]}</strong> ·{' '}
                </span>
              ))}
              games played here ·{' '}
              <button className="link-btn" onClick={onOpenSettings}>
                {accounts.length ? 'Change' : 'Add your usernames'}
              </button>
            </p>
          </div>
          {games.length > 0 && (
            <dl className="games-totals">
              <div>
                <dt>games</dt>
                <dd>{games.length}</dd>
              </div>
              <div>
                <dt>reviewed</dt>
                <dd>{stats.reviewed}</dd>
              </div>
              <div>
                <dt>avg accuracy</dt>
                <dd>{average == null ? '–' : average.toFixed(1)}</dd>
              </div>
            </dl>
          )}
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

        {importError && <p className="games-error">{importError}</p>}

        {games.length === 0 && !loading && !busy ? (
          <section className="home-card accent-card hero-card" aria-labelledby="games-hero">
            <h2 id="games-hero">Bring in your games</h2>
            <p>Add your Chess.com or Lichess username and your recent games show up here, ready to review.</p>
            <UsernameForm onSaved={(site, name) => updateSettings(site === 'chesscom' ? { chesscomUser: name } : { lichessUser: name })} />
          </section>
        ) : (
          <>
            {/* Before the games arrive, placeholder rows stand alone: no tabs or filters counting zeros. */}
            {!busy && games.length > 0 && (
              <>
                <Tabs
                  label="Where from"
                  value={source}
                  onSelect={(v) => {
                    setSource(v)
                    setShown(PAGE)
                  }}
                  items={[
                    { id: 'all', label: 'All games', count: games.length },
                    { id: 'chesscom', label: 'Chess.com', count: bySource('chesscom'), tone: 'green' },
                    { id: 'lichess', label: 'Lichess', count: bySource('lichess'), tone: 'amber' },
                    { id: 'rookahead', label: 'Rookahead', count: bySource('rookahead'), tone: 'violet' },
                  ]}
                />
                <div className="games-filters">
                  <Chips
                    label="Result"
                    value={result}
                    options={[
                      ['all', 'All results', fromSource.length],
                      ['win', 'Wins', byResult('win')],
                      ['loss', 'Losses', byResult('loss')],
                      ['draw', 'Draws', byResult('draw')],
                    ]}
                    onChange={(v) => {
                      setResult(v)
                      setShown(PAGE)
                    }}
                  />
                  {!phone && (
                    <button className="btn ghost games-load" onClick={loadGame}>
                      {LOAD_ICON}
                      Load a game
                    </button>
                  )}
                </div>
              </>
            )}

            {busy && (
              <section className="home-card games-card games-day">
                <Skel w="96px" h="13px" className="skel-day" />
                <GameListSkeleton rows={5} />
              </section>
            )}
            {!busy && games.length > 0 && filtered.length === 0 && (
              <div className="home-card games-empty">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />
                </svg>
                <p>
                  <strong>No games match these filters</strong>
                  <span>Try another result, or All games.</span>
                </p>
              </div>
            )}

            {!busy &&
              days.map((day) => (
                <section key={day.label} className="home-card games-card games-day" aria-label={day.label}>
                  <h2 className="games-day-label">{day.label}</h2>
                  <GameList games={day.games} reviews={reviews} theme={settings.boardTheme} onOpen={(g, r) => void open(g, r)} showDate={false} />
                </section>
              ))}

            {filtered.length > shown && (
              <button className="btn ghost games-older" onClick={() => setShown((n) => n + PAGE)}>
                Show older games
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}
