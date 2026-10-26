import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { formatScore, type Color } from './evaluation'
import { uciToMove } from './tree'
import type { Score } from './uci'

// "Explain": why a move was a mistake, in a few short rows, each about one thing (the threat, what the
// move does, how it loses, what was better). No AI: every sentence comes from the engine's own lines,
// played out on the board, and the board's geometry; anything we can't show, we don't say.

export interface ExplainShape {
  orig: Square
  dest?: Square
  brush: 'red' | 'suggest' | 'yellow'
}

export interface ExplainRow {
  key: 'threat' | 'move' | 'loses' | 'chance' | 'better'
  label: string
  text: string
  /** What the board draws while this row is picked. */
  shapes: ExplainShape[]
}

export interface Explanation {
  rows: ExplainRow[]
  /** The line to show, UCI and in notation: what punishes the move (from the position after it), or
   *  what was missed (from the position before). */
  line?: { from: 'before' | 'after'; uci: string[]; text: string }
}

/** One engine line: its moves from the position, and its score (White POV). */
export interface EngineLine {
  pv: string[]
  score: Score
}

export interface ExplainInput {
  /** The position before the move, and the move played (UCI and SAN). */
  fenBefore: string
  uci: string
  san: string
  /** The review's verdict: only mistakes, blunders and misses get an explanation. */
  cls: 'mistake' | 'blunder' | 'miss'
  /** The best line from the position before the move. */
  best: EngineLine
  /** The best line for the opponent after the move. */
  reply: EngineLine
  /** The opponent's best line if it were their move before this one: what they were threatening. */
  threat?: EngineLine | null
}

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const sideName = (c: Color) => (c === 'white' ? 'White' : 'Black')
const other = (c: Color): Color => (c === 'white' ? 'black' : 'white')
const short = (c: Color) => (c === 'white' ? 'w' : 'b')
const turnOf = (fen: string): Color => (fen.split(' ')[1] === 'b' ? 'black' : 'white')

/** The same position with the other side to move (no en passant): what they'd do with a free move. */
export function nullMoveFen(fen: string): string | null {
  const chess = new Chess(fen)
  // In check there's no "free move" to give: the threat is already on the board.
  if (chess.inCheck()) return null
  const parts = fen.split(' ')
  parts[1] = parts[1] === 'w' ? 'b' : 'w'
  parts[3] = '-'
  return parts.join(' ')
}

function balance(chess: Chess, color: Color): number {
  let total = 0
  for (const row of chess.board()) for (const sq of row) if (sq) total += (sq.color === short(color) ? 1 : -1) * VALUES[sq.type]
  return total
}

interface Capture {
  by: Color
  piece: PieceSymbol
  square: Square
}

interface Played {
  san: string[]
  /** The line ends in checkmate, after this many of its moves. */
  mateAt?: number
  /** How many of the line's moves to show: up to where the captures stop. */
  length: number
  /** Material won by the side to move at the start, by the end of that stretch. */
  gain: number
  captures: Capture[]
  /** The position after each move. */
  fens: string[]
}

/**
 * Plays a line out. What it wins is the material where the captures last stop (within `max` moves), so
 * a piece taken and soon won back doesn't count; it's shown up to the first point it's won by.
 */
