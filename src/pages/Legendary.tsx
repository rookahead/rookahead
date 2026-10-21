import { useMemo, useState } from 'react'
import { ClassIcon } from '../components/ClassIcon'
import { Link } from '../components/Link'
import { MiniBoard } from '../components/MiniBoard'
import { PageHeader } from '../components/PageHeader'
import { useLegendaryMoves, type LegendaryEntry } from '../hooks/useLegendaryMoves'
import { openMyGame, useMyGames } from '../hooks/useMyGames'
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

/** "Name (1550)": a player as the cards show them. */
const player = (p: { name: string; rating?: number }) => (p.rating ? `${p.name} (${p.rating})` : p.name)

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

  const busy = (loading || gamesLoading) && !moves.length
  return (
    <div className="home-page">
      <PageHeader back="/" phoneTitle="Legendary moves" />
      <main className="games-page legendary-page">
        <header className="games-head">
          <div className="games-title legendary-title">
            <ClassIcon cls="brilliant" size={34} />
            <div>
              <h1>Legendary moves</h1>
              <p>Every Legendary move you've played in a reviewed game. Tap one to see it in the game.</p>
            </div>
          </div>
          {moves.length > 0 && (
            <dl className="games-totals">
              <div>
                <dt>{period === 'all' ? 'all time' : `last ${PERIODS.find((p) => p[0] === period)![1]}`}</dt>
                <dd>{inPeriod.length}</dd>
              </div>
            </dl>
          )}
        </header>

        {moves.length > 0 && (
          <div className="legendary-filters">
            <div className="filter-chips" role="radiogroup" aria-label="Kind of move">
              {(['all', ...kinds] as const).map((k) => (
                <button key={k} role="radio" aria-checked={kind === k} className={`filter-chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
                  {k === 'all' ? 'All' : KIND_LABEL[k]}
                  <span className="filter-count">{k === 'all' ? inPeriod.length : inPeriod.filter((m) => m.kind === k).length}</span>
                </button>
              ))}
            </div>
            <div className="filter-chips" role="radiogroup" aria-label="When">
              {PERIODS.map(([p, text]) => (
                <button key={p} role="radio" aria-checked={period === p} className={`filter-chip ${period === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {busy && <p className="games-loading">Finding your Legendary moves…</p>}
        {!busy && moves.length === 0 && (
          <section className="home-card legendary-empty">
            <h2>No Legendary moves yet</h2>
            <p>Review your games and every Legendary move you find (usually a brilliant sacrifice) collects here.</p>
            <Link to="/games" className="btn accent-btn">
              Review a game
            </Link>
          </section>
        )}
        {!busy && moves.length > 0 && shown.length === 0 && <p className="games-loading">None in this range.</p>}

        <ul className="legendary-grid">
          {shown.map((m) => {
            const you = m.game.color === 'white' ? m.game.white : m.game.black
            const them = m.game.color === 'white' ? m.game.black : m.game.white
            return (
              <li key={m.id}>
                <button className="legendary-card" onClick={() => void open(m)}>
                  <span className="legendary-player">{player(them)}</span>
                  <MiniBoard fen={m.fen} orientation={m.game.color} theme={settings.boardTheme} lastMove={[m.from, m.to]} grade="brilliant" label={`${m.label} against ${them.name}`} />
                  <span className="legendary-player you">{player(you)}</span>
                  <span className="legendary-meta">
                    <strong>{m.label}</strong>
                    <span>{dayLabel(m.game.endedAt)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}
