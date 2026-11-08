import { useMemo, useState } from 'react'
import { IconTile } from '../components/IconTile'
import { Link } from '../components/Link'
import { MiniBoard } from '../components/MiniBoard'
import { PageHeader } from '../components/PageHeader'
import { LegendaryGridSkeleton } from '../components/Skeleton'
import { useLegendaryMoves, type LegendaryEntry } from '../hooks/useLegendaryMoves'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
import { useSettled } from '../hooks/useSettled'
import { KIND_LABEL, sinceFor, type LegendaryKind, type Period } from '../lib/legendary'
import { dayLabel } from '../lib/myGames'
import type { Settings } from '../lib/settings'

interface Props {
  settings: Settings
  onOpenAnalysis: () => void
}

const PERIODS: [Period, string][] = [
  ['7d', '7 days'],
  ['30d', '30 days'],
  ['90d', '90 days'],
  ['all', 'All time'],
]

const KINDS: LegendaryKind[] = ['queen', 'rook', 'bishop', 'knight', 'pawn', 'underpromotion', 'king']

/** "Name 1550": a player as the cards show them. */
const player = (p: { name: string; rating?: number }) => (p.rating ? `${p.name} ${p.rating}` : p.name)

/** Every Legendary move you've played in your reviewed games, as small boards, like Chess.com's brilliant moves page. */
export function LegendaryPage({ settings, onOpenAnalysis }: Props) {
  const users = { chesscom: settings.chesscomUser, lichess: settings.lichessUser }
  const { games, reviews, loading: gamesLoading } = useMyGames(users)
  const { moves, loading } = useLegendaryMoves(games, reviews)
  const [kind, setKind] = useState<LegendaryKind | 'all'>('all')
  const [period, setPeriod] = useState<Period>('all')

  const inPeriod = useMemo(() => {
    const since = sinceFor(period)
    return moves.filter((m) => m.game.endedAt >= since)
  }, [moves, period])
  const shown = kind === 'all' ? inPeriod : inPeriod.filter((m) => m.kind === kind)
  // Only the kinds you've actually played get a chip.
  const kinds = KINDS.filter((k) => inPeriod.some((m) => m.kind === k))

  const open = async (m: LegendaryEntry) => {
    await openMyGame(m.game, m.review, { ply: m.ply })
    onOpenAnalysis()
  }

  const busy = useSettled((loading || gamesLoading) && !moves.length)
  const unreviewed = games.filter((g) => !reviews[g.key]).length
  return (
    <div className="home-page">
      <PageHeader phoneOnly back="/" phoneTitle="Legendary moves" />
      <main className="home games-page legendary-page">
        <div className="home-main">
          <header className="home-welcome games-title">
            <h1>Legendary moves</h1>
            <span>{moves.length ? `${inPeriod.length} ${period === 'all' ? 'in all' : `in the last ${PERIODS.find((p) => p[0] === period)![1]}`} · Open one to see it in the game` : 'Every Legendary move you play in a reviewed game collects here'}</span>
          </header>

          {busy && (
            <section className="home-card games-card">
              <LegendaryGridSkeleton />
            </section>
          )}
          {!busy && moves.length === 0 && (
            <section className="home-card legendary-empty">
              <h2>No Legendary moves yet</h2>
              <p>Review your games and every Legendary move you find (usually a brilliant sacrifice) collects here.</p>
              <Link to="/profile/games" className="btn accent-btn">
                Review a game
              </Link>
            </section>
          )}
          {!busy && moves.length > 0 && (
            <section className="home-card games-card" aria-label="Your Legendary moves">
              <header className="home-card-head games-toolbar">
                <div className="filter-chips" role="radiogroup" aria-label="Kind of move">
                  {(['all', ...kinds] as const).map((k) => (
                    <button key={k} role="radio" aria-checked={kind === k} className={`filter-chip all ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                      {k === 'all' ? 'All' : KIND_LABEL[k]}
                      <span className="filter-count">{k === 'all' ? inPeriod.length : inPeriod.filter((m) => m.kind === k).length}</span>
                    </button>
                  ))}
                </div>
                <div className="filter-chips games-sources" role="radiogroup" aria-label="When">
                  {PERIODS.map(([p, text]) => (
                    <button key={p} role="radio" aria-checked={period === p} className={`filter-chip all ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>
                      {text}
                    </button>
                  ))}
                </div>
              </header>
              {shown.length ? (
                <ul className="legendary-grid">
                  {shown.map((m) => {
                    const them = m.game.color === 'white' ? m.game.black : m.game.white
                    return (
                      <li key={m.id}>
                        <button className="legendary-card" onClick={() => void open(m)}>
                          <MiniBoard fen={m.fen} orientation={m.game.color} theme={settings.boardTheme} lastMove={[m.from, m.to]} grade="brilliant" label={`${m.label} against ${them.name}`} />
                          <span className="legendary-meta">
                            <strong>{m.label}</strong>
                            <span>{dayLabel(m.game.endedAt)}</span>
                          </span>
                          <span className="legendary-vs">vs {player(them)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="games-empty">
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M8 3v3M16 3v3M4 9h16M5 5h14v15H5z" />
                  </svg>
                  <p>
                    <strong>None in this range</strong>
                    <span>Try a longer stretch of time, or All time.</span>
                  </p>
                </div>
              )}
            </section>
          )}

          {!busy && moves.length > 0 && unreviewed > 0 && (
            <Link to="/profile/games" className="home-card quick-card">
              <IconTile tone="legendary" size="big" />
              <span className="quick-lines">
                <strong>Find more Legendary moves</strong>
                <small>
                  {unreviewed} of your games {unreviewed === 1 ? 'isn’t' : 'aren’t'} reviewed yet
                </small>
              </span>
              <span className="quick-go" aria-hidden>
                ›
              </span>
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
