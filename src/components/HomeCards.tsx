import { useEffect, useRef, useState } from 'react'
import { Skel } from './Skeleton'
import type { RatingLine } from '../lib/gameRecord'
import { CLASS_INFO } from '../lib/classify'
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
  /** Desktop's goal tile: what it counts (a noun, not an order), the count and its target, and a quiet line. */
  goal: string
  count: number
  of: number
  note: string
  /** The one word for it in the phone's row. */
  short: string
  title: string
  sub: string
  done: boolean
  /** Part of today's plan. Mistakes are only when some are waiting (or fixed today), and they're known last. */
  on: boolean
  action: string
  go: () => void
}

/** The list of tiles takes the grid's rows, one each; a tile that isn't in the plan has a row of nothing. */
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
  /** Phones: one row of ticks, each a word and a tap away from what it asks for. */
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
      goal: 'Game reviewed',
      count: review ? 1 : 0,
      of: 1,
      note: review ? `${review.accuracy[latest.color]?.toFixed(1) ?? '–'} accuracy` : 'Your latest',
      short: 'Review',
      title: review ? 'Latest game reviewed' : 'Review your latest game',
      sub: review ? `vs ${opponent} · ${review.accuracy[latest.color]?.toFixed(1) ?? '–'} accuracy` : `vs ${opponent} · ${dayLabel(latest.endedAt)}`,
      done: !!review,
      on: true,
      action: 'Review it',
      go: onOpenLatest,
    },
    {
      id: 'daily',
      goal: 'Daily puzzle',
      count: daily ? 1 : 0,
      of: 1,
      note: daily === 'solved' ? 'Solved' : daily === 'failed' ? 'Tried' : 'Today',
      short: 'Puzzle',
      title: 'Solve the daily puzzle',
      sub: daily === 'solved' ? 'Solved' : daily === 'failed' ? 'Tried today' : 'One position, a new one every day',
      done: !!daily,
      on: true,
      action: 'Solve it',
      go: () => navigate('/puzzles/daily'),
    },
    {
      id: 'mistakes',
      goal: 'Mistakes fixed',
      count: Math.min(fixed, goal || MISTAKES_GOAL),
      of: goal || MISTAKES_GOAL,
      note: mistakes ? `${mistakes} waiting` : 'Today',
      short: 'Mistakes',
      title: `Fix ${goal || MISTAKES_GOAL} of your mistakes`,
      sub: goal ? `${Math.min(fixed, goal)} of ${goal} today · ${mistakes} waiting` : '',
      done: goal > 0 && fixed >= goal,
      on: goal > 0 || (mistakes === null && expectMistakes),
      action: 'Practise',
      go: () => navigate('/puzzles/mistakes'),
    },
    {
      id: 'play',
      goal: 'Game played',
      count: Math.min(played, 1),
      of: 1,
      note: 'Today',
      short: 'Play',
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
  if (compact)
    return (
      <section className="plan-card compact" aria-labelledby="plan-title">
        <h2 id="plan-title">Today</h2>
        <ol className="plan-ticks">
          {steps.map((s) => (
            <li key={s.id}>
              <button className={`plan-tick ${s.done ? 'done' : ''} ${s === next ? 'next' : ''}`} onClick={s.go} aria-label={s.done ? `${s.title}: done` : s.title}>
                <span className="plan-check" aria-hidden>
                  {s.done && (
                    <svg viewBox="0 0 24 24">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
                {s.short}
              </button>
            </li>
          ))}
        </ol>
      </section>
    )

  // Desktop: today's goals, a row of small tiles under the greeting: a count in a ring that fills as you go (green
  // once it's met), what it counts, and a quiet line. Each is a way in, not an order.
  return (
    <section className="plan-row" aria-label={`Today's goals: ${done} of ${steps.length} met`} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s) => (
        <button key={s.id} className={`home-card plan-tile ${s.done ? 'done' : ''}`} onClick={s.go} aria-label={`${s.goal}: ${s.count} of ${s.of}. ${s.title}`}>
          <GoalRing count={s.count} of={s.of} done={s.done} />
          <strong>{s.goal}</strong>
          <small>{s.note}</small>
        </button>
      ))}
    </section>
  )
}