function playLine(fen: string, pv: string[], max = 6): Played {
  const chess = new Chess(fen)
  const mover = turnOf(fen)
  const start = balance(chess, mover)
  const san: string[] = []
  const fens: string[] = []
  const all: Capture[] = []
  const quiet: { length: number; gain: number; captures: Capture[] }[] = []
  for (const uci of pv.slice(0, max)) {
    let move
    try {
      move = chess.move(uciToMove(uci))
    } catch {
      break
    }
    san.push(move.san)
    fens.push(chess.fen())
    if (move.captured) all.push({ by: move.color === 'w' ? 'white' : 'black', piece: move.captured, square: move.to })
    // The captures stop after a move that isn't followed by one.
    const next = pv[san.length]
    const nextTakes = next && san.length < max && chess.moves({ verbose: true }).some((m) => m.from + m.to === next.slice(0, 4) && m.captured)
    if (chess.isCheckmate()) return { san, mateAt: san.length, length: san.length, gain: 0, captures: [], fens }
    if (!nextTakes) quiet.push({ length: san.length, gain: balance(chess, mover) - start, captures: all.slice() })
  }
  const last = quiet[quiet.length - 1]
  if (!last) return { san, length: Math.min(san.length, 1), gain: 0, captures: [], fens }
  const first = quiet.find((q) => q.gain === last.gain && (q.captures.length || !last.captures.length))!
  // Nothing won: a few moves are enough to show where it's going.
  const length = last.gain === 0 ? Math.min(san.length, 4) : first.length
  return { san, length: Math.max(length, 1), gain: last.gain, captures: first.captures, fens }
}

/** "21.e5 Rd7 22.exd6", numbered from the position the line starts in. */
export function lineText(fen: string, san: string[]): string {
  const [, turn, , , , full] = fen.split(' ')
  let n = Number(full) || 1
  let white = turn === 'w'
  return san
    .map((s, i) => {
      const text = white ? `${n}.${s}` : i === 0 ? `${n}…${s}` : s
      if (!white) n++
      white = !white
      return text
    })
    .join(' ')
}

const pieceAt = (fen: string, sq: Square) => new Chess(fen).get(sq)

function pvSan(fen: string, pv: string[]): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const uci of pv) {
    try {
      out.push(chess.move(uciToMove(uci)).san)
    } catch {
      break
    }
  }
  return out
}

function amount(gain: number): string {
  if (gain >= 8) return 'a queen’s worth of material'
  if (gain >= 5) return 'a rook’s worth of material'
  if (gain >= 3) return 'a piece'
  if (gain === 2) return 'two pawns'
  return 'a pawn'
}

/** What a stretch of captures wins for `side`, e.g. "wins the d6 pawn", "wins the exchange". */
function winsWhat(played: Played, side: Color): string | null {
  if (played.gain < 1) return null
  const taken = played.captures.filter((c) => c.by === side).sort((a, b) => VALUES[b.piece] - VALUES[a.piece])
  const lost = played.captures.filter((c) => c.by !== side).sort((a, b) => VALUES[b.piece] - VALUES[a.piece])
  if (!taken.length) return null
  const top = taken[0]
  if (!lost.length) {
    if (taken.length === 1) return top.piece === 'p' ? `wins the ${top.square} pawn` : `wins the ${NAMES[top.piece]} on ${top.square}`
    return `wins ${amount(played.gain)}`
  }
  const back = lost[0]
  if (top.piece === 'r' && (back.piece === 'n' || back.piece === 'b') && played.gain <= 3) return 'wins the exchange'
  if (VALUES[top.piece] - VALUES[back.piece] >= 2 && taken.length === 1) return `wins the ${NAMES[top.piece]} for a ${NAMES[back.piece]}`
  return `wins ${amount(played.gain)}`
}

/** Mate for `side` in this many moves, if the line's score says so. */
function mateFor(score: Score, side: Color): number | null {
  if (score.type !== 'mate' || score.value === 0) return null
  return (score.value > 0) === (side === 'white') ? Math.abs(score.value) : null
}

/** The pieces the move just played attacks that it shouldn't be able to: a fork. */
function forkTargets(fenAfter: string, to: Square): string[] {
  const chess = new Chess(fenAfter)
  const piece = chess.get(to)
  if (!piece) return []
  const them = piece.color === 'w' ? 'b' : 'w'
  const out: { name: string; value: number }[] = []
  for (const row of chess.board())
    for (const sq of row) {
      if (!sq || sq.color !== them || !chess.attackers(sq.square, piece.color).includes(to)) continue
      const defended = chess.attackers(sq.square, them).length > 0
      if (sq.type === 'k' || VALUES[sq.type] > VALUES[piece.type] || (!defended && sq.type !== 'p')) out.push({ name: NAMES[sq.type], value: sq.type === 'k' ? 100 : VALUES[sq.type] })
    }
  return out.length >= 2 ? out.sort((a, b) => b.value - a.value).map((t) => t.name) : []
}

