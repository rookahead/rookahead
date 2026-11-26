import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { RatingLine } from '../lib/gameRecord'
import type { Phase } from '../lib/phases'
import { navigate } from '../lib/router'
import { SPEED_LABEL, type Speed } from '../lib/speed'
import { changeWidget, moveWidget, swapWidget, targetOf, WIDGET_COUNT, WIDGET_ORDER, WIDGETS, type HomeWidget, type WidgetId } from '../lib/widgets'
import { Skel } from './Skeleton'
import { SPEED_ICON } from './SpeedIcon'

// Home's widget row (widgets.ts): five goals and numbers, each tile the same shape — a picture, a name, a line — so
// goals and numbers sit together. A goal shows itself by its target: one to do is its icon, ticked green once done;
// more fill a ring. Point at a tile and a pencil shows in its corner: it opens a dialog with its own setting (a goal's
// target, the rating's speed) and the widgets to swap it for. Drag a tile along the row to put it somewhere else.

const PHASE_LABEL: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }

export interface WidgetData {
  /** Done today. */
  reviews: number
  /** Games played today at the speed of your time (playSpeed). */
  played: number
  /** The speed of the clock you play online at: it names the play goal (Rapid goal). */
  playSpeed: Speed
  mistakesFixed: number
  /** Mistake puzzles waiting (null while they're found). */
  mistakesWaiting: number | null
  daily?: 'solved' | 'failed'
  /** Your rating in a speed, or your latest rated game's without one. */
  ratingFor: (speed?: Speed) => RatingLine | null
  /** The speeds you have a rating in, for the rating's pencil. */
  speeds: Speed[]
  /** Your weakest phase, null when there isn't enough to say, undefined while it's read. */
  weakest: { phase: Phase; accuracy: number } | null | undefined
  /** Reviewed games the phases come from, and how many more it needs. */
  reviewed: number
  phaseNeeds: number
}

interface Props {
  widgets: HomeWidget[]
  onChange: (widgets: HomeWidget[]) => void
  data: WidgetData
  /** Opens the next game to review (or the box to bring games in). */
  onReview: () => void
}

/** One tile's parts: its picture, name and line, where it goes, and what a screen reader says. */
interface Face {
  picture: ReactNode
  name: string
  /** Shown before the name as its icon: the rating's speed. */
  speed?: Speed
  line: string
  go?: () => void
  label: string
}