/** A goal's ring: the count inside, the arc as far as it has got, green once it's met. */
function GoalRing({ count, of, done }: { count: number; of: number; done: boolean }) {
  const r = 25
  const c = 2 * Math.PI * r
  return (
    <svg className="step-ring" viewBox="0 0 60 60" aria-hidden>
      <circle cx="30" cy="30" r={r} className="track" />
      {count > 0 && <circle cx="30" cy="30" r={r} className={done ? 'arc done' : 'arc'} strokeDasharray={`${(count / of) * c} ${c}`} transform="rotate(-90 30 30)" />}
      <text x="30" y="35.5">
        {count}/{of}
      </text>
    </svg>
  )
}

export function PlanCardSkeleton({ compact = false, steps = 3 }: { compact?: boolean; steps?: number }) {
  if (compact)
    return (
      <section className="plan-card compact skel-group" aria-busy aria-label="Loading today's plan">
        <Skel w="44px" h="15px" />
        <span className="plan-ticks">
          {Array.from({ length: steps }, (_, i) => (
            <Skel key={i} w="68px" h="15px" />
          ))}
        </span>
      </section>
    )
  return (
    <section className="plan-row skel-group" aria-busy aria-label="Loading today's plan" style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }}>
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} className="home-card plan-tile">
          <Skel w="60px" h="60px" className="skel-round" />
          <strong className="skel-line">
            <Skel w={`${74 - (i % 2) * 16}%`} h="13px" />
          </strong>
          <small className="skel-line">
            <Skel w={`${56 - (i % 3) * 8}%`} h="11px" />
          </small>
        </span>
      ))}
    </section>
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
  legendary,
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
  /** Phones: your Legendary moves as one more card in the row; desktop has its own strip. */
  legendary?: { all: number; week: number }
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
      <Link to="/profile/games" className="form-part">
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
        <span className="form-sub">{pending ? <Skel w="60%" h="11px" /> : accuracy == null ? 'Review a game' : trend != null ? 'Against the 10 before' : 'Your reviewed games'}</span>
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
          <span className="form-sub">{pending ? <Skel w="50px" h="11px" /> : best ? `Best ${best}` : 'Solve one'}</span>
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
      {legendary && (
        <Link to="/legendary" className="form-part">
          <span className="form-label">Legendary moves</span>
          <span className="form-row">
            {pending ? (
              <Skel w="56px" h="24px" />
            ) : legendary.all ? (
              <b className="form-value" style={{ color: CLASS_INFO.brilliant.color }}>
                {legendary.all}
              </b>
            ) : (
              <b className="form-value empty">Not yet</b>
            )}
          </span>
          <span className="form-sub">{pending ? <Skel w="70%" h="11px" /> : !legendary.all ? 'Review to find them' : legendary.week ? `${legendary.week} this week ›` : 'See them all ›'}</span>
        </Link>
      )}
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
            `Review ${WEAKEST_MIN_REVIEWED - reviewed} more`
          ) : (
            'Needs longer games'
          )}
        </span>
      </div>
    </section>
  )
}

/**
 * Desktop Home's right column, at its top: your numbers as a strip of small cards that scrolls sideways
 * (accuracy, rating, puzzle streak, weakest phase). One that has nothing to say yet stays out, except accuracy,
 * which asks for a review.
 */
