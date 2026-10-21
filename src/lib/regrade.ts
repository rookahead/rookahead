import type { PositionEval } from '../hooks/useAnalysis'
import { classifyGame, RULES_VERSION, type GameReport } from './classify'
import { loadOpeningBook } from './openings'
import { loadReviews, saveReviews, type CachedReview } from './reviewCache'
import { decodeShare, encodeShare, fromSharedGame } from './share'
import { mainline, type MoveNode } from './tree'
import type { Score } from './uci'

/**
 * A saved review keeps, beside its share token, what the verdicts need from the engine that the token
 * leaves out: the start of each position's line and the second-best move's score. With them a review
 * graded under older rules is graded again at once, with no engine. One string per main-line position:
 * "e2e4 e7e5 g1f3 b8c6|31", the score in centipawns or "#-3" for a mate, White POV; empty without one.
 */
export type ReviewLines = string[]

/** How much of each line the verdicts read (classify.ts walks the engine's line four plies). */
const PV_PLIES = 4

function encodeScore(score: Score | undefined): string {
  if (!score) return ''
  return score.type === 'mate' ? `#${score.value}` : String(score.value)
}

function decodeScore(text: string): Score | undefined {
  if (!text) return undefined
  return text.startsWith('#') ? { type: 'mate', value: Number(text.slice(1)) } : { type: 'cp', value: Number(text) }
}

/** The lines to save with a finished review, one per position of `line`. */
export function reviewLines(line: MoveNode[], evals: Record<string, PositionEval>): ReviewLines {
  return line.map((n) => {
    const e = evals[n.fen]
    return e ? `${e.pv.slice(0, PV_PLIES).join(' ')}|${encodeScore(e.second)}` : ''
  })
}

/** Is this review graded under older rules? */
export const isStale = (review: CachedReview) => review.rules !== RULES_VERSION

/**
 * Grades a saved review again under today's rules, from what it saved: no engine. Null when it can't
 * (saved before reviews kept their lines, or damaged), and the game has to be reviewed again.
 */
export async function regrade(review: CachedReview, isBook: (fen: string) => boolean): Promise<{ review: CachedReview; report: GameReport } | null> {
  if (!review.lines) return null
  const shared = await decodeShare(review.token)
  if ('error' in shared || !shared.review) return null
  const { tree, evals } = fromSharedGame(shared)
  const line = mainline(tree)
  if (review.lines.length !== line.length) return null
  line.forEach((node, i) => {
    const e = evals[node.fen]
    if (!e) return
    const [pv, second] = review.lines![i].split('|')
    if (pv) e.pv = pv.split(' ')
    e.second = decodeScore(second ?? '')
  })
  const report = classifyGame(line, evals, isBook)
  const token = await encodeShare({ ...shared, review: { ...shared.review, classes: line.slice(1).map((n) => report.moves[n.id]?.cls ?? 'good') } })
  return {
    report,
    review: {
      ...review,
      token,
      accuracy: report.accuracy,
      brilliant: { white: report.counts.white.brilliant, black: report.counts.black.brilliant },
      // Newer than the copy graded under older rules, so it's the one that syncs.
      at: Date.now(),
      rules: RULES_VERSION,
    },
  }
}

let regrading = false

/**
 * Grades every saved review left from older rules again, in the background, so Home's counts and the
 * Legendary page follow new rules at once. Reviews too old to have their lines wait until they're opened.
 */
export async function regradeStale(): Promise<void> {
  if (regrading) return
  const stale = Object.entries(loadReviews()).filter(([, r]) => isStale(r) && r.lines)
  if (!stale.length) return
  regrading = true
  try {
    const { isBook } = await loadOpeningBook()
    const updated: Record<string, CachedReview> = {}
    for (const [key, r] of stale) {
      const done = await regrade(r, isBook)
      if (done) updated[key] = done.review
    }
    // A review saved again meanwhile (reviewed afresh, or synced in) is newer than ours: keep it.
    const now = loadReviews()
    for (const [key, r] of stale) if (now[key]?.at !== r.at) delete updated[key]
    if (Object.keys(updated).length) saveReviews(updated)
  } finally {
    regrading = false
  }
}