export function HomeWidgets({ widgets, onChange, data, onReview }: Props) {
  // The slot whose pencil was clicked: its dialog is open. A slot, so a swap keeps the dialog on the new widget.
  const [editing, setEditing] = useState<number | null>(null)
  const unused = WIDGET_ORDER.filter((id) => !widgets.some((w) => w.id === id))

  // Arranging: drag a tile along the row (with the mouse) and the others slide aside to make room; let go and it
  // stays there. A press that hardly moves is still a click.
  const list = useRef<HTMLUListElement>(null)
  const press = useRef<{ from: number; x: number; y: number; centers: number[]; on: boolean; to: number } | null>(null)
  const dragged = useRef(false)
  const [drag, setDrag] = useState<{ from: number; to: number; dx: number; pitch: number } | null>(null)
  const onDown = (e: ReactPointerEvent<HTMLLIElement>, i: number) => {
    if (e.button !== 0 || e.pointerType !== 'mouse' || (e.target as Element).closest('.widget-pencil')) return
    const tiles = [...(list.current?.children ?? [])] as HTMLElement[]
    const centers = tiles.map((t) => {
      const r = t.getBoundingClientRect()
      return r.left + r.width / 2
    })
    press.current = { from: i, x: e.clientX, y: e.clientY, centers, on: false, to: i }
  }
  const onMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    const p = press.current
    if (!p) return
    const dx = e.clientX - p.x
    if (!p.on) {
      if (Math.hypot(dx, e.clientY - p.y) < 6) return
      p.on = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    const at = p.centers[p.from] + dx
    p.to = p.centers.reduce((best, c, k) => (Math.abs(c - at) < Math.abs(p.centers[best] - at) ? k : best), 0)
    setDrag({ from: p.from, to: p.to, dx, pitch: p.centers.length > 1 ? p.centers[1] - p.centers[0] : 0 })
  }
  const onUp = () => {
    const p = press.current
    press.current = null
    if (!p?.on) return
    // The click that ends a drag opens nothing.
    dragged.current = true
    setTimeout(() => (dragged.current = false))
    setDrag(null)
    if (p.to !== p.from) onChange(moveWidget(widgets, p.from, p.to))
  }
  const shift = (i: number): CSSProperties | undefined => {
    if (!drag) return undefined
    if (i === drag.from) return { translate: `${drag.dx}px 0` }
    const by = drag.from < drag.to && i > drag.from && i <= drag.to ? -drag.pitch : drag.to < drag.from && i >= drag.to && i < drag.from ? drag.pitch : 0
    return { translate: `${by}px 0`, transition: 'translate 0.2s ease-out' }
  }

  const faceOf = (w: HomeWidget): Face => {
    const target = targetOf(w)
    // Every goal with a target is a ring, even a goal of one, so it reads as a goal: 0/1.
    const goal = (count: number): ReactNode => <GoalRing count={Math.min(count, target)} of={target} done={count >= target} />
    const progress = (count: number) => (count >= target ? 'Done today' : `${count} of ${target} today`)
    switch (w.id) {
      case 'daily':
        return {
          picture: <DailyIcon done={!!data.daily} />,
          name: 'Daily puzzle',
          line: data.daily === 'solved' ? 'Solved' : data.daily === 'failed' ? 'Tried today' : 'Today',
          go: () => navigate('/puzzles/daily'),
          label: `Daily puzzle: ${data.daily ?? 'not done yet'}`,
        }
      case 'reviews':
        return {
          picture: goal(data.reviews),
          name: 'Review goal',
          line: progress(data.reviews),
          go: onReview,
          label: `Games reviewed today: ${data.reviews} of ${target}`,
        }
      case 'mistakes':
        return {
          picture: goal(data.mistakesFixed),
          name: 'Mistakes fixed',
          line: data.mistakesWaiting ? `${data.mistakesWaiting} waiting` : data.mistakesWaiting === 0 ? 'None waiting' : progress(data.mistakesFixed),
          go: () => navigate('/puzzles/mistakes'),
          label: `Mistakes fixed today: ${data.mistakesFixed} of ${target}`,
        }
      case 'played':
        return {
          picture: goal(data.played),
          name: `${SPEED_LABEL[data.playSpeed]} goal`,
          line: progress(data.played),
          go: () => navigate('/play'),
          label: `${SPEED_LABEL[data.playSpeed]} games played today: ${data.played} of ${target}`,
        }
      case 'rating': {
        const r = data.ratingFor(w.speed)
        const named = w.speed ? SPEED_LABEL[w.speed] : 'Rating'
        if (!r)
          return {
            picture: (
              <span className="stat-pic" aria-hidden>
                <b className="empty">–</b>
              </span>
            ),
            name: named,
            line: w.speed ? `No rated ${named.toLowerCase()} games` : 'No rated games yet',
            label: `${named} rating: no rated games yet`,
          }
        const up = r.change >= 0
        const time = r.label.split(',')[0]
        return {
          picture: (
            <span className={`rating-move ${r.change === 0 ? 'flat' : up ? 'up' : 'down'}`} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d={r.change === 0 ? 'M3 12h18M14 5l7 7-7 7' : up ? 'M5 19 19 5M8 5h11v11' : 'M5 5l14 14M19 8v11H8'} />
              </svg>
              <b>{Math.abs(r.change)}</b>
            </span>
          ),
          name: String(r.now),
          speed: r.speed,
          line: r.over === 'week' ? 'Rating this week' : `Last ${r.points.length} games`,
          go: () => navigate('/profile/stats'),
          label: `${time} rating ${r.now}, ${up ? 'up' : 'down'} ${Math.abs(r.change)} ${r.over === 'week' ? 'this week' : `over your last ${r.points.length} games`}`,
        }
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
    }
  }

  const open = editing == null ? null : widgets[editing]
  return (
    <section className="widgets" aria-label="Your widgets">
      <ul ref={list} className={`widget-grid ${drag ? 'arranging' : ''}`}>
        {widgets.map((w, i) => {
          const face = faceOf(w)
          return (
            <li
              key={w.id}
              className={`home-card plan-tile widget ${drag?.from === i ? 'dragging' : ''}`}
              style={shift(i)}
              onPointerDown={(e) => onDown(e, i)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onClickCapture={(e) => {
                if (!dragged.current) return
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              {face.go && <button className="widget-hit" onClick={face.go} aria-label={face.label} />}
              <WidgetFace face={face} />
              <span className="widget-pencil-wrap">
                <button type="button" className="widget-pencil" onClick={() => setEditing(i)} aria-haspopup="dialog" aria-label={`Edit ${WIDGETS[w.id].name}`} title="Edit">
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
                  </svg>
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {open && editing != null && (
        <WidgetDialog
          widget={open}
          faceOf={faceOf}
          speeds={data.speeds}
          ratingFor={data.ratingFor}
          swaps={unused}
          onChange={(change) => onChange(changeWidget(widgets, open.id, change))}
          onSwap={(id) => onChange(swapWidget(widgets, open.id, id))}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

/** A tile's picture, name and line: on Home's row, and in the edit dialog's preview and swap list. */
function WidgetFace({ face }: { face: Face }) {
  return (
    <>
      {face.picture}
      <strong>
        {face.speed && (
          <svg className="widget-speed" viewBox="0 0 24 24" aria-hidden>
            <path d={SPEED_ICON[face.speed]} />
          </svg>
        )}
        {face.name}
      </strong>
      <small>{face.line}</small>
    </>
  )
}

interface DialogProps {
  widget: HomeWidget
  faceOf: (w: HomeWidget) => Face
  speeds: Speed[]
  ratingFor: (speed?: Speed) => RatingLine | null
  swaps: WidgetId[]
  onChange: (change: Partial<Omit<HomeWidget, 'id'>>) => void
  onSwap: (id: WidgetId) => void
  onClose: () => void
}

/** What a goal counts, for its picker: "3 games". */
const GOAL_UNIT: Partial<Record<WidgetId, [string, string]>> = {
  reviews: ['review', 'reviews'],
  mistakes: ['mistake', 'mistakes'],
  played: ['game', 'games'],
}

/**
 * A tile's pencil opens this: a goal's own number for today (− n +, any from its range, shown
 * on the tile at once), or the speeds the rating can follow as rows (picking one sets it and closes), then the
 * widgets to swap it for as tiles (a swap stays, to set the new one too). A click outside, Escape or × closes it.
 */
function WidgetDialog({ widget, faceOf, speeds, ratingFor, swaps, onChange, onSwap, onClose }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const close = () => dialog.current?.close()
  const pick = (change: Partial<Omit<HomeWidget, 'id'>>) => {
    onChange(change)
    close()
  }
  const range = WIDGETS[widget.id].target
  const target = targetOf(widget)
  const unit = GOAL_UNIT[widget.id] ?? ['', '']
  // The rating's speeds: the one it follows now stays listed even after its last rated game has gone.
  const choices = widget.id === 'rating' ? [...new Set([...speeds, ...(widget.speed ? [widget.speed] : [])])] : []
  const title = range ? 'Change your daily goal' : widget.id === 'rating' ? 'Change your rating' : 'Change widget'
  return (
    <dialog ref={dialog} className="dialog widget-dialog" aria-label={title} onClose={() => setTimeout(onClose, 160)} onClick={(e) => e.target === dialog.current && close()}>
      <div className="dialog-inner">
        <header className="widget-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="widget-dialog-body">
          {range && (
            <div className="widget-picker" role="group" aria-label="Goal for today">
              <button type="button" onClick={() => onChange({ target: target - 1 })} disabled={target <= range.min} aria-label="Lower the goal">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 12h12" />
                </svg>
              </button>
              <span aria-live="polite">
                <b>{target}</b> {unit[target === 1 ? 0 : 1]} a day
              </span>
              <button type="button" onClick={() => onChange({ target: target + 1 })} disabled={target >= range.max} aria-label="Raise the goal">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 12h12M12 6v12" />
                </svg>
              </button>
            </div>
          )}
          {choices.length > 0 && (
            <div className="widget-choices" role="radiogroup" aria-label="Rating to show">
              {[undefined, ...choices].map((s) => {
                const line = ratingFor(s)
                return (
                  <button key={s ?? 'latest'} type="button" role="radio" aria-checked={widget.speed === s} className={`widget-choice ${widget.speed === s ? 'on' : ''}`} onClick={() => pick({ speed: s })}>
                    {s && (
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d={SPEED_ICON[s]} />
                      </svg>
                    )}
                    <span>{s ? SPEED_LABEL[s] : 'Latest game'}</span>
                    <small>{s ? line?.now : line ? SPEED_LABEL[line.speed] : ''}</small>
                  </button>
                )
              })}
            </div>
          )}
          {swaps.length > 0 && (
            <section className="widget-dialog-part">
              <h3>Swap for</h3>
              <div className="widget-swaps">
                {swaps.map((id) => (
                  <button key={id} type="button" className="home-card plan-tile widget" onClick={() => onSwap(id)} title={WIDGETS[id].about}>
                    <WidgetFace face={faceOf({ id })} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </dialog>
  )
}

/** The row on its way: five tiles the shape of the real ones. */
export function HomeWidgetsSkeleton() {
  return (
    <section className="widgets skel-group" aria-busy aria-label="Loading your widgets">
      <ul className="widget-grid">
        {Array.from({ length: WIDGET_COUNT }, (_, i) => (
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
    </section>
  )
}

/**
 * The daily puzzle's own mark: a calendar page shaped like a puzzle piece (a knob on its side, a gap at its foot)
 * with today's date cut out of it, ticked once it's done.
 */
export function DailyIcon({ done }: { done: boolean }) {
  const mask = useId()
  return (
    <span className={`goal-icon daily ${done ? 'done' : ''}`} aria-hidden>
      <svg viewBox="0 0 24 24">
        <defs>
          <mask id={mask}>
            <rect width="24" height="24" fill="#fff" />
            <rect x="2" y="8.4" width="18" height="1.3" fill="#000" />
            <circle cx="10.8" cy="21.8" r="2.6" fill="#000" />
            <text className="daily-date" x="10.8" y="17.6" textAnchor="middle" fill="#000">
              {new Date().getDate()}
            </text>
          </mask>
        </defs>
        <rect x="2" y="4.5" width="17.6" height="17" rx="3.2" mask={`url(#${mask})`} />
        <circle cx="20.6" cy="14.6" r="2.7" />
        <rect x="6.4" y="2.4" width="2.3" height="4.6" rx="1.15" />
        <rect x="13.9" y="2.4" width="2.3" height="4.6" rx="1.15" />
      </svg>
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
