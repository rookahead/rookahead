import { useEffect, useState } from 'react'
import { IconTile } from './IconTile'
import { Skel } from './Skeleton'
import { Link } from './Link'
import type { Phase } from '../lib/phases'
import { PHASES } from '../lib/phases'
import { dayLabel, type MyGame } from '../lib/myGames'
import { localDayNumber } from '../lib/puzzles'
import { dayStreak, solvedOn, type PuzzleProgress } from '../lib/puzzleStore'
import type { CachedReview } from '../lib/reviewCache'
import { navigate } from '../lib/router'

/** Mistake puzzles the plan asks for in a day. */
const MISTAKES_GOAL = 3

interface Step {
  id: string
  title: string
  sub: string
  done: boolean
  /** Part of today's plan. Mistakes are only when some are waiting (or fixed today), and they're known last. */
  on: boolean
  action: string
  go: () => void
}

/** The row of tiles takes the grid's columns, one each; a tile that isn't in the plan has a column of nothing. */
const track = (on: boolean) => (on ? 'minmax(0, 1fr)' : 'minmax(0, 0fr)')

/**
 * Today's plan: three or four things worth doing today, ticked off as you do them, the next one lit up. The card
 * keeps its height; its tiles share one row and grow out of the first (after the placeholder's single tile, and
 * when your mistakes turn up once they're worked out).
 */
