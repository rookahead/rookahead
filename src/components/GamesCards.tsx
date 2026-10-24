import type { Group, RatingLine, Results } from '../lib/gameRecord'
import { IconTile } from './IconTile'
import { Skel } from './Skeleton'

const pct = (n: number) => `${Math.round(n * 100)}%`
/** The share of the games you won. */
const winRate = (r: Results) => r.won / Math.max(1, r.won + r.drawn + r.lost)

/** Wins, draws and losses as one bar, each its share of the games. */
function ResultBar({ r }: { r: Results }) {
  return (
    <span className="result-bar" aria-hidden>
      {r.won > 0 && <i className="win" style={{ flexGrow: r.won }} />}
      {r.drawn > 0 && <i className="draw" style={{ flexGrow: r.drawn }} />}
      {r.lost > 0 && <i className="loss" style={{ flexGrow: r.lost }} />}
    </span>
  )
}

/** A line through your ratings, filling the room it's given. */
function RatingSpark({ points }: { points: number[] }) {
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  const y = (v: number) => 28 - ((v - lo) / (hi - lo || 1)) * 26
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * 100).toFixed(2)} ${y(v).toFixed(2)}`).join('')
  return (
    <svg className="form-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <path d={d} />
    </svg>
  )
}

/**
 * The My games page's numbers in one strip of three, the way Home shows yours: how your games went, your accuracy
 * over your last ten reviews with a bar per game, and your rating with its line. Each part keeps its shape loading,
 * empty or full.
 */
export function RecordStrip({
  pending = false,
  games,
  record,
  accuracy,
  trend,
  recent,
  reviewed,
  rating,
}: {
  /** Your games are on their way. */
  pending?: boolean
  games: number
  record: Results
  accuracy: number | null
  trend: number | null
  /** Your last reviewed games' accuracy, oldest first. */
  recent: number[]
  reviewed: number
  rating: RatingLine | null
}) {
  const bars = recent.slice(-10)
  const lo = Math.min(...bars) - 4
  const hi = Math.max(...bars)
  return (
    <section className={`home-card form-strip record-strip ${pending ? 'skel-group' : ''}`} aria-label="Your record" aria-busy={pending}>
      <div className="form-part">
        <span className="form-label">{pending ? 'Results' : `Results, ${games} ${games === 1 ? 'game' : 'games'}`}</span>
        <span className="form-row">
          {pending ? (
            <Skel w="96px" h="28px" />
          ) : (
            <>
              <b className="form-value">{pct(record.won / Math.max(1, games))}</b>
              <span className="form-unit">won</span>
              <span className="form-bars">
                <ResultBar r={record} />
              </span>
            </>
          )}
        </span>
        <span className="form-sub">
          {pending ? (
            <Skel w="70%" h="11px" />
          ) : (
            <>
              <span className="result-dot win">{record.won} won</span>
              <span className="result-dot draw">{record.drawn} drawn</span>
              <span className="result-dot loss">{record.lost} lost</span>
            </>
          )}
        </span>
      </div>
      <div className="form-part">
        <span className="form-label">Accuracy, last {bars.length > 1 ? bars.length : 10}</span>
        <span className="form-row">
          {pending ? (
            <Skel w="96px" h="28px" />
          ) : accuracy == null ? (
            <b className="form-value empty">Not yet</b>
          ) : (
            <>
              <b className="form-value">{accuracy.toFixed(1)}</b>
              {trend != null && (
                <span className={`form-trend ${trend >= 0 ? 'up' : 'down'}`}>
                  {trend >= 0 ? '+' : ''}
                  {trend.toFixed(1)}
                </span>
              )}
            </>
          )}
          <span className="form-bars" aria-hidden>
            {!pending &&
              bars.length > 1 &&
              bars.map((v, i) => <i key={i} className={i === bars.length - 1 ? 'last' : ''} style={{ height: `${18 + ((v - lo) / (hi - lo || 1)) * 82}%` }} />)}
          </span>
        </span>
        <span className="form-sub">{pending ? <Skel w="60%" h="11px" /> : accuracy == null ? 'Review a game to see it' : `${reviewed} of ${games} reviewed`}</span>
      </div>
      <div className="form-part">
        <span className="form-label">{rating ? `Rating, ${rating.label}` : 'Rating'}</span>
        <span className="form-row">
          {pending ? (
            <Skel w="96px" h="28px" />
          ) : rating ? (
            <>
              <b className="form-value">{rating.now}</b>
              {rating.change !== 0 && (
                <span className={`form-trend ${rating.change > 0 ? 'up' : 'down'}`}>
                  {rating.change > 0 ? '+' : ''}
                  {rating.change}
                </span>
              )}
              <span className="form-bars">{rating.points.length > 1 && <RatingSpark points={rating.points} />}</span>
            </>
          ) : (
            <b className="form-value empty">Not yet</b>
          )}
        </span>
        <span className="form-sub">
          {pending ? <Skel w="50%" h="11px" /> : !rating ? 'From your Chess.com or Lichess games' : rating.over === 'month' ? 'In the last 30 days' : `Over your last ${rating.points.length} games`}
        </span>
      </div>
    </section>
  )
}

/** Your most played openings, each with how its games went: picking one shows only its games in the list, picking it
 * again shows them all. */
export function OpeningsCard({ groups, picked, onPick }: { groups: Group[]; picked: string | null; onPick: (key: string | null) => void }) {
  return (
    <section className="home-card group-card" aria-label="Openings">
      <header className="home-card-head">
        <IconTile tone="openings" />
        <h2>Openings</h2>
        <span className="group-note">Win rate</span>
      </header>
      <ul className="group-list">
        {groups.map((g) => (
          <li key={g.key}>
            <button
              className={`group-row ${picked === g.key ? 'on' : ''}`}
              aria-pressed={picked === g.key}
              title={`${g.won} won, ${g.drawn} drawn, ${g.lost} lost`}
              onClick={() => onPick(picked === g.key ? null : g.key)}
            >
              <span className="group-text">
                <strong>{g.label}</strong>
                <small>
                  <i className={`side-dot ${g.color}`} aria-hidden />
                  as {g.color === 'white' ? 'White' : 'Black'} · {g.games} {g.games === 1 ? 'game' : 'games'}
                </small>
              </span>
              <ResultBar r={g} />
              <span className="group-score">{pct(winRate(g))}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Your time controls as a small table: how many games, your rating and how often you won. Picking one shows only
 * its games in the list. */
export function TimeControlsCard({ groups, picked, onPick }: { groups: Group[]; picked: string | null; onPick: (key: string | null) => void }) {
  return (
    <section className="home-card group-card" aria-label="Time controls">
      <header className="home-card-head">
        <IconTile tone="clock" />
        <h2>Time controls</h2>
      </header>
      <div className="time-table">
        <span className="time-head" aria-hidden>
          <span />
          <span>Games</span>
          <span>Rating</span>
          <span>Win rate</span>
        </span>
        <ul className="time-list">
          {groups.map((g) => (
            <li key={g.key}>
              <button
                className={`time-row ${picked === g.key ? 'on' : ''}`}
                aria-pressed={picked === g.key}
                aria-label={`${g.label}${g.site ? ` on ${g.site}` : ''}: ${g.games} games${g.rating != null ? `, rated ${g.rating}` : ''}, win rate ${pct(winRate(g))}`}
                onClick={() => onPick(picked === g.key ? null : g.key)}
              >
                <span className="time-name">
                  <strong>{g.label}</strong>
                  {g.site && <small>{g.site}</small>}
                </span>
                <span>{g.games}</span>
                <span className="time-rating">{g.rating ?? '–'}</span>
                <span>{pct(winRate(g))}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