export function StatStrip({
  pending = false,
  accuracy,
  trend,
  recent,
  rating,
  progress,
  weakest,
}: {
  pending?: boolean
  accuracy: number | null
  trend: number | null
  recent: number[]
  rating: RatingLine | null
  progress: PuzzleProgress
  weakest: { phase: Phase; accuracy: number } | null | undefined
}) {
  const row = useRef<HTMLDivElement>(null)
  // Which way there's more to see, for the two buttons at the strip's ends.
  const [more, setMore] = useState({ back: false, on: false })
  const measure = () => {
    const el = row.current
    if (el) setMore({ back: el.scrollLeft > 4, on: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useEffect(measure)
  // A card at a time, exactly (its width and the gap), so it lands where the snapping would put it anyway.
  const slide = (by: number) => {
    const el = row.current
    const card = el?.firstElementChild as HTMLElement | null
    if (el && card) el.scrollBy({ left: by * (card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0')), behavior: 'smooth' })
  }

  const today = localDayNumber(new Date())
  const streak = dayStreak(progress, today)
  const best = Math.max(progress.days?.best ?? 0, streak)
  const bars = recent.slice(-10)
  const lo = Math.min(...bars) - 4
  const hi = Math.max(...bars)
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`

  const cards = pending
    ? [0, 1, 2].map((i) => (
        <span key={i} className="home-card stat-card">
          <Skel w="60%" h="11px" />
          <Skel w="70px" h="24px" />
          <Skel w="50%" h="11px" />
        </span>
      ))
    : [
        <Link key="accuracy" to="/profile/games" className="home-card stat-card">
          <span className="stat-label">Accuracy</span>
          {accuracy == null ? (
            <b className="stat-value empty">Not yet</b>
          ) : (
            <b className="stat-value">
              {accuracy.toFixed(1)}
              {trend != null && <i className={trend >= 0 ? 'up' : 'down'}>{(trend >= 0 ? '+' : '−') + Math.abs(trend).toFixed(1)}</i>}
            </b>
          )}
          {bars.length > 1 ? (
            <span className="stat-bars" aria-hidden>
              {bars.map((v, i) => (
                <i key={i} className={i === bars.length - 1 ? 'last' : ''} style={{ height: `${22 + ((v - lo) / (hi - lo || 1)) * 78}%` }} />
              ))}
            </span>
          ) : (
            <span className="stat-sub">{accuracy == null ? 'Review a game' : 'Your reviewed games'}</span>
          )}
        </Link>,
        rating && (
          <Link key="rating" to="/profile/stats" className="home-card stat-card">
            <span className="stat-label">{rating.label} rating</span>
            <b className="stat-value">{rating.now}</b>
            <span className={`stat-sub ${rating.change > 0 ? 'up' : rating.change < 0 ? 'down' : ''}`}>
              {rating.change ? `${signed(rating.change)} ${rating.over === 'month' ? 'this month' : `in ${rating.points.length} games`}` : 'Level this month'}
            </span>
          </Link>
        ),
        <Link key="streak" to="/puzzles/daily" className="home-card stat-card">
          <span className="stat-label">Puzzle streak</span>
          <b className={`stat-value ${streak ? 'streak' : 'empty'}`}>{streak ? `${streak} ${streak === 1 ? 'day' : 'days'}` : 'Start today'}</b>
          <span className="stat-sub">{best ? `Best ${best}` : 'Solve the daily'}</span>
        </Link>,
        weakest && (
          <Link key="weakest" to="/profile/stats" className="home-card stat-card">
            <span className="stat-label">Weakest phase</span>
            <b className="stat-value phase">{PHASE_LABEL[weakest.phase]}</b>
            <span className="stat-sub">{weakest.accuracy.toFixed(1)} accuracy</span>
          </Link>
        ),
      ].filter(Boolean)

  return (
    <section className={`stat-strip ${more.back ? 'has-back' : ''} ${more.on ? 'has-more' : ''}`} aria-label="Your numbers" aria-busy={pending}>
      <div className="stat-row" ref={row} onScroll={measure}>
        {cards}
      </div>
      {more.back && (
        <button className="stat-more back" onClick={() => slide(-1)} aria-label="Back" title="Back">
          <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      )}
      {more.on && (
        <button className="stat-more on" onClick={() => slide(1)} aria-label="More" title="More">
          <svg className="line-icon" viewBox="0 0 24 24" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </section>
  )
}
