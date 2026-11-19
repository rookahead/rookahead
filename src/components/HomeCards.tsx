import { Skel } from './Skeleton'
import { CLASS_INFO } from '../lib/classify'
import { Link } from './Link'
import { WEAKEST_MIN_REVIEWED, type Phase } from '../lib/phases'
import { dayLabel, type MyGame } from '../lib/myGames'
import { localDayNumber } from '../lib/puzzles'
import type { PuzzleProgress } from '../lib/puzzleStore'
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
 * Phones: today's plan, three or four things worth doing today as one row of ticks, the next one lit up; fixing
 * your mistakes keeps its place from the start when you have reviews to find them in, and folds away should none
 * turn up. (Desktop has its widget row, HomeWidgets.)
 */
export function PlanCard({
  expectMistakes = false,
  latest,
  review,
  games,
  mistakes,
  progress,
  onOpenLatest,
  onAddGames,
}: {
  /** Your mistakes are still being counted and there are reviews to count them in: keep their tile's place. */
  expectMistakes?: boolean
  latest?: MyGame
  review?: CachedReview
  games: MyGame[]
  /** Mistake puzzles still waiting (null while they're worked out). */
  mistakes: number | null
  progress: PuzzleProgress
  onOpenLatest: () => void
  /** No games yet: where the review goal points instead (the box that brings them in). */
  onAddGames?: () => void
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
    !latest &&
      onAddGames && {
        id: 'review',
        goal: 'Game reviewed',
        count: 0,
        of: 1,
        note: 'Add your games',
        short: 'Review',
        title: 'Bring in your games to review one',
        sub: '',
        done: false,
        on: true,
        action: 'Add them',
        go: onAddGames,
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
      sub: played ? `${played} played today` : 'Against the coach, any level',
      done: played > 0,
      on: true,
      action: 'Play',
      go: () => navigate('/play'),
    },
  ].filter((s): s is Step => !!s)
  const steps = all.filter((s) => s.on)
  const next = steps.find((s) => !s.done)
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
}

export function PlanCardSkeleton({ steps = 3 }: { steps?: number }) {
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
}

export interface AccuracyPoint {
  game: MyGame
  review: CachedReview
  accuracy: number
}

const PHASE_LABEL: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }

/**
 * Home's numbers in one strip: your accuracy over your last ten reviews with a bar per game, your Legendary moves,
 * and the phase of the game that costs you most. Each part keeps its shape loading, empty or full.
 */
export function FormStrip({
  pending = false,
  accuracy,
  trend,
  recent,
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
  /** Your weakest phase (null when there isn't enough to say), or undefined while your reviews are read. */
  weakest: { phase: Phase; accuracy: number } | null | undefined
  /** Reviewed games the phases come from. */
  reviewed: number
  /** Your Legendary moves, as one more part of the strip. */
  legendary?: { all: number; week: number }
}) {
  const bars = recent.slice(-10)
  const lo = Math.min(...bars) - 4
  const hi = Math.max(...bars)
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
      {legendary && (
        <Link to="/legendary" className="form-part">
          <span className="form-label">Legendary</span>
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
