import { useState, type ReactNode } from 'react'
import { CLASS_INFO } from '../lib/classify'
import type { RatingLine } from '../lib/gameRecord'
import type { Phase } from '../lib/phases'
import { playerColor, positionAfter } from '../lib/puzzles'
import { navigate } from '../lib/router'
import type { BoardTheme } from '../lib/settings'
import { MAX_WIDGETS, targetOf, WIDGET_ORDER, WIDGETS, type HomeWidget, type WidgetId } from '../lib/widgets'
import { ClassIcon } from './ClassIcon'
import { useDailyPuzzle } from './DailyCard'
import { TILE_ICONS } from './IconTile'
import { MiniBoard } from './MiniBoard'
import { Skel } from './Skeleton'

// Home's widget row (widgets.ts): the goals and numbers you picked, five to a row, each tile the same shape — a
// picture, a name, a line — so goals and numbers sit together. A goal shows itself by its target: one to do is
// its icon, ticked green once done; more fill a ring; the daily puzzle is today's position. Hover a goal for its
// pencil and set the target on the tile itself; the slim end of the row edits the whole row (remove, move, add).

const PHASE_LABEL: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }

export interface WidgetData {
  /** Done today. */
  reviews: number
  played: number
  puzzles: number
  mistakesFixed: number
  /** Mistake puzzles waiting (null while they're found). */
  mistakesWaiting: number | null
  daily?: 'solved' | 'failed'
  accuracy: number | null
  trend: number | null
  /** Your last reviewed games' accuracy, oldest first. */
  recent: number[]
  rating: RatingLine | null
  legendary: { all: number; week: number }
  /** Your weakest phase, null when there isn't enough to say, undefined while it's read. */
  weakest: { phase: Phase; accuracy: number } | null | undefined
  /** Reviewed games the phases come from, and how many more it needs. */
  reviewed: number
  phaseNeeds: number
  puzzleRating: number
}

interface Props {
  widgets: HomeWidget[]
  onChange: (widgets: HomeWidget[]) => void
  data: WidgetData
  theme: BoardTheme
  /** Opens the next game to review (or the box to bring games in). */
  onReview: () => void
}

/** One tile's parts: its picture, name and line, where it goes, and for a goal how far it's got. */
interface Face {
  picture: ReactNode
  name: string
  line: string
  go?: () => void
  label: string
}

