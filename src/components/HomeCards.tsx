import { useState } from 'react'
import { Skel } from './Skeleton'
import { Link } from './Link'
import { WEAKEST_MIN_REVIEWED, type Phase } from '../lib/phases'
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

/** The list of tiles takes the grid's rows, one each; a tile that isn't in the plan has a row of nothing. */
const track = (on: boolean) => (on ? 'minmax(0, 1fr)' : 'minmax(0, 0fr)')

/**
 * Today's plan: three or four things worth doing today, ticked off as you do them, the next one lit up. On
 * desktop a list down the right of Home, each tile one line of title and one of detail, so the card is the same
 * height whatever the day holds; fixing your mistakes keeps its place from the start when you have reviews to
 * find them in, and folds away should none turn up.
 */
export function PlanCard({
  compact = false,
  expectMistakes = false,
  latest,
  review,
  games,
  mistakes,
  progress,
  onOpenLatest,
}: {
  /** Phones: one row, the next step and its button; the whole list a tap away. */
  compact?: boolean
  /** Your mistakes are still being counted and there are reviews to count them in: keep their tile's place. */
  expectMistakes?: boolean
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
      on: goal > 0 || (mistakes === null && expectMistakes),
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

  return (
    <section className="home-card plan-card" aria-labelledby="plan-title">
      <header className="plan-head">
        <Ring done={done} total={steps.length} />
        <div>
          <h2 id="plan-title">Today's plan</h2>
          <p>{next ? `${steps.length - done} to go. Next: ${next.title.toLowerCase()}.` : 'All done for today. See you tomorrow.'}</p>
        </div>
      </header>
      <ol className="plan-steps column" style={{ gridTemplateRows: all.map((s) => track(s.on)).join(' ') }}>
        {all.map((s) => (
          <li key={s.id} className={s.on ? '' : 'off'} inert={!s.on}>
            {tile(s)}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Today's plan on its way: the same card, with as many tiles as it's about to have. */
export function PlanCardSkeleton({ compact = false, steps = 3 }: { compact?: boolean; steps?: number }) {
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
      <ol className="plan-steps column" style={{ gridTemplateRows: Array.from({ length: steps }, () => track(true)).join(' ') }}>
        {Array.from({ length: steps }, (_, i) => (
          <li key={i}>
            <span className="plan-step">
              <Skel w="24px" h="24px" className="skel-round" />
              <span className="plan-text">
                <strong className="skel-line">
                  <Skel w={`${70 - (i % 2) * 18}%`} h="14px" />
                </strong>
                <small className="skel-line">
                  <Skel w={`${56 - (i % 3) * 8}%`} h="11px" />
                </small>
              </span>
            </span>
          </li>
        ))}
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

export interface AccuracyPoint {
  game: MyGame
  review: CachedReview
  accuracy: number
}

const PHASE_LABEL: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }

/**
 * Desktop Home's numbers in one strip of three: your accuracy over your last ten reviews with a bar per game,
 * your puzzle streak over this week's days (seven dots however long the streak), and the phase of the game that
 * costs you most. Each part keeps its shape loading, empty or full.
 */
export function FormStrip({
  pending = false,
  accuracy,
  trend,
  recent,
  progress,
  weakest,
  reviewed,
}: {
  /** Your games are on their way. */
  pending?: boolean
  accuracy: number | null
  trend: number | null
  /** Your last reviewed games' accuracy, oldest first. */
  recent: number[]
  progress: PuzzleProgress
  /** Your weakest phase (null when there isn't enough to say), or undefined while your reviews are read. */
  weakest: { phase: Phase; accuracy: number } | null | undefined
  /** Reviewed games the phases come from. */
  reviewed: number
}) {
  const today = localDayNumber(new Date())
  const streak = dayStreak(progress, today)
  const best = Math.max(progress.days?.best ?? 0, streak)
  const bars = recent.slice(-10)
  const lo = Math.min(...bars) - 4
  const hi = Math.max(...bars)
  const dailyDone = progress.daily?.day === today
  return (
    <section className={`home-card form-strip ${pending ? 'skel-group' : ''}`} aria-label="Your form" aria-busy={pending}>
      <Link to="/games" className="form-part">
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
        <span className="form-sub">{pending ? <Skel w="60%" h="11px" /> : accuracy == null ? 'Review a game to see it' : trend != null ? 'Against the 10 before' : 'Your reviewed games'}</span>
      </Link>
      <Link to={dailyDone ? '/puzzles' : '/puzzles/daily'} className="form-part form-streak">
        <span className="form-col">
          <span className="form-label">Puzzle streak</span>
          <span className="form-row">
            {pending ? (
              <Skel w="72px" h="28px" />
            ) : streak ? (
              <>
                <b className="form-value streak">{streak}</b>
                <span className="form-unit">{streak === 1 ? 'day' : 'days'}</span>
              </>
            ) : (
              <b className="form-value empty">Start today</b>
            )}
          </span>
          <span className="form-sub">{pending ? <Skel w="50px" h="11px" /> : best ? `Best ${best}` : 'Solve one to start'}</span>
        </span>
        <ol className="form-week" aria-label="This week">
          {weekDays(progress, 1).map((d) => (
            <li
              key={d.day}
              className={pending ? 'missed' : d.state}
              title={`${d.date.toLocaleDateString('en-GB', { weekday: 'long' })}: ${d.state === 'solved' ? 'solved' : d.state === 'later' ? 'still to come' : d.state === 'today' ? 'not yet' : 'no puzzle'}`}
            >
              <i aria-hidden />
              <span>{d.label[0]}</span>
            </li>
          ))}
        </ol>
      </Link>
      <div className="form-part">
        <span className="form-label">Weakest phase</span>
        <span className="form-row">
          {pending || weakest === undefined ? (
            <Skel w="120px" h="22px" />
          ) : weakest ? (
            <>
              <b className="form-phase">{PHASE_LABEL[weakest.phase]}</b>
              <span className="form-unit">{weakest.accuracy.toFixed(1)}</span>
            </>
          ) : (
            <b className="form-phase empty">Not yet</b>
          )}
        </span>
        <span className="form-sub">
          {pending || weakest === undefined ? (
            <Skel w="80%" h="11px" />
          ) : weakest ? (
            `Last ${reviewed} reviews`
          ) : reviewed < WEAKEST_MIN_REVIEWED ? (
            `Review ${WEAKEST_MIN_REVIEWED - reviewed} more ${WEAKEST_MIN_REVIEWED - reviewed === 1 ? 'game' : 'games'} to see it`
          ) : (
            'Needs more games past the opening'
          )}
        </span>
      </div>
    </section>
  )
}
