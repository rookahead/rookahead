import type { PositionEval } from '../hooks/useAnalysis'
import { scoreForWin, winPercent, type Color } from './evaluation'
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

/** Moves `score` by `by` points of winning chance for `color`. */
function shifted(score: Score, by: number, color: Color): Score {
  if (by === 0) return score
  const win = moverWin(score, color) + by
  return scoreForWin(color === 'white' ? win : 100 - win)
}

/** One search's view of a position: its best move other than the one played, and the one played if it lists it. */
interface View {
  other: DeepLine | null
  mine: Score | null
}

function ownView(own: PositionEval, played: string): View {
  const second = own.secondMove && own.second ? { move: own.secondMove, score: own.second, pv: [own.secondMove] } : null
  if (own.bestMove === played) return { other: second, mine: own.score }
  return { other: own.bestMove ? { move: own.bestMove, score: own.score, pv: own.pv } : null, mine: second?.move === played ? second.score : null }
}

function deepView(lines: DeepLine[], played: string, color: Color): View {
  const ranked = [...lines].sort((a, b) => moverWin(b.score, color) - moverWin(a.score, color))
  return { other: ranked.find((l) => l.move !== played) ?? null, mine: ranked.find((l) => l.move === played)?.score ?? null }
}

/**
 * Backs up `evals` along `line` (the main line, start position first), using the deeper searches in `deep`
 * (keyed by FEN, best line first). Positions that still want one are listed in `need`; until they're
 * searched, they keep what their own search said.
 *
 * The best other move is worth the move played plus however much better a search finds it, and where more
 * than one search ranks both moves, the least of them: a search near a combination may misjudge both moves,
 * but it misjudges them alike, so the gap between them is what it can vouch for, and an error needs every
 * search to agree. A move no search even ranks is judged by what the game showed it cost. But where a
 * search already had the move played well short of the other one, and valued it about as the game went
 * on to show, that search saw this position right: the other move is worth what it said.
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
    const views = [ownView(own, node.uci)]
    // A cloud eval (cloudEval.ts) is already far deeper than our deeper look would be: it stands as it is.
    if (!own.cloud && (Math.abs(gap) >= JUMP || (own.bestMove !== node.uci && gap >= SHORT))) {
      const lines = deep[parent.fen]
      if (lines?.length) views.push(deepView(lines, node.uci, color))
      else need.push(parent.fen)
    }

    // A search that valued the move played about as the game went on to show wasn't misled here: its value
    // for the other move stands as it is (15…Qg2+ 16.Ne2, where 16.Qe2 is +2.2 whatever 16.Ne2 turned out to be).
    const sound = views.findLast(
      (v) =>
        v.other &&
        v.mine &&
        moverWin(v.other.score, color) - moverWin(v.mine, color) >= SHORT &&
        Math.abs(moverWin(v.mine, color) - moverWin(played, color)) < JUMP,
    )
    // Otherwise the best other move, from the deepest search, worth what the searches that rank both moves agree on.
    const other = sound?.other ?? views.findLast((v) => v.other)?.other ?? null
    const gaps = views.flatMap((v) => (v.other && v.mine ? [moverWin(v.other.score, color) - moverWin(v.mine, color)] : []))
    const otherScore = other && (sound ? other.score : gaps.length ? shifted(played, Math.min(...gaps), color) : other.score)
    // Never worth more than its own search says.
    const worth = other && otherScore && (moverWin(otherScore, color) > moverWin(other.score, color) ? other.score : otherScore)

    const better = worth !== null && moverWin(worth, color) > moverWin(played, color)
    out[parent.fen] = {
      ...own,
      score: better ? worth! : played,
      bestMove: better ? other!.move : node.uci,
      pv: better ? other!.pv : own.bestMove === node.uci ? own.pv : [node.uci, ...(out[node.fen]?.pv ?? [])],
      // The next-best move, which the verdicts read when the move played was the best: as far below the
      // game's value as its search had it below the move played.
      second: better ? played : worth ?? (own.second && shifted(own.second, moverWin(played, color) - moverWin(own.score, color), color)),
      secondMove: better ? node.uci : (other?.move ?? own.secondMove),
    }
    next = out[parent.fen].score
  }
  return { evals: out, need }
}