/** One sentence on what a line does for the side to move, starting with its first move. */
function lineStory(fen: string, line: EngineLine, played: Played): string | null {
  const side = turnOf(fen)
  const first = lineText(fen, played.san.slice(0, 1))
  // Counted from the line itself when it ends in mate, so the words match the moves shown.
  const mate = played.mateAt ? Math.ceil(played.mateAt / 2) : mateFor(line.score, side)
  if (mate === 1) return `${first} is mate`
  if (mate) return `${first} starts a mate in ${mate}`
  const wins = winsWhat(played, side)
  if (!wins) return null
  const fork = played.fens[0] ? forkTargets(played.fens[0], line.pv[0].slice(2, 4) as Square) : []
  if (fork.length) return `${first} forks your ${fork[0]} and ${fork[1]}, and ${wins}`
  return `${first} ${wins}`
}

/** Where the mover stands, in words, e.g. "White stays only a little better (+0.73)". */
function standing(score: Score, mover: Color): string {
  const tag = `(${formatScore(score)})`
  const mate = mateFor(score, mover)
  if (mate) return `you’d have mate in ${mate}`
  const theirs = mateFor(score, other(mover))
  if (theirs) return `${sideName(other(mover))} has mate in ${theirs}`
  const cp = (mover === 'white' ? 1 : -1) * (score.type === 'cp' ? score.value : 0)
  if (cp >= 300) return `you’d be winning ${tag}`
  if (cp >= 100) return `you’d be clearly better ${tag}`
  if (cp >= 30) return `you’d be a little better ${tag}`
  if (cp > -30) return `it stays about level ${tag}`
  if (cp > -100) return `${sideName(other(mover))} stays only a little better ${tag}`
  if (cp > -300) return `${sideName(other(mover))} stays better, but you’re still in it ${tag}`
  return `you’d still be worse, but it’s the best try ${tag}`
}

