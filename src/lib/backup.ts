import type { PositionEval } from '../hooks/useAnalysis'
import { winPercent, type Color } from './evaluation'
import type { MoveNode } from './tree'
import type { Score } from './uci'

/**
 * Backing up a review's evals along the game, so a move is never blamed for what the engine only saw later.
 *
 * Each position is searched on its own, and a combination longer than the search shows up only once the
 * game gets close enough to it: the eval jumps (or creeps) after a perfectly good move. So the evals are
 * walked back from the end, the way an engine backs up a search: a position is worth the better, for the
 * side to move, of the move played (worth what the next position turned out to be worth) and the best
 * other move. Where a position's own search and the game's continuation disagree, or the move played fell
 * short of the engine's, the position is searched deeper for that other move. Every verdict then compares
 * two backed-up values, never two searches made at different distances from the combination.
 */

/** One line of a deeper search of a position: its first move, White-POV score and the line. */
export interface DeepLine {
  move: string
  score: Score
  pv: string[]
}

export interface BackedUp {
  /** The review's evals, every main-line position worth what the game went on to show. */
  evals: Record<string, PositionEval>
  /** Positions to search deeper before the result holds; empty once it does. */
  need: string[]
}

/** The position's own search and the game's continuation disagree by this much (win %): look deeper. */
const JUMP = 10

/** The move played falls this far short of the engine's (win %): look deeper before calling it an error. */
const SHORT = 5

const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'black' : 'white')
const moverWin = (score: Score, color: Color) => (color === 'white' ? winPercent(score) : 100 - winPercent(score))

/**
 * Backs up `evals` along `line` (the main line, start position first), using the deeper searches in `deep`
 * (keyed by FEN, best line first). Positions that still want one are listed in `need`; until they're
 * searched, they keep what their own search said.
 */
export function backUp(line: MoveNode[], evals: Record<string, PositionEval>, deep: Record<string, DeepLine[]>): BackedUp {
  const out = { ...evals }
  const need: string[] = []
  let next: Score | undefined = evals[line[line.length - 1]?.fen]?.score
  for (let i = line.length - 1; i >= 1; i--) {
    const parent = line[i - 1]
    const node = line[i]
    const own = evals[parent.fen]
    // A gap in the review (or a position reached twice, already backed up) restarts the walk from its own search.
    if (!own || !node.uci || !next || out[parent.fen] !== own) {
      next = out[parent.fen]?.score
      continue
    }
    const color = turnOf(parent.fen)
    const played = next
    const gap = moverWin(own.score, color) - moverWin(played, color)
    const ownOther: DeepLine | null = own.bestMove && own.bestMove !== node.uci ? { move: own.bestMove, score: own.score, pv: own.pv } : null

    let other = ownOther
    // A cloud eval (cloudEval.ts) is already far deeper than our deeper look would be: it stands as it is.
    if (!own.cloud && (Math.abs(gap) >= JUMP || (ownOther && gap >= SHORT))) {
      const lines = deep[parent.fen]
      if (lines?.length) other = lines.filter((l) => l.move !== node.uci).sort((a, b) => moverWin(b.score, color) - moverWin(a.score, color))[0] ?? null
      else need.push(parent.fen)
    }

    const better = other !== null && moverWin(other.score, color) > moverWin(played, color)
    out[parent.fen] = {
      ...own,
      score: better ? other!.score : played,
      bestMove: better ? other!.move : node.uci,
      pv: better ? other!.pv : own.bestMove === node.uci ? own.pv : [node.uci, ...(out[node.fen]?.pv ?? [])],
      // The next-best move's score, which the verdicts read when the move played was the best.
      second: better ? played : other ? other.score : own.second,
    }
    next = out[parent.fen].score
  }
  return { evals: out, need }
}
