// Home's widget row: the goals and numbers you choose to see under the greeting, in your order. A goal counts
// something you do today up to a target you set; a stat shows one of your numbers. Saved in the settings as
// [{ id, target? }], so it follows you between devices.

export type WidgetId = 'daily' | 'reviews' | 'mistakes' | 'played' | 'puzzles' | 'accuracy' | 'rating' | 'legendary' | 'phase' | 'puzzleRating'

export interface HomeWidget {
  id: WidgetId
  /** A goal's target for today (goals with a target only). */
  target?: number
}

interface WidgetInfo {
  name: string
  /** What it shows, in the picker. */
  about: string
  kind: 'goal' | 'stat'
  /** A goal you can set: its default and its range. */
  target?: { start: number; min: number; max: number }
}

export const WIDGETS: Record<WidgetId, WidgetInfo> = {
  daily: { name: 'Daily puzzle', about: 'Today’s puzzle, ticked once it’s done', kind: 'goal' },
  reviews: { name: 'Games reviewed', about: 'Games you review today', kind: 'goal', target: { start: 1, min: 1, max: 10 } },
  mistakes: { name: 'Mistakes fixed', about: 'Your own mistakes, solved as puzzles today', kind: 'goal', target: { start: 3, min: 1, max: 10 } },
  played: { name: 'Games played', about: 'Games you play on Rookahead today', kind: 'goal', target: { start: 1, min: 1, max: 10 } },
  puzzles: { name: 'Puzzles solved', about: 'Puzzles of any kind you solve today', kind: 'goal', target: { start: 5, min: 1, max: 30 } },
  accuracy: { name: 'Accuracy', about: 'Over your last 10 reviews, and its trend', kind: 'stat' },
  rating: { name: 'Rating', about: 'How your rating moved this month', kind: 'stat' },
  legendary: { name: 'Legendary', about: 'Your Legendary moves, and this week’s', kind: 'stat' },
  phase: { name: 'Weakest phase', about: 'The part of the game that costs you most', kind: 'stat' },
  puzzleRating: { name: 'Puzzle rating', about: 'Your rating in rated puzzles', kind: 'stat' },
}

/** The order the picker lists them in: goals, then numbers. */
export const WIDGET_ORDER: WidgetId[] = ['daily', 'reviews', 'mistakes', 'played', 'puzzles', 'accuracy', 'rating', 'legendary', 'phase', 'puzzleRating']

/** What Home shows until you change it: one row. */
export const DEFAULT_WIDGETS: HomeWidget[] = [{ id: 'daily' }, { id: 'reviews', target: 1 }, { id: 'mistakes', target: 3 }, { id: 'accuracy' }, { id: 'rating' }]

/** As many as two rows hold. */
export const MAX_WIDGETS = 10

/** A saved row made safe: known widgets only, each once, targets inside their range, at most two rows. */
export function cleanWidgets(saved: unknown): HomeWidget[] {
  if (!Array.isArray(saved)) return DEFAULT_WIDGETS
  const seen = new Set<WidgetId>()
  const out: HomeWidget[] = []
  for (const w of saved) {
    const id = (w as HomeWidget | null)?.id
    if (!id || !(id in WIDGETS) || seen.has(id)) continue
    seen.add(id)
    const range = WIDGETS[id].target
    const raw = Number((w as HomeWidget).target)
    out.push(range ? { id, target: Number.isFinite(raw) ? Math.min(range.max, Math.max(range.min, Math.round(raw))) : range.start } : { id })
    if (out.length === MAX_WIDGETS) break
  }
  return out
}

/** A widget's target for today, or its default when it has none saved. */
export function targetOf(w: HomeWidget): number {
  return w.target ?? WIDGETS[w.id].target?.start ?? 1
}
