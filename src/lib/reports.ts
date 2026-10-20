import { client } from './account'
import type { MoveClass, MoveReview } from './classify'
import type { EngineStrength } from '../engine/Engine'

// "Report this verdict": a player who disagrees with a move's verdict sends it to us, signed in or
// not. Each report carries what's needed to grade the move again: the moves from the start, the
// review depth and engine, and the build (so we know which rules graded it).

export type Opinion = 'harsh' | 'generous' | 'other'

export interface VerdictReport {
  /** Position before the move. */
  fen: string
  /** The move (UCI) and how it was written. */
  move: string
  san: string
  verdict: MoveClass
  opinion: Opinion
  note: string
  /** Where the game started, and every move (UCI) up to and including this one. */
  startFen: string
  moves: string[]
  /** Played off the game's own line, after the review. */
  sideLine: boolean
  depth: number
  engine: EngineStrength
  review: Pick<MoveReview, 'winBefore' | 'winAfter' | 'loss' | 'bestMove' | 'score'>
}

export const NOTE_MAX = 500

/** Sends a report. Returns an error message, or null. */
export async function sendVerdictReport(r: VerdictReport): Promise<string | null> {
  try {
    const c = await client()
    const { error } = await c.from('verdict_reports').insert({
      fen: r.fen,
      move: r.move,
      san: r.san,
      verdict: r.verdict,
      opinion: r.opinion,
      note: r.note.trim().slice(0, NOTE_MAX),
      start_fen: r.startFen,
      moves: r.moves.join(' '),
      side_line: r.sideLine,
      depth: r.depth,
      engine: r.engine,
      review: r.review,
      build: __BUILD__,
    })
    if (error?.code === 'P0001') return 'Lots of reports are coming in right now. Please try again in a while.'
    return error ? 'Couldn’t send the report. Check your connection and try again.' : null
  } catch {
    return 'Couldn’t send the report. Check your connection and try again.'
  }
}