export function PlanCard({
  compact = false,
  grow = false,
  latest,
  review,
  games,
  mistakes,
  progress,
  onOpenLatest,
}: {
  /** Phones: one row, the next step and its button; the whole list a tap away. */
  compact?: boolean
  /** Coming after the placeholder: the tiles start as one and open out. */
  grow?: boolean
  latest?: MyGame
  review?: CachedReview
  games: MyGame[]
  /** Mistake puzzles still waiting (null while they're worked out). */
  mistakes: number | null
  progress: PuzzleProgress
  onOpenLatest: () => void
}) {
  const today = localDayNumber(new Date())
  const midnight = new Date().setHours(0, 0, 0, 0)
  const opponent = latest && (latest.color === 'white' ? latest.black : latest.white).name
  const fixed = progress.today?.day === today ? progress.today.mistakes : 0
  const goal = Math.min(MISTAKES_GOAL, fixed + (mistakes ?? 0))
  const played = games.filter((g) => g.source === 'rookahead' && g.endedAt >= midnight).length
  const daily = progress.daily?.day === today ? progress.daily.result : undefined

  const all: Step[] = [
    latest && {
      id: 'review',
      title: review ? 'Latest game reviewed' : 'Review your latest game',
      sub: review ? `vs ${opponent} · ${review.accuracy[latest.color]?.toFixed(1) ?? '–'} accuracy` : `vs ${opponent} · ${dayLabel(latest.endedAt)}`,
      done: !!review,
      on: true,
      action: 'Review it',
      go: onOpenLatest,
    },
    {
      id: 'daily',
      title: 'Solve the daily puzzle',
      sub: daily === 'solved' ? 'Solved' : daily === 'failed' ? 'Tried today' : 'One position, a new one every day',
      done: !!daily,
      on: true,
      action: 'Solve it',
      go: () => navigate('/puzzles/daily'),
    },
    {
      id: 'mistakes',
      title: `Fix ${goal || MISTAKES_GOAL} of your mistakes`,
      sub: goal ? `${Math.min(fixed, goal)} of ${goal} today · ${mistakes} waiting` : '',
      done: goal > 0 && fixed >= goal,
      on: goal > 0,
      action: 'Practise',
      go: () => navigate('/puzzles/mistakes'),
    },
    {
      id: 'play',
      title: 'Play a game',
      sub: played ? `${played} played today` : 'Against the computer, any level',
      done: played > 0,
      on: true,
      action: 'Play',
      go: () => navigate('/play'),
    },
  ].filter((s): s is Step => !!s)
  const steps = all.filter((s) => s.on)
  const done = steps.filter((s) => s.done).length
  const next = steps.find((s) => !s.done)
  const [open, setOpen] = useState(false)
  // After the placeholder, the first frame shows its one tile; the rest open out from the next.
  const [opened, setOpened] = useState(!grow)
  useEffect(() => {
    if (opened) return
    let second = 0
    const first = requestAnimationFrame(() => (second = requestAnimationFrame(() => setOpened(true))))
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [opened])
  const tile = (s: Step) => (
    <button className={`plan-step ${s.done ? 'done' : ''} ${s === next ? 'next' : ''}`} onClick={s.go} aria-label={s.done ? `${s.title}: done` : undefined}>
      <span className="plan-check" aria-hidden>
        {s.done && (
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <span className="plan-text">
        <strong>{s.title}</strong>
        <small>{s.sub}</small>
      </span>
      <span className="plan-go" aria-hidden={s !== next}>
        {s.action} ›
      </span>
    </button>
  )

  if (compact)
    return (
      <section className={`home-card plan-card compact ${open ? 'open' : ''}`} aria-labelledby="plan-title">
        <div className="plan-row">
          <button className="plan-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="plan-steps">
            <Ring done={done} total={steps.length} />
            <span className="plan-summary">
              <small id="plan-title">Today's plan · {done} of {steps.length} done</small>
              <strong>{next ? next.title : 'All done for today'}</strong>
            </span>
            <svg className="plan-chevron" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {next && (
            <button className="btn plan-next" onClick={next.go}>
              {next.action}
            </button>
          )}
        </div>
        {open && (
          <ol className="plan-steps" id="plan-steps">
            {steps.map((s) => (
              <li key={s.id}>{tile(s)}</li>
            ))}
          </ol>
        )}
      </section>
    )

  const shown = (s: Step, i: number) => s.on && (opened || i === 0)
  return (
    <section className="home-card plan-card" aria-labelledby="plan-title">
      <header className="plan-head">
        <Ring done={done} total={steps.length} />
        <div>
          <h2 id="plan-title">Today's plan</h2>
          <p>{next ? `${steps.length - done} to go. Next: ${next.title.toLowerCase()}.` : 'All done for today. See you tomorrow.'}</p>
        </div>
      </header>
      <ol className="plan-steps row" style={{ gridTemplateColumns: all.map((s, i) => track(shown(s, i))).join(' ') }}>
        {all.map((s, i) => (
          <li key={s.id} className={shown(s, i) ? '' : 'off'} inert={!shown(s, i)}>
            {tile(s)}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Today's plan on its way: the same card with one tile, the one the rest open out of. */
export function PlanCardSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <section className="home-card plan-card compact skel-group" aria-busy aria-label="Loading today's plan">
        <div className="plan-row">
          <span className="plan-toggle">
            <Skel w="40px" h="40px" className="skel-round" />
            <span className="plan-summary">
              <Skel w="120px" h="12px" />
              <Skel w="160px" h="16px" className="skel-gap" />
            </span>
          </span>
          <Skel w="78px" h="36px" className="skel-pill" />
        </div>
      </section>
    )
  return (
    <section className="home-card plan-card skel-group" aria-busy aria-label="Loading today's plan">
      <header className="plan-head">
        <Skel w="48px" h="48px" className="skel-round" />
        <div>
          <Skel w="140px" h="18px" />
          <Skel w="220px" h="13px" className="skel-gap" />
        </div>
      </header>
      <ol className="plan-steps row" style={{ gridTemplateColumns: track(true) }}>
        <li>
          <span className="plan-step">
            <Skel w="24px" h="24px" className="skel-round" />
            <span className="plan-text">
              <strong className="skel-lines">
                <span className="skel-line">
                  <Skel w="180px" h="14px" />
                </span>
                <span className="skel-line">
                  <Skel w="120px" h="14px" />
                </span>
              </strong>
              <small className="skel-lines">
                <span className="skel-line">
                  <Skel w="160px" h="11px" />
                </span>
                <span className="skel-line">
                  <Skel w="100px" h="11px" />
                </span>
              </small>
            </span>
            <span className="plan-go skel-line">
              <Skel w="56px" h="13px" />
            </span>
          </span>
        </li>
      </ol>
    </section>
  )
}

/** How much of the plan is done, as a ring with the count inside. */
function Ring({ done, total }: { done: number; total: number }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <svg className="plan-ring" viewBox="0 0 48 48" role="img" aria-label={`${done} of ${total} done`}>
      <circle cx="24" cy="24" r={r} className="track" />
      {done > 0 && <circle cx="24" cy="24" r={r} className="fill" strokeDasharray={`${(done / total) * c} ${c}`} transform="rotate(-90 24 24)" />}
      <text x="24" y="28.5">
        {done}/{total}
      </text>
    </svg>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The last `weeks` weeks' days, Monday first, each solved, missed, today (not yet) or still to come. */
function weekDays(progress: PuzzleProgress, weeks: number) {
  const now = new Date()
  const today = localDayNumber(now)
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - 7 * (weeks - 1))
  return Array.from({ length: 7 * weeks }, (_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    const day = localDayNumber(date)
    const state = day > today ? 'later' : solvedOn(progress, day) ? 'solved' : day === today ? 'today' : 'missed'
    return { label: WEEKDAYS[i % 7], day, date, state }
  })
}

/** This week as a row of small dots, for the phone's streak half-card. */
export function WeekDots({ progress }: { progress: PuzzleProgress }) {
  return (
    <span className="week-dots" aria-hidden>
      {weekDays(progress, 1).map((d) => (
        <i key={d.day} className={d.state} />
      ))}
    </span>
  )
}

/** The puzzle streak: days in a row, this week's days as dots, your best, and the way to keep it going. */
export function StreakCard({ progress, pending = false }: { progress: PuzzleProgress; pending?: boolean }) {
  const today = localDayNumber(new Date())
  const streak = dayStreak(progress, today)
  const best = progress.days?.best ?? 0
  const solvedToday = solvedOn(progress, today)
  const dailyDone = progress.daily?.day === today
  const fortnight = weekDays(progress, 2)
  const solvedDays = fortnight.filter((d) => d.state === 'solved').length

  return (
    <section className={`home-card streak-card ${pending ? 'skel-group' : ''}`} aria-labelledby="streak-title" aria-busy={pending}>
      <header className="home-card-head">
        <IconTile tone="streak" />
        <h2 id="streak-title">Puzzle streak</h2>
        {best > 0 && !pending && <span className="see-all muted">Best {best}</span>}
      </header>
      <div className="streak-count">
        {pending ? <Skel w="120px" h="44px" /> : <b>{streak}</b>}
        {!pending && <span>{streak === 1 ? 'day' : 'days'} in a row</span>}
      </div>
      <ol className="streak-week" aria-label="Last week and this week">
        {fortnight.map((d, i) => (
          <li key={d.day} className={pending ? 'missed' : d.state} title={`${d.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}: ${d.state === 'solved' ? 'solved' : d.state === 'later' ? 'still to come' : d.state === 'today' ? 'not yet' : 'no puzzle'}`}>
            <span className="streak-dot" aria-hidden>
              {d.state === 'solved' && !pending && (
                <svg viewBox="0 0 24 24">
                  <path d="M12 2c1 3 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.5 1.2-3.8 2.4-5 0 2.2 1 3.4 2.3 3.4 0-3.4-1-6 .3-8.9z" />
                </svg>
              )}
            </span>
            {i >= 7 && <span className="streak-day">{d.label[0]}</span>}
          </li>
        ))}
      </ol>
      <p className="streak-note">
        {pending ? (
          <span className="skel-line">
            <Skel w="70%" h="12px" />
          </span>
        ) : (
          `${solvedDays} of the last ${fortnight.filter((d) => d.state !== 'later').length} days · ${progress.solved} puzzles solved in all`
        )}
      </p>
      {pending ? (
        <Skel w="100%" h="50px" className="skel-button" />
      ) : solvedToday ? (
        <button className="btn streak-go" onClick={() => navigate(dailyDone ? '/puzzles' : '/puzzles/daily')}>
          {dailyDone ? 'Safe for today · more puzzles ›' : 'Safe for today · daily puzzle ›'}
        </button>
      ) : (
        <button className="btn accent-btn streak-go" onClick={() => navigate(dailyDone ? '/puzzles' : '/puzzles/daily')}>
          {streak ? `Solve one to make it ${streak + 1}` : 'Solve one to start a streak'}
        </button>
      )}
    </section>
  )
}

export interface AccuracyPoint {
  game: MyGame
  review: CachedReview
  accuracy: number
}

/** The phase bars start here rather than at 0, so the gaps between phases show. */
const BAR_FLOOR = 40

const PHASE_LABEL: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }

/** Your accuracy: the number, its trend game by game (point at one to see it, click to open it), and by phase. */
export function AccuracyCard({
  pending = false,
  points,
  accuracy,
  trend,
  phases,
  legendary,
  onOpen,
}: {
  /** Your games are on their way: the card's shape, with placeholders. */
  pending?: boolean
  /** Reviewed games, oldest first. */
  points: AccuracyPoint[]
  accuracy: number | null
  trend: number | null
  /** Null while the reviews are read. */
  phases: Record<Phase, number | null> | null
  legendary: number
  onOpen: (game: MyGame, review: CachedReview) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 300
  const H = 92
  const values = points.map((p) => p.accuracy)
  const lo = Math.max(0, Math.min(...values) - 6)
  const hi = Math.min(100, Math.max(...values) + 6)
  const x = (i: number) => (points.length < 2 ? W / 2 : 6 + (i / (points.length - 1)) * (W - 12))
  const y = (v: number) => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 16)
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ')
  const avgY = accuracy != null ? y(accuracy) : null
  const shown = hover ?? points.length - 1
  const tip = points[shown]
  const scored = phases ? PHASES.filter((p) => phases[p] != null) : []
  const weakest = !pending && scored.length > 1 ? scored.reduce((a, b) => (phases![a]! <= phases![b]! ? a : b)) : null

  return (
    <section className={`home-card accuracy-card ${pending ? 'skel-group' : ''}`} aria-labelledby="accuracy-title" aria-busy={pending}>
      <header className="home-card-head">
        <IconTile tone="accuracy" />
        <h2 id="accuracy-title">Accuracy</h2>
        {!pending && points.length > 0 && (
          <Link to="/games" className="link-btn see-all">
            Last {points.length} reviewed ›
          </Link>
        )}
      </header>
      {/* One shape whatever there is to show (loading, nothing reviewed yet, your numbers), so nothing moves
          when it arrives. */}
      <div className="accuracy-top">
        {pending ? (
          <Skel w="110px" h="40px" />
        ) : accuracy == null ? (
          <>
            <b className="accuracy-value empty">Not yet</b>
            <span className="accuracy-sub">Review a game to see it</span>
          </>
        ) : (
          <>
            <b className="accuracy-value">{accuracy.toFixed(1)}</b>
            <span className="accuracy-sub">
              {trend != null && (
                <span className={trend >= 0 ? 'up' : 'down'}>
                  {trend >= 0 ? '+' : ''}
                  {trend.toFixed(1)}
                </span>
              )}{' '}
              {trend != null ? 'over your last 10' : 'your last 10'}
            </span>
            {tip && (
              <span className="accuracy-tip" aria-live="polite">
                <strong>{tip.accuracy.toFixed(1)}</strong> vs {(tip.game.color === 'white' ? tip.game.black : tip.game.white).name} · {dayLabel(tip.game.endedAt)}
              </span>
            )}
          </>
        )}
      </div>
      {pending ? (
        <Skel w="100%" h="96px" className="accuracy-chart" />
      ) : !points.length ? (
        <p className="accuracy-chart empty">Each game you review adds a point here.</p>
      ) : (
        <div className="accuracy-chart" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {avgY != null && <line className="avg" x1="0" x2={W} y1={avgY} y2={avgY} />}
            <polygon className="area" points={`${x(0)},${H} ${line} ${x(points.length - 1)},${H}`} />
            <polyline className="trend" points={line} />
          </svg>
          {points.map((p, i) => (
            <button
              key={p.game.key}
              className={`accuracy-point ${i === shown ? 'on' : ''} ${p.game.result}`}
              style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(p.accuracy) / H) * 100}%` }}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => onOpen(p.game, p.review)}
              aria-label={`${p.accuracy.toFixed(1)} against ${(p.game.color === 'white' ? p.game.black : p.game.white).name}, ${dayLabel(p.game.endedAt)}: open the review`}
            />
          ))}
        </div>
      )}
      <ul className="phase-bars" aria-label="By phase of the game" aria-busy={pending || (points.length > 0 && !phases)}>
        {PHASES.map((p) => {
          const v = pending ? null : phases?.[p]
          return (
            <li key={p} className={p === weakest ? 'weakest' : ''}>
              <span className="phase-label">{PHASE_LABEL[p]}</span>
              <span className="phase-bar">{v != null && <span style={{ width: `${Math.max(4, ((v - BAR_FLOOR) / (100 - BAR_FLOOR)) * 100)}%` }} />}</span>
              <span className="phase-value">{v == null ? '–' : v.toFixed(0)}</span>
            </li>
          )
        })}
      </ul>
      <p className="accuracy-foot">
        {pending ? (
          <span className="skel-line">
            <Skel w="240px" h="12px" />
          </span>
        ) : (
          <span className="accuracy-note">{weakest ? `Your ${PHASE_LABEL[weakest].toLowerCase()} costs you the most.` : 'Accuracy by phase, from your last 10 reviews.'}</span>
        )}
        {!pending && legendary > 0 && (
          <Link to="/legendary" className="link-btn accuracy-legendary">
            {legendary} Legendary this week ›
          </Link>
        )}
      </p>
    </section>
  )
}
