// Home's widget row: five goals and numbers under the greeting, each one swappable for another. A goal counts
// something you do today up to a target you set; a stat shows one of your numbers. Saved in the settings as
// [{ id, target? }], so it follows you between devices.

import type { Speed } from './speed'

export type WidgetId = 'daily' | 'reviews' | 'mistakes' | 'played' | 'rating' | 'phase'

export interface HomeWidget {
  id: WidgetId
  /** A goal's target for today (goals with a target only). */
  target?: number
  /** The rating's speed (the rating only); none follows your latest rated game. */
  speed?: Speed
}

interface WidgetInfo {
  name: string
  /** What it shows, in the swap list. */
  about: string
  kind: 'goal' | 'stat'
  /** A goal you can set: its default and its range. */
  target?: { start: number; min: number; max: number }
}

export const WIDGETS: Record<WidgetId, WidgetInfo> = {
  daily: { name: 'Daily puzzle', about: 'Today’s puzzle, ticked once it’s done', kind: 'goal' },
  reviews: { name: 'Review goal', about: 'Games you review today', kind: 'goal', target: { start: 1, min: 1, max: 10 } },
  mistakes: { name: 'Mistakes fixed', about: 'Your own mistakes, solved as puzzles today', kind: 'goal', target: { start: 3, min: 1, max: 10 } },
  played: { name: 'Play goal', about: 'Games you play at your time today, named for it (Rapid goal)', kind: 'goal', target: { start: 1, min: 1, max: 10 } },
  rating: { name: 'Rating', about: 'How your rating moved this week', kind: 'stat' },
  phase: { name: 'Weakest phase', about: 'The part of the game that costs you most', kind: 'stat' },
}

/** The order the swap list shows them in: goals, then numbers. */
export const WIDGET_ORDER: WidgetId[] = ['daily', 'reviews', 'mistakes', 'played', 'rating', 'phase']

/** What Home shows until you change it. */
export const DEFAULT_WIDGETS: HomeWidget[] = [{ id: 'reviews', target: 1 }, { id: 'mistakes', target: 3 }, { id: 'rating' }, { id: 'daily' }, { id: 'phase' }]

/** The row always holds this many: you swap one for another, never add or take away. */
export const WIDGET_COUNT = 5

const SPEEDS: readonly string[] = ['bullet', 'blitz', 'rapid', 'classical', 'daily', 'untimed']

/** A goal at its default target, or a stat. */
const fresh = (id: WidgetId): HomeWidget => (WIDGETS[id].target ? { id, target: WIDGETS[id].target!.start } : { id })

/**
 * A saved row made safe: known widgets only, each once, targets inside their range, and exactly five (the first
 * five of a longer row saved before; a short one filled from the default row, then the rest in the picker's order).
 */
export function cleanWidgets(saved: unknown): HomeWidget[] {
  const seen = new Set<WidgetId>()
  const out: HomeWidget[] = []
  for (const w of Array.isArray(saved) ? saved : []) {
    const id = (w as HomeWidget | null)?.id
    if (!id || !(id in WIDGETS) || seen.has(id)) continue
    seen.add(id)
    const range = WIDGETS[id].target
    const raw = Number((w as HomeWidget).target)
    const speed = (w as HomeWidget).speed
    if (range) out.push({ id, target: Number.isFinite(raw) ? Math.min(range.max, Math.max(range.min, Math.round(raw))) : range.start })
    else out.push(id === 'rating' && typeof speed === 'string' && SPEEDS.includes(speed) ? { id, speed } : { id })
    if (out.length === WIDGET_COUNT) return out
  }
  for (const id of [...DEFAULT_WIDGETS.map((w) => w.id), ...WIDGET_ORDER]) {
    if (out.length === WIDGET_COUNT) break
    if (!seen.has(id)) {
      seen.add(id)
      out.push(fresh(id))
    }
  }
  return out
}

/** The row with one widget changed: a new target, or the rating's speed. */
export function changeWidget(row: HomeWidget[], id: WidgetId, change: Partial<Omit<HomeWidget, 'id'>>): HomeWidget[] {
  return row.map((w) => (w.id === id ? { ...w, ...change } : w))
}

/** The row with `to` in `from`'s place. */
export function swapWidget(row: HomeWidget[], from: WidgetId, to: WidgetId): HomeWidget[] {
  return row.map((w) => (w.id === from ? fresh(to) : w))
}

/** The row with one widget dragged to another place: the rest close up around it, in their order. */
export function moveWidget(row: HomeWidget[], from: number, to: number): HomeWidget[] {
  const out = [...row]
  const [moved] = out.splice(from, 1)
  out.splice(to, 0, moved)
  return out
}

/** A widget's target for today, or its default when it has none saved. */
export function targetOf(w: HomeWidget): number {
  return w.target ?? WIDGETS[w.id].target?.start ?? 1
}