/** Where the opponent stands after the punishing line, e.g. "White is winning (+3.76)". */
function theirStanding(score: Score, them: Color): string {
  const tag = `(${formatScore(score)})`
  const name = sideName(them)
  const mate = mateFor(score, them)
  if (mate) return `${name} has mate in ${mate}`
  if (score.type === 'mate') return `you still have mate in ${Math.abs(score.value)}`
  const cp = (them === 'white' ? 1 : -1) * score.value
  if (cp >= 300) return `${name} is winning ${tag}`
  if (cp >= 100) return `${name} is clearly better ${tag}`
  if (cp >= 30) return `${name} is a little better ${tag}`
  if (cp > -30) return `it’s about level ${tag}`
  return `you’re still better ${tag}`
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const squares = (uci: string) => [uci.slice(0, 2) as Square, uci.slice(2, 4) as Square] as const

/** The squares a slider's move passes over on its way (not counting either end). */
function between(from: Square, to: Square): Square[] {
  const fx = from.charCodeAt(0), fy = Number(from[1]), tx = to.charCodeAt(0), ty = Number(to[1])
  const dx = Math.sign(tx - fx), dy = Math.sign(ty - fy)
  if (!(fx === tx || fy === ty || Math.abs(tx - fx) === Math.abs(ty - fy))) return []
  const out: Square[] = []
  for (let x = fx + dx, y = fy + dy; x !== tx || y !== ty; x += dx, y += dy) out.push(`${String.fromCharCode(x)}${y}` as Square)
  return out
}

/** After `bestUci`, the reply's piece would land where it can be taken: the best move guards that square. */
function coversReply(fen: string, bestUci: string, replyUci: string): boolean {
  const chess = new Chess(fen)
  try {
    chess.move(uciToMove(bestUci))
    chess.move(uciToMove(replyUci))
  } catch {
    return false
  }
  const [, bTo] = squares(bestUci)
  const [, rTo] = squares(replyUci)
  const landed = chess.get(rTo)
  const guard = chess.get(bTo)
  if (!landed || !guard || !chess.attackers(rTo, guard.color).includes(bTo)) return false
  const defenders = chess.attackers(rTo, landed.color).length
  return defenders === 0 || VALUES[guard.type] < VALUES[landed.type] || chess.attackers(rTo, guard.color).length > defenders
}

function shownLine(from: 'before' | 'after', fen: string, pv: string[], played: Played): Explanation['line'] {
  const n = Math.min(Math.max(played.length, 2), played.san.length)
  return { from, uci: pv.slice(0, n), text: lineText(fen, played.san.slice(0, n)) }
}

/** Why a mistake was a mistake, as short rows. Null when there's nothing we can show for sure. */
export function explainMove(input: ExplainInput): Explanation | null {
  const { fenBefore, uci, san, cls, best, reply, threat } = input
  const mover = turnOf(fenBefore)
  const them = other(mover)
  const before = new Chess(fenBefore)
  let fenAfter: string
  try {
    before.move(uciToMove(uci))
    fenAfter = before.fen()
  } catch {
    return null
  }
  const [from, to] = squares(uci)
  const rows: ExplainRow[] = []
  const bestUci = best.pv[0]
  const bestPlayed = bestUci ? playLine(fenBefore, best.pv) : null
  const bestSan = bestPlayed?.san[0]

  /** What the better move would have done, and the move played letting it go. */
  const chance = (note: string): Explanation | null => {
    if (!bestUci || !bestSan || !bestPlayed) return null
    const story = lineStory(fenBefore, best, bestPlayed)
    const text = story ? `${capitalise(story)}. ${capitalise(standing(best.score, mover))}.` : `${lineText(fenBefore, [bestSan])} was the move: ${standing(best.score, mover)}.`
    rows.push({ key: 'chance', label: 'The chance', text, shapes: [{ orig: squares(bestUci)[0], dest: squares(bestUci)[1], brush: 'suggest' }] })
    rows.push({ key: 'move', label: san, text: note, shapes: [{ orig: from, dest: to, brush: 'yellow' }] })
    return { rows, line: shownLine('before', fenBefore, best.pv, bestPlayed) }
  }

  // A miss: the opponent had just slipped, and the move doesn't make them pay.
  if (cls === 'miss') return chance('Lets them off the hook.')

  // Not losing, just not winning: what was there is the story, not what comes next.
  const moverAfter = (mover === 'white' ? 1 : -1) * (reply.score.type === 'cp' ? reply.score.value : reply.score.value > 0 ? 10000 : -10000)
  const moverBest = (mover === 'white' ? 1 : -1) * (best.score.type === 'cp' ? best.score.value : best.score.value > 0 ? 10000 : -10000)
  if (moverAfter > -50) {
    const afterText = reply.pv[0] ? ` After ${lineText(fenAfter, pvSan(fenAfter, reply.pv.slice(0, 1)))}, ${theirStanding(reply.score, them)}.` : ''
    return chance(`${moverBest >= 300 && moverAfter < 150 ? 'Lets the win slip.' : 'Lets some of the edge go.'}${afterText}`)
  }

  const replyUci = reply.pv[0]
  if (!replyUci) return null
  const punished = playLine(fenAfter, reply.pv)
  const replySan = punished.san[0]
  if (!replySan) return null
  const [rFrom, rTo] = squares(replyUci)
  const story = lineStory(fenAfter, reply, punished)
  // What they take for good (nothing, if it's only a trade).
  const firstTake = punished.gain >= 1 ? punished.captures.find((c) => c.by === them) : undefined

  // The threat: what they had before the move, if the move did nothing about it.
  let threatened = false
  if (threat?.pv[0] === replyUci) {
    const fenNull = nullMoveFen(fenBefore)
    const t = fenNull ? playLine(fenNull, threat.pv) : null
    const tStory = fenNull && t ? lineStory(fenNull, threat, t) : null
    // Only when it's the same story: a move that half-answers the threat (a counter-attack) isn't "nothing".
    if (tStory && t && (mateFor(threat.score, them) || Math.abs(t.gain - punished.gain) <= 1)) {
      threatened = true
      const what = tStory.replace(/^\S+ /, '')
      rows.push({
        key: 'threat',
        label: 'The threat',
        text: `${sideName(them)} was threatening ${replySan.replace(/[+#]$/, '')}, which ${what}.`,
        shapes: [{ orig: rFrom, dest: rTo, brush: 'red' }],
      })
    }
  }

  // What the move itself does wrong.
  const moveShapes: ExplainShape[] = [{ orig: from, dest: to, brush: 'yellow' }]
  let moveText: string | null = null
  if (threatened) moveText = `Does nothing about ${replySan.replace(/[+#]$/, '')}.`
  else if (firstTake?.square === to && punished.gain >= Math.max(1, VALUES[firstTake.piece] - 1)) {
    moveText = `Puts the ${NAMES[firstTake.piece]} where it can be taken.`
  } else if (firstTake) {
    // It used to guard what gets taken.
    const guards = new Chess(fenBefore).attackers(firstTake.square, short(mover))
    const guardsAfter = new Chess(fenAfter).attackers(firstTake.square, short(mover))
    if (guards.includes(from) && !guardsAfter.includes(to)) {
      const piece = pieceAt(fenAfter, firstTake.square)
      moveText = `Stops guarding the ${piece?.type === 'p' ? `${firstTake.square} pawn` : `${NAMES[firstTake.piece]} on ${firstTake.square}`}.`
      moveShapes.push({ orig: firstTake.square, brush: 'red' })
    }
  }
  if (!moveText && between(rFrom, rTo).includes(from)) moveText = `Opens the way for ${replySan}.`
  if (moveText) rows.push({ key: 'move', label: san, text: moveText, shapes: moveShapes })

  // How it loses: the punishing line, played out.
  const label = cls === 'blunder' ? 'How it loses' : 'What it allows'
  const loses = story ? `${capitalise(story)}. ${theirStanding(reply.score, them)}.` : `After ${lineText(fenAfter, [replySan])}, ${theirStanding(reply.score, them)}.`
  const loseShapes: ExplainShape[] = [{ orig: rFrom, dest: rTo, brush: 'red' }]
  if (firstTake && firstTake.square !== rTo) loseShapes.push({ orig: firstTake.square, brush: 'red' })
  rows.push({ key: 'loses', label, text: loses, shapes: loseShapes })

  // Better: the review's best move, and what it does about it.
  if (bestUci && bestSan && bestPlayed) {
    const [bFrom, bTo] = squares(bestUci)
    const bestText = lineText(fenBefore, [bestSan])
    let point: string | null = null
    const bestStory = lineStory(fenBefore, best, bestPlayed)
    if (bestStory && (mateFor(best.score, mover) || bestPlayed.gain >= 1)) point = bestStory.replace(/^\S+ /, '')
    else if (firstTake && bFrom === firstTake.square) point = `saves the ${NAMES[firstTake.piece]}`
    // Only for a quiet reply: guarding the square of a capture is a different story.
    else if (!pieceAt(fenAfter, rTo) && coversReply(fenBefore, bestUci, replyUci)) point = `covers ${rTo}`
    rows.push({
      key: 'better',
      label: 'Better',
      text: `${bestText}${point ? ` ${point}` : ' was the move'}. ${capitalise(standing(best.score, mover))}.`,
      shapes: [{ orig: bFrom, dest: bTo, brush: 'suggest' }],
    })
  }

  return { rows, line: shownLine('after', fenAfter, reply.pv, punished) }
}