export function HomeWidgets({ widgets, onChange, data, theme, onReview }: Props) {
  const [editing, setEditing] = useState(false)
  // A single goal whose target is being set from its pencil, outside the row's edit mode.
  const [setting, setSetting] = useState<WidgetId | null>(null)
  const set = (next: HomeWidget[]) => onChange(next)
  const retarget = (id: WidgetId, by: number) =>
    set(
      widgets.map((w) => {
        const range = WIDGETS[w.id].target
        return w.id === id && range ? { ...w, target: Math.min(range.max, Math.max(range.min, targetOf(w) + by)) } : w
      }),
    )
  const move = (i: number, by: number) => {
    const next = [...widgets]
    const [w] = next.splice(i, 1)
    next.splice(i + by, 0, w)
    set(next)
  }
  const unused = WIDGET_ORDER.filter((id) => !widgets.some((w) => w.id === id))
  const full = widgets.length >= MAX_WIDGETS

  const faceOf = (w: HomeWidget): Face => {
    const target = targetOf(w)
    const goal = (count: number, icon: keyof typeof TILE_ICONS): ReactNode => {
      const done = count >= target
      if (target > 1) return <GoalRing count={Math.min(count, target)} of={target} done={done} />
      return (
        <span className={`goal-icon ${icon} ${done ? 'done' : ''}`} aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d={TILE_ICONS[icon]} />
          </svg>
          {done && <GoalTick />}
        </span>
      )
    }
    const progress = (count: number) => (count >= target ? 'Done today' : target > 1 ? `${count} of ${target} today` : 'Today')
    switch (w.id) {
      case 'daily':
        return {
          picture: <DailyThumb done={!!data.daily} theme={theme} />,
          name: 'Daily puzzle',
          line: data.daily === 'solved' ? 'Solved' : data.daily === 'failed' ? 'Tried today' : 'Today',
          go: () => navigate('/puzzles/daily'),
          label: `Daily puzzle: ${data.daily ?? 'not done yet'}`,
        }
      case 'reviews':
        return {
          picture: goal(data.reviews, 'review'),
          name: target > 1 ? 'Games reviewed' : 'Game reviewed',
          line: progress(data.reviews),
          go: onReview,
          label: `Games reviewed today: ${data.reviews} of ${target}`,
        }
      case 'mistakes':
        return {
          picture: goal(data.mistakesFixed, 'mistakes'),
          name: 'Mistakes fixed',
          line: data.mistakesWaiting ? `${data.mistakesWaiting} waiting` : data.mistakesWaiting === 0 ? 'None waiting' : progress(data.mistakesFixed),
          go: () => navigate('/puzzles/mistakes'),
          label: `Mistakes fixed today: ${data.mistakesFixed} of ${target}`,
        }
      case 'played':
        return {
          picture: goal(data.played, 'play'),
          name: target > 1 ? 'Games played' : 'Game played',
          line: progress(data.played),
          go: () => navigate('/play'),
          label: `Games played today: ${data.played} of ${target}`,
        }
      case 'puzzles':
        return {
          picture: goal(data.puzzles, 'puzzles'),
          name: 'Puzzles solved',
          line: progress(data.puzzles),
          go: () => navigate('/puzzles'),
          label: `Puzzles solved today: ${data.puzzles} of ${target}`,
        }
      case 'accuracy': {
        const bars = data.recent.slice(-8)
        const lo = Math.min(...bars) - 4
        const hi = Math.max(...bars)
        return {
          picture: (
            <span className="stat-pic" aria-hidden>
              <b className={data.accuracy == null ? 'empty' : ''}>{data.accuracy == null ? '–' : data.accuracy.toFixed(1)}</b>
              <span className="stat-bars">
                {bars.length > 1 && bars.map((v, i) => <i key={i} className={i === bars.length - 1 ? 'last' : ''} style={{ height: `${20 + ((v - lo) / (hi - lo || 1)) * 80}%` }} />)}
              </span>
            </span>
          ),
          name: 'Accuracy',
          line: data.accuracy == null ? 'Review a game' : data.trend != null ? `${data.trend >= 0 ? '+' : ''}${data.trend.toFixed(1)} on the 10 before` : `Last ${bars.length} reviews`,
          go: () => navigate('/profile/games'),
          label: data.accuracy == null ? 'Accuracy: review a game to see it' : `Accuracy ${data.accuracy.toFixed(1)} over your last reviews`,
        }
      }
      case 'rating': {
        const r = data.rating
        if (!r) return { picture: <span className="stat-pic" aria-hidden><b className="empty">–</b></span>, name: 'Rating', line: 'No rated games yet', label: 'Rating: no rated games yet' }
        const up = r.change >= 0
        const time = r.label.split(',')[0]
        return {
          picture: (
            <span className={`rating-move ${r.change === 0 ? 'flat' : up ? 'up' : 'down'}`} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d={r.change === 0 ? 'M5 12h14M14 7l5 5-5 5' : up ? 'M7 17 17 7M9 7h8v8' : 'M7 7l10 10M17 9v8H9'} />
              </svg>
              <b>{Math.abs(r.change)}</b>
            </span>
          ),
          name: `${time} · ${r.now}`,
          line: r.over === 'month' ? 'Rating this month' : `Last ${r.points.length} games`,
          go: () => navigate('/profile/stats'),
          label: `${time} rating ${r.now}, ${up ? 'up' : 'down'} ${Math.abs(r.change)} ${r.over === 'month' ? 'this month' : `over your last ${r.points.length} games`}`,
        }
      }
      case 'legendary':
        return {
          picture: (
            <span className="stat-pic legendary" aria-hidden>
              <ClassIcon cls="brilliant" size={30} />
              <b style={{ color: data.legendary.all ? CLASS_INFO.brilliant.color : undefined }} className={data.legendary.all ? '' : 'empty'}>
                {data.legendary.all}
              </b>
            </span>
          ),
          name: 'Legendary',
          line: !data.legendary.all ? 'Review to find them' : data.legendary.week ? `${data.legendary.week} this week` : 'See them all',
          go: () => navigate('/legendary'),
          label: `${data.legendary.all} Legendary moves, ${data.legendary.week} this week`,
        }
      case 'phase': {
        const weak = data.weakest
        return {
          picture: (
            <span className="stat-pic" aria-hidden>
              <b className={weak ? 'phase' : 'empty'}>{weak ? weak.accuracy.toFixed(1) : weak === undefined ? '' : '–'}</b>
            </span>
          ),
          name: weak ? PHASE_LABEL[weak.phase] : 'Weakest phase',
          line: weak ? 'Your weakest phase' : weak === undefined ? 'Reading your reviews' : data.phaseNeeds > 0 ? `Review ${data.phaseNeeds} more` : 'Needs longer games',
          go: () => navigate('/profile/stats'),
          label: weak ? `Weakest phase: ${PHASE_LABEL[weak.phase]}, ${weak.accuracy.toFixed(1)}` : 'Weakest phase: not enough reviews yet',
        }
      }
      case 'puzzleRating':
        return {
          picture: (
            <span className="stat-pic puzzle-rating" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d={TILE_ICONS.puzzles} />
              </svg>
              <b>{data.puzzleRating}</b>
            </span>
          ),
          name: 'Puzzle rating',
          line: 'Rated puzzles',
          go: () => navigate('/puzzles/rated'),
          label: `Puzzle rating ${data.puzzleRating}`,
        }
    }
  }

  const cols = Math.min(5, widgets.length)
  return (
    <section className={`widgets ${editing ? 'editing' : ''}`} aria-label="Your widgets">
      <div className="widget-row">
        {widgets.length > 0 && (
          <ul className="widget-grid" style={{ gridTemplateColumns: `repeat(${cols}, var(--widget-w))` }}>
            {widgets.map((w, i) => {
              const face = faceOf(w)
              const range = WIDGETS[w.id].target
              const stepping = editing || setting === w.id
              return (
                <li key={w.id} className={`home-card plan-tile widget ${stepping && range ? 'stepping' : ''}`}>
                  {!editing && face.go && <button className="widget-hit" onClick={face.go} aria-label={face.label} />}
                  {face.picture}
                  <strong>{face.name}</strong>
                  {stepping && range ? (
                    <span className="widget-step">
                      <button type="button" onClick={() => retarget(w.id, -1)} disabled={targetOf(w) <= range.min} aria-label={`Lower the ${WIDGETS[w.id].name.toLowerCase()} target`}>
                        −
                      </button>
                      <b aria-live="polite">{targetOf(w)}</b>
                      <button type="button" onClick={() => retarget(w.id, 1)} disabled={targetOf(w) >= range.max} aria-label={`Raise the ${WIDGETS[w.id].name.toLowerCase()} target`}>
                        +
                      </button>
                    </span>
                  ) : (
                    <small>{face.line}</small>
                  )}
                  {/* A goal's own pencil, for its target alone; a tick to finish. */}
                  {!editing && range && (
                    <button
                      type="button"
                      className={`widget-pencil ${setting === w.id ? 'on' : ''}`}
                      onClick={() => setSetting(setting === w.id ? null : w.id)}
                      aria-label={setting === w.id ? 'Done' : `Set the ${WIDGETS[w.id].name.toLowerCase()} target`}
                      title={setting === w.id ? 'Done' : 'Set the target'}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d={setting === w.id ? 'M5 12.5l4.5 4.5L19 7.5' : 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4'} />
                      </svg>
                    </button>
                  )}
                  {editing && (
                    <span className="widget-tools">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${WIDGETS[w.id].name} earlier`} title="Move earlier">
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <path d="M14.5 6 8.5 12l6 6" />
                        </svg>
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === widgets.length - 1} aria-label={`Move ${WIDGETS[w.id].name} later`} title="Move later">
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <path d="m9.5 6 6 6-6 6" />
                        </svg>
                      </button>
                      <button type="button" className="remove" onClick={() => set(widgets.filter((x) => x.id !== w.id))} aria-label={`Remove ${WIDGETS[w.id].name}`} title="Remove">
                        <svg viewBox="0 0 24 24" aria-hidden>
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          className={`widget-edit ${editing ? 'on' : ''} ${widgets.length ? '' : 'wide'}`}
          onClick={() => {
            setEditing(!editing)
            setSetting(null)
          }}
          aria-expanded={editing}
          aria-label={editing ? 'Done editing widgets' : 'Edit widgets'}
          title={editing ? 'Done' : 'Edit widgets'}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d={editing ? 'M5 12.5l4.5 4.5L19 7.5' : 'M12 5v14M5 12h14'} />
          </svg>
          {!widgets.length && !editing && <span>Add widgets</span>}
        </button>
      </div>

      {editing && (
        <div className="home-card widget-tray">
          <p className="widget-tray-head">
            {full ? `That’s ${MAX_WIDGETS}, two full rows. Remove one to add another.` : unused.length ? 'Add to your row' : 'Every widget is on your row.'}
          </p>
          {unused.length > 0 && (
            <ul className="widget-picks">
              {unused.map((id) => (
                <li key={id}>
                  <button type="button" disabled={full} onClick={() => set([...widgets, WIDGETS[id].target ? { id, target: WIDGETS[id].target!.start } : { id }])}>
                    <span className={`widget-kind ${WIDGETS[id].kind}`} aria-hidden>
                      <svg viewBox="0 0 24 24">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                    <span className="widget-pick-text">
                      <b>{WIDGETS[id].name}</b>
                      <small>{WIDGETS[id].about}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

/** The row on its way: tiles the shape of the real ones, as many as you have. */
export function HomeWidgetsSkeleton({ count }: { count: number }) {
  const n = Math.max(1, Math.min(MAX_WIDGETS, count))
  return (
    <section className="widgets skel-group" aria-busy aria-label="Loading your widgets">
      <div className="widget-row">
        <ul className="widget-grid" style={{ gridTemplateColumns: `repeat(${Math.min(5, n)}, var(--widget-w))` }}>
          {Array.from({ length: n }, (_, i) => (
            <li key={i} className="home-card plan-tile widget">
              <Skel w="60px" h="60px" className="skel-round" />
              <strong className="skel-line">
                <Skel w={`${74 - (i % 2) * 16}%`} h="13px" />
              </strong>
              <small className="skel-line">
                <Skel w={`${56 - (i % 3) * 8}%`} h="11px" />
              </small>
            </li>
          ))}
        </ul>
        <span className="widget-edit" aria-hidden />
      </div>
    </section>
  )
}

/** Today's puzzle as a small board, with a tick on its corner once it's done. */
function DailyThumb({ done, theme }: { done: boolean; theme: BoardTheme }) {
  const { puzzle } = useDailyPuzzle()
  const first = puzzle?.moves[0]
  return (
    <span className="goal-board" aria-hidden>
      {puzzle && first ? (
        <MiniBoard fen={positionAfter(puzzle, [first]).fen()} orientation={playerColor(puzzle)} theme={theme} lastMove={[first.slice(0, 2), first.slice(2, 4)]} />
      ) : (
        <span className="skel" />
      )}
      {done && <GoalTick />}
    </span>
  )
}

/** A met goal's tick, on its picture's corner. */
function GoalTick() {
  return (
    <i className="goal-check">
      <svg viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </i>
  )
}

/** A goal's ring: the count inside, the arc as far as it has got with a dot at its head, green once it's met. */
function GoalRing({ count, of, done }: { count: number; of: number; done: boolean }) {
  const r = 26
  const c = 2 * Math.PI * r
  const turn = (count / of) * 2 * Math.PI - Math.PI / 2
  return (
    <svg className={`step-ring ${done ? 'done' : ''}`} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r={r} className="track" />
      {count > 0 && <circle cx="32" cy="32" r={r} className="arc" strokeDasharray={`${(count / of) * c} ${c}`} transform="rotate(-90 32 32)" />}
      {!done && <circle cx={32 + r * Math.cos(turn)} cy={32 + r * Math.sin(turn)} r="4" className="head" />}
      <text x="32" y="37.5">
        {count}/{of}
      </text>
    </svg>
  )
}
