import { Chess, type PieceSymbol, type Square } from 'chess.js'
import type { MoveClass } from './classify'
import { formatScore, winPercent, type Color } from './evaluation'
import { boardIdeas } from './ideas'
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
  key: 'idea' | 'threat' | 'move' | 'loses' | 'chance' | 'take' | 'result' | 'better' | 'next'
  label: string
  text: string
  /** What the board draws while this row is picked. */
  shapes: ExplainShape[]
  /** The position the row is about, when it isn't the one on the board (with the move that led to it). */
  position?: { fen: string; lastMove: [Square, Square] }
  /** Clicking the row plays these moves on the board, from this position. */
  play?: Play
}

export interface Play {
  fen: string
  uci: string[]
}

/** At most this many moves of a line play when its row is clicked. */
const PLAY_MOVES = 12
const play = (fen: string, uci: string[], n = uci.length): Play => ({ fen, uci: uci.slice(0, Math.min(Math.max(n, 1), PLAY_MOVES)) })

/** A line to show, UCI and in notation: what punishes the move (from the position after it), or what
 *  was missed (from the position before). */
export interface ShownLine {
  label: string
  from: 'before' | 'after'
  /** The position it starts from. */
  fen: string
  uci: string[]
  text: string
}

export interface Explanation {
  rows: ExplainRow[]
  lines: ShownLine[]
  /** The facts the coach line is made of: the main one, maybe a second, and whether a clear win was missed. */
  coach?: CoachFacts
}

export interface CoachFacts {
  /** A good move: what it does (a sentence starting with a verb, "Forks the king…"), and for a sacrifice, why it works. */
  idea?: string
  also?: string
  /** A mistake: what the move itself did ("b3 saves the attacked b2 pawn, but it's too slow."). */
  own?: string
  /** What it lets the other side do, as a line ("11.Qc4+, then 12.Nxd5 wins the knight on d5."). */
  allows?: string
  /** What was missed, as a line ("22.Qf5+ forces …g6, and now nothing guards f6."). */
  chance?: string
  /** The better move, and why ("guards f4 against 16.Bf4"), when there's a reason to give. */
  better?: { move: string; point: string | null }
  /** A clear win was there. */
  shot?: boolean
  /** Mate was there. */
  mate?: boolean
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
  /** The review's verdict. */
  cls: MoveClass
  /** The best line from the position before the move. */
  best: EngineLine
  /** The best line for the opponent after the move. */
  reply: EngineLine
  /** The opponent's best line if it were their move before this one: what they were threatening. */
  threat?: EngineLine | null
  /** When the best line or the reply starts with a sacrifice the engine's defence declines, the best line
   *  after it's taken anyway (from `takeFen`). */
  bestTake?: EngineLine | null
  replyTake?: EngineLine | null
  /** A good move: the best line if it's taken anyway, when the move itself is a sacrifice. */
  playedTake?: EngineLine | null
  /** A good move: what it threatens (the mover's best line if they could move again). */
  ownThreat?: EngineLine | null
  /** The review's second choice in the position before, for "next best". */
  second?: { move: string; score: Score } | null
  /** The move before this one (UCI), when it was a capture: to tell taking back from taking. */
  previous?: string
}

/** Verdicts explained by what went wrong; the rest by what the move does. */
const WRONG: readonly MoveClass[] = ['inaccuracy', 'mistake', 'blunder', 'miss']

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
  /** Which move of the line it was (0 = the first), and where the capturing piece came from. */
  ply: number
  from: Square
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
  /** The position the line starts from. */
  fen: string
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
    if (move.captured) all.push({ by: move.color === 'w' ? 'white' : 'black', piece: move.captured, square: move.to, ply: san.length - 1, from: move.from })
    // The captures stop after a move that isn't followed by one.
    const next = pv[san.length]
    const nextTakes = next && san.length < max && chess.moves({ verbose: true }).some((m) => m.from + m.to === next.slice(0, 4) && m.captured)
    if (chess.isCheckmate()) return { san, mateAt: san.length, length: san.length, gain: 0, captures: [], fens, fen }
    if (!nextTakes) quiet.push({ length: san.length, gain: balance(chess, mover) - start, captures: all.slice() })
  }
  const last = quiet[quiet.length - 1]
  if (!last) return { san, length: Math.min(san.length, 1), gain: 0, captures: [], fens, fen }
  const first = quiet.find((q) => q.gain === last.gain && (q.captures.length || !last.captures.length))!
  // Nothing won: a few moves are enough to show where it's going.
  const length = last.gain === 0 ? Math.min(san.length, 4) : first.length
  return { san, length: Math.max(length, 1), gain: last.gain, captures: first.captures, fens, fen }
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
  if (gain >= 8) return 'a queen'
  if (gain >= 5) return 'a rook'
  if (gain >= 3) return 'a piece'
  if (gain === 2) return 'two pawns'
  return 'a pawn'
}

/** "the knight on f4", or "the e5 pawn". */
const pieceWords = (c: { piece: PieceSymbol; square: Square }) => (c.piece === 'p' ? `the ${c.square} pawn` : `the ${NAMES[c.piece]} on ${c.square}`)

/**
 * What a stretch of captures wins for `side`, by name ("wins the d6 pawn", "wins the exchange"), with
 * the capture that does it. Even trades on the way cancel out, so a recapture is never the win.
 */
function winning(played: Played, side: Color): { text: string; capture: Capture } | null {
  const gain = played.gain * (turnOf(played.fen) === side ? 1 : -1)
  if (gain < 1) return null
  const taken = played.captures.filter((c) => c.by === side).sort((a, b) => VALUES[b.piece] - VALUES[a.piece])
  const lost = played.captures.filter((c) => c.by !== side).sort((a, b) => VALUES[b.piece] - VALUES[a.piece])
  // Trades: a piece for one worth the same.
  for (const l of lost.slice()) {
    const i = taken.findIndex((t) => VALUES[t.piece] === VALUES[l.piece])
    if (i >= 0) {
      taken.splice(i, 1)
      lost.splice(lost.indexOf(l), 1)
    }
  }
  const top = taken[0]
  if (!top) return null
  const back = lost[0]
  let text: string
  if (!back) text = taken.length <= 2 ? `wins ${taken.map(pieceWords).join(' and ')}` : `wins ${amount(gain)}`
  else if (top.piece === 'r' && (back.piece === 'n' || back.piece === 'b') && gain <= 3) text = 'wins the exchange'
  else if (VALUES[top.piece] - VALUES[back.piece] >= 2 && taken.length === 1) text = `wins the ${NAMES[top.piece]} for a ${NAMES[back.piece]}`
  else text = `wins ${amount(gain)}`
  return { text, capture: top }
}

const winsWhat = (played: Played, side: Color): string | null => winning(played, side)?.text ?? null

/** Mate for `side` in this many moves, if the line's score says so. */
function mateFor(score: Score, side: Color): number | null {
  if (score.type !== 'mate' || score.value === 0) return null
  return (score.value > 0) === (side === 'white') ? Math.abs(score.value) : null
}

/** The pieces the move just played attacks that it shouldn't be able to: a fork. */
function forkTargets(fenAfter: string, to: Square): { piece: PieceSymbol; square: Square }[] {
  const chess = new Chess(fenAfter)
  const piece = chess.get(to)
  if (!piece) return []
  const them = piece.color === 'w' ? 'b' : 'w'
  // A piece that's simply taken next forks nothing (unless it gives check: then they can't take first).
  const takers = chess.attackers(to, them)
  if (!chess.inCheck() && takers.length && (!chess.attackers(to, piece.color).length || takers.some((t) => VALUES[chess.get(t)!.type] < VALUES[piece.type] && chess.get(t)!.type !== 'k'))) return []
  const out: { piece: PieceSymbol; square: Square; value: number }[] = []
  for (const row of chess.board())
    for (const sq of row) {
      if (!sq || sq.color !== them || !chess.attackers(sq.square, piece.color).includes(to)) continue
      const defended = chess.attackers(sq.square, them).length > 0
      if (sq.type === 'k' || VALUES[sq.type] > VALUES[piece.type] || (!defended && sq.type !== 'p')) out.push({ piece: sq.type, square: sq.square, value: sq.type === 'k' ? 100 : VALUES[sq.type] })
    }
  return out.length >= 2 ? out.sort((a, b) => b.value - a.value) : []
}

/** "your king and rook", or "the king and the bishop on c5" when it's the other side's pieces. */
function forkWords(targets: { piece: PieceSymbol; square: Square }[], yours: boolean): string {
  const [a, b] = targets
  if (yours) return `your ${NAMES[a.piece]} and ${NAMES[b.piece]}`
  const name = (t: { piece: PieceSymbol; square: Square }) => (t.piece === 'k' ? 'the king' : `the ${NAMES[t.piece]} on ${t.square}`)
  return `${name(a)} and ${name(b)}`
}

/** One sentence on what a line does for the side to move, starting with its first move. */
function lineStory(fen: string, line: EngineLine, played: Played): string | null {
  const side = turnOf(fen)
  const first = lineText(fen, played.san.slice(0, 1))
  // Counted from the line itself when it ends in mate, so the words match the moves shown.
  const mate = played.mateAt ? Math.ceil(played.mateAt / 2) : mateFor(line.score, side)
  if (mate === 1) return `${first} is mate`
  if (mate) return `${first} starts a mate in ${mate}`
  // A win the other side chose (their sacrifice, first) isn't this line's doing.
  if (played.captures[0] && played.captures[0].by !== side) return null
  const won = winning(played, side)
  if (!won) return null
  const fork = played.fens[0] ? forkTargets(played.fens[0], line.pv[0].slice(2, 4) as Square) : []
  if (fork.length) return `${first} forks ${forkWords(fork, true)}, and ${won.text}`
  // Won later, by another piece: say which move does it.
  const { ply, from } = won.capture
  if (ply > 0 && from !== line.pv[0].slice(2, 4)) return `${first}, then ${numbered(fen, ply, played.san[ply])} ${won.text}`
  return `${first} ${won.text}`
}

/**
 * A threat worth naming by its first move: that move mates or takes something, or the piece it moves
 * takes something next ("e5, which wins the d6 pawn"). Not a quiet move after which material falls later.
 */
function direct(played: Played, pv: string[]): boolean {
  if (played.mateAt && played.mateAt <= 5) return true
  const side = played.captures[0] && played.captures.find((c) => c.ply % 2 === 0)
  return Boolean(side && (side.ply === 0 || (side.ply === 2 && side.from === pv[0]?.slice(2, 4))))
}

/** A clear win for the mover, short of a mate (that one says so itself). */
const clearWin = (score: Score, mover: Color) => score.type === 'cp' && (mover === 'white' ? 1 : -1) * score.value >= 300

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
  if (cp > -100) return `you’re only a little better ${tag}`
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

/**
 * A check that pulls a defender away: the reply moves the only piece guarding a square, and the next
 * move lands there with check or a capture. "22.Qf5+ forces …g6, and now nothing guards f6."
 */
function lever(fen: string, pv: string[]): { text: string; square: Square; at: number } | null {
  const start = new Chess(fen)
  const them = start.turn() === 'w' ? 'b' : 'w'
  const chess = new Chess(fen)
  const moves: { san: string; from: Square; to: Square; fen: string }[] = []
  for (const uci of pv.slice(0, 5)) {
    try {
      const m = chess.move(uciToMove(uci))
      moves.push({ san: m.san, from: m.from, to: m.to, fen: chess.fen() })
    } catch {
      break
    }
  }
  const [first, reply] = moves
  if (!first || !reply || !/\+/.test(first.san)) return null
  for (const k of [2, 4]) {
    const m = moves[k]
    if (!m || !/[+#x]/.test(m.san)) continue
    const guards = start.attackers(m.to, them)
    if (guards.length !== 1 || guards[0] !== reply.from || new Chess(moves[k - 1].fen).attackers(m.to, them).length) continue
    return { text: `${lineText(fen, [first.san])} forces …${reply.san}, and now nothing guards ${m.to}.`, square: m.to, at: k }
  }
  return null
}

/** The square of the missed line that the other side's reply now guards: "…Be7 guards f6". */
function shuts(fen: string, uci: string, keys: Square[]): Square | null {
  const before = new Chess(fen)
  const chess = new Chess(fen)
  let m
  try {
    m = chess.move(uciToMove(uci))
  } catch {
    return null
  }
  return keys.find((t) => t !== m.to && chess.attackers(t, m.color).includes(m.to) && !before.attackers(t, m.color).includes(m.from)) ?? null
}

/** The squares a line needs: where its side's checks and captures land, and the square a lever empties. */
function keysOf(fen: string, pv: string[], reach = 6): { square: Square; ply: number }[] {
  const out: { square: Square; ply: number }[] = []
  const pull = lever(fen, pv)
  if (pull && pull.at < reach) out.push({ square: pull.square, ply: pull.at })
  pvSan(fen, pv.slice(0, reach)).forEach((x, i) => {
    if (i % 2 === 0 && (i === 0 || /[+#x]/.test(x))) out.push({ square: squares(pv[i])[1], ply: i })
  })
  return out
}

/**
 * Why a better move works, in a few words: the square it guards against the line that hurt ("guards f6
 * against 23.Qf5+ g6 24.Nf6+"), or else the main thing it does on the board ("attacks the knight on e5").
 */
function betterPoint(fenBefore: string, bestUci: string, bestPv: string[], fenAfter: string, punisher: string[] | null, playedUci: string): string | null {
  // Against the line that hurt: only its first few moves, where the guard plainly matters.
  if (punisher) {
    const keys = keysOf(fenAfter, punisher, 3).filter((k) => k.square !== playedUci.slice(2, 4))
    const guarded = shuts(fenBefore, bestUci, keys.map((k) => k.square))
    if (guarded) {
      const k = keys.find((x) => x.square === guarded)!
      return `guards ${guarded} against ${lineText(fenAfter, pvSan(fenAfter, punisher.slice(0, k.ply + 1)))}`
    }
  }
  // Its main idea, unless the move played did the same (both "save the queen": that isn't the difference).
  const kind = (t: string) => t.split(' ').slice(0, 2).join(' ')
  const played = new Set(boardIdeas(fenBefore, playedUci, []).map((i) => kind(i.text)))
  const [idea] = boardIdeas(fenBefore, bestUci, bestPv.slice(1)).filter((i) => i.weight >= 9 && !played.has(kind(i.text)))
  return idea ? clause(idea.text) : null
}

/** An idea's sentence as a clause inside another: "Prepares Qh5: the bishop clears the way." → "prepares Qh5". */
const clause = (text: string) => {
  const head = text.split(':')[0].replace(/\.$/, '')
  return head.charAt(0).toLowerCase() + head.slice(1)
}

/** After a sacrifice is taken: the mate in one that follows, if there is one. */
function mateAfterTake(fen: string, uci: string, take: string): string | null {
  const chess = new Chess(fen)
  try {
    chess.move(uciToMove(uci))
    chess.move(uciToMove(take))
  } catch {
    return null
  }
  return mateInOne(chess.fen())
}

/** A mate in one for the side to move, if there is one: the move that would be mate with a free turn. */
function mateInOne(fen: string): string | null {
  const chess = new Chess(fen)
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m)
    const mate = chess.isCheckmate()
    chess.undo()
    if (mate) return m.from + m.to + (m.promotion ?? '')
  }
  return null
}

function shownLine(label: string, from: 'before' | 'after', fen: string, pv: string[], played: Played): ShownLine {
  const n = Math.min(Math.max(played.length, 2), played.san.length)
  return { label, from, fen, uci: pv.slice(0, n), text: lineText(fen, played.san.slice(0, n)) }
}

/** The `k`th move of a line from `fen`, numbered: "6…Kxf7". */
function numbered(fen: string, k: number, san: string): string {
  const [, turn, , , , full] = fen.split(' ')
  const ply = (turn === 'w' ? 0 : 1) + k
  const n = (Number(full) || 1) + Math.floor(ply / 2)
  return ply % 2 === 0 ? `${n}.${san}` : `${n}…${san}`
}

const rank = (p: PieceSymbol) => (p === 'k' ? 50 : VALUES[p])

/** The piece a move gives up: it lands where the other side can take it, for less than it's worth. */
function sacrifice(fen: string, uci: string): { piece: PieceSymbol; square: Square; check: boolean; take: string } | null {
  const chess = new Chess(fen)
  let move
  try {
    move = chess.move(uciToMove(uci))
  } catch {
    return null
  }
  if (move.piece === 'p' || move.piece === 'k' || VALUES[move.piece] - (move.captured ? VALUES[move.captured] : 0) < 2) return null
  const takes = chess
    .moves({ verbose: true })
    .filter((m) => m.to === move.to && m.captured)
    .sort((a, b) => rank(a.piece) - rank(b.piece))
  if (!takes.length) return null
  // Defended, and only something as good can take it: a trade, not a sacrifice.
  if (chess.attackers(move.to, move.color).length && rank(takes[0].piece) >= VALUES[move.piece]) return null
  return { piece: move.piece, square: move.to, check: chess.inCheck(), take: takes[0].from + takes[0].to + (takes[0].promotion ?? '') }
}

/**
 * A line that starts by giving up a piece the engine's defence leaves alone: the position after it's
 * taken anyway, for a search of how that goes. Null when there's no such sacrifice.
 */
export function takeFen(fen: string, pv: string[]): string | null {
  const sac = pv[0] ? sacrifice(fen, pv[0]) : null
  if (!sac || pv[1]?.slice(2, 4) === sac.square) return null
  const chess = new Chess(fen)
  chess.move(uciToMove(pv[0]))
  chess.move(uciToMove(sac.take))
  return chess.fen()
}

/** "h-pawn", "knight": the piece a move is made with. */
function retakerWords(fen: string, uci: string): string {
  const p = new Chess(fen).get(squares(uci)[0])
  return !p ? 'piece' : p.type === 'p' ? `${uci[0]}-pawn` : NAMES[p.type]
}

/** Who takes a sacrifice: "the h6 pawn", "the rook on d8", "the king". */
function takerWords(fen: string, uci: string, take: string): string {
  const chess = new Chess(fen)
  try {
    chess.move(uciToMove(uci))
  } catch {
    return 'them'
  }
  const sq = take.slice(0, 2) as Square
  const p = chess.get(sq)
  return !p ? 'them' : p.type === 'k' ? 'the king' : pieceWords({ piece: p.type, square: sq })
}

/**
 * A line that starts with a sacrifice, as its own rows: the sacrifice, what happens if it's taken (a fork,
 * winning it back) and where it ends up either way (material, a king that can't castle).
 */
function sacrificeStory(
  fen: string,
  line: EngineLine,
  take: EngineLine | null | undefined,
  opts: { key: ExplainRow['key']; label: string; from: 'before' | 'after'; brush: ExplainShape['brush']; yours: boolean; standing: string },
): { rows: ExplainRow[]; lines: ShownLine[] } | null {
  const sac = line.pv[0] ? sacrifice(fen, line.pv[0]) : null
  if (!sac) return null
  const side = turnOf(fen)
  const them = other(side)
  const arrow = (uci: string): ExplainShape => ({ orig: squares(uci)[0], dest: squares(uci)[1], brush: opts.brush })
  const [firstSan] = pvSan(fen, line.pv.slice(0, 1))
  // An exchange sacrifice takes something on the way.
  const took = new Chess(fen).get(squares(line.pv[0])[1])?.type
  const rows: ExplainRow[] = [
    {
      key: opts.key,
      label: opts.label,
      text: `${lineText(fen, [firstSan])} gives up the ${NAMES[sac.piece]}${took ? ` for ${pieceWords({ piece: took, square: squares(line.pv[0])[1] })}` : ''}${sac.check ? ' with check' : ''}: ${takerWords(fen, line.pv[0], sac.take)} can take it.`,
      shapes: [arrow(line.pv[0])],
      play: play(fen, line.pv, 1),
    },
  ]
  const lines: ShownLine[] = []

  // If it's taken: the whole line from the sacrifice, the capture and what follows.
  const taken = line.pv[1]?.slice(2, 4) === sac.square
  const takeUci = taken ? line.pv : take ? [line.pv[0], sac.take, ...take.pv] : null
  if (takeUci) {
    const start = new Chess(fen)
    const startBalance = balance(start, side)
    const sans: string[] = []
    let regain: number | null = null
    let regained: PieceSymbol | undefined
    let fork: ReturnType<typeof forkTargets> = []
    let takenFen: string | null = null
    for (const [i, uci] of takeUci.slice(0, 8).entries()) {
      let move
      try {
        move = start.move(uciToMove(uci))
      } catch {
        break
      }
      sans.push(move.san)
      if (i === 1) takenFen = start.fen()
      if (i === 2) fork = forkTargets(start.fen(), move.to)
      // The side that sacrificed is level again or better: the piece is back.
      if (i >= 2 && i % 2 === 0 && regain === null && balance(start, side) >= startBalance) {
        regain = i
        regained = move.captured
      }
    }
    const takeText = numbered(fen, 1, sans[1])
    if (sans[2] && (fork.length || regain !== null)) {
      const regainText = regain !== null && regain > 2 ? numbered(fen, regain, sans[regain]) : null
      const firstText = numbered(fen, 2, sans[2])
      // Winning back more than was given is worth naming: "22.Rxc5 wins the queen".
      const back = regained && VALUES[regained] > VALUES[sac.piece] ? `wins the ${NAMES[regained]}` : 'wins it back'
      const what = fork.length ? `${firstText} forks ${forkWords(fork, !opts.yours)}` : regain === 2 ? `${firstText} ${back}` : `${firstText} follows`
      const n = Math.max(regain ?? 0, 2) + 1
      rows.push({
        key: 'take',
        label: `If ${takeText}`,
        text: `${what}${regainText ? `, and ${regainText} ${back}` : ''}.`,
        shapes: [arrow(takeUci[2]), ...(regain !== null && regain > 2 ? [arrow(takeUci[regain])] : [])],
        ...(takenFen && { position: { fen: takenFen, lastMove: [...squares(takeUci[1])] as [Square, Square] } }),
        play: play(fen, takeUci, n),
      })
      lines.push({ label: `If ${takeText}`, from: opts.from, fen, uci: takeUci.slice(0, n), text: lineText(fen, sans.slice(0, n)) })
    }
  }

  // Either way: where the main line ends up.
  const played = playLine(fen, line.pv)
  const end = new Chess(fen)
  try {
    for (const uci of line.pv.slice(0, 2)) end.move(uciToMove(uci))
  } catch {
    // A line that can't be played this far: the sacrifice's rows still stand.
  }
  const canCastle = (f: string) => (them === 'white' ? /[KQ]/ : /[kq]/).test(f.split(' ')[2])
  const lostCastling = canCastle(fen) && !canCastle(end.fen())
  const ahead = played.gain >= 1 ? `${sideName(side)} ends ${amount(played.gain)} up` : null
  const parts = [ahead, lostCastling ? `${sideName(them)} can’t castle any more` : null].filter(Boolean)
  // Nothing more to show: the sacrifice says where it leaves things itself.
  if (!parts.length && rows.length === 1) rows[0].text += ` ${capitalise(opts.standing)}.`
  if (parts.length) {
    rows.push({
      key: 'result',
      label: rows.length > 1 && !taken ? 'Either way' : 'Then',
      text: `${capitalise(parts.join(', and '))} (${formatScore(line.score)}).`,
      shapes: [arrow(line.pv[0])],
      play: play(fen, line.pv, played.length),
    })
  }
  if (!taken) lines.push(shownLine(lines.length ? 'Best defence' : 'The line', opts.from, fen, line.pv, played))
  else if (!lines.length) lines.push(shownLine('The line', opts.from, fen, line.pv, played))
  return { rows, lines }
}

/** Why a mistake was a mistake, as short rows. Null when there's nothing we can show for sure. */
export function explainMove(input: ExplainInput): Explanation | null {
  const { fenBefore, uci, san, cls, best, reply, threat, bestTake, replyTake } = input
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
  if (!WRONG.includes(cls)) return explainGood(input, fenAfter)
  const rows: ExplainRow[] = []
  const bestUci = best.pv[0]
  const bestPlayed = bestUci ? playLine(fenBefore, best.pv) : null
  const bestSan = bestPlayed?.san[0]
  // Taking back on the square the last move took on: a recapture, not a win ("12…hxg6 takes back").
  const bestRetakes = Boolean(bestUci && input.previous && input.previous.slice(2, 4) === bestUci.slice(2, 4))
  const retakeWords = bestRetakes && bestUci ? `takes back with the ${retakerWords(fenBefore, bestUci)}` : null
  const pull = bestUci ? lever(fenBefore, best.pv) : null
  // The squares the missed line needed: where its checks and captures land.
  const keys = [...(pull ? [pull.square] : []), ...(bestPlayed?.san ?? []).flatMap((x, i) => (i % 2 === 0 && /[+#x]/.test(x) ? [squares(best.pv[i])[1]] : []))]

  /** What the better move would have done, and the move played letting it go. */
  const chance = (note: string, also?: string): Explanation | null => {
    if (!bestUci || !bestSan || !bestPlayed) return null
    const moveRow: ExplainRow = { key: 'move', label: san, text: note, shapes: [{ orig: from, dest: to, brush: 'yellow' }], play: play(fenBefore, [uci]) }
    // Only a shot missed when it's gone: still winning after the move isn't "you had a winning shot".
    const shot = clearWin(best.score, mover) && !clearWin(reply.score, mover)
    const facts = (chance: string): CoachFacts => ({ chance, own: also, shot, mate: Boolean(mateFor(best.score, mover)) })
    const sac = sacrificeStory(fenBefore, best, bestTake, { key: 'chance', label: 'The chance', from: 'before', brush: 'suggest', yours: true, standing: standing(best.score, mover) })
    if (sac) {
      // The coach tells a sacrifice only with why it works; on its own, "it can be taken" just confuses.
      const take = sac.rows.find((r) => r.key === 'take')
      const coach = take
        ? facts(`${sac.rows[0].text.split('. ')[0].replace(/\.$/, '')}. ${take.label}, ${take.text.charAt(0).toLowerCase()}${take.text.slice(1)}`)
        : { better: { move: lineText(fenBefore, [bestSan]), point: null }, own: also, shot, mate: Boolean(mateFor(best.score, mover)) }
      return { rows: [...sac.rows, moveRow], lines: sac.lines, coach }
    }
    const opener = shot ? 'You had a winning shot. ' : ''
    // With the opener said, the score alone is enough.
    const where = opener ? ` (${formatScore(best.score)}).` : `. ${capitalise(standing(best.score, mover))}.`
    // The check that pulls a defender away, then where it leads, played out to the point.
    if (pull) {
      const long = playLine(fenBefore, best.pv, 14)
      const wins = long.mateAt ? 'leads to mate' : winsWhat(long, mover)
      const fenAt = long.fens[pull.at - 1]
      const next = best.pv[pull.at]
      if (wins && fenAt && next && long.length > pull.at) {
        rows.push(
          { key: 'chance', label: 'The chance', text: `${opener}${pull.text}`, shapes: [{ orig: squares(bestUci)[0], dest: squares(bestUci)[1], brush: 'suggest' }, { orig: pull.square, brush: 'red' }], play: play(fenBefore, best.pv, pull.at) },
          {
            key: 'result',
            label: 'Then',
            text: `${lineText(fenAt, long.san.slice(pull.at, pull.at + 3))} ${wins}${where}`,
            shapes: [{ orig: squares(next)[0], dest: squares(next)[1], brush: 'suggest' }],
            position: { fen: fenAt, lastMove: squares(best.pv[pull.at - 1]) as [Square, Square] },
            play: play(fenAt, best.pv.slice(pull.at), long.length - pull.at),
          },
          moveRow,
        )
        return { rows, lines: [shownLine('The line', 'before', fenBefore, best.pv, long)], coach: facts(pull.text) }
      }
    }
    const story = bestRetakes ? null : lineStory(fenBefore, best, bestPlayed)
    const point = story ? null : retakeWords ?? betterPoint(fenBefore, bestUci, best.pv, fenAfter, reply.pv, uci)
    const text = story
      ? `${opener}${capitalise(story)}${where}`
      : point
        ? `${opener}${lineText(fenBefore, [bestSan])} was the move: it ${point}${where}`
        : `${opener}${lineText(fenBefore, [bestSan])} was the move: ${standing(best.score, mover)}.`
    rows.push({ key: 'chance', label: 'The chance', text, shapes: [{ orig: squares(bestUci)[0], dest: squares(bestUci)[1], brush: 'suggest' }], play: play(fenBefore, best.pv, bestPlayed.length) }, moveRow)
    const bestText = lineText(fenBefore, [bestSan])
    return {
      rows,
      lines: [shownLine('The line', 'before', fenBefore, best.pv, bestPlayed)],
      coach: story ? facts(`${capitalise(story)}.`) : { better: { move: bestText, point }, own: also, shot, mate: Boolean(mateFor(best.score, mover)) },
    }
  }

  // A miss: the opponent had just slipped, and the move doesn't make them pay.
  if (cls === 'miss') return chance(`Misses ${bestSan ? lineText(fenBefore, [bestSan]) : 'it'}. ${capitalise(theirStanding(reply.score, them))}.`)

  // Not losing, just not winning: what was there is the story, not what comes next.
  const moverAfter = (mover === 'white' ? 1 : -1) * (reply.score.type === 'cp' ? reply.score.value : reply.score.value > 0 ? 10000 : -10000)
  const moverBest = (mover === 'white' ? 1 : -1) * (best.score.type === 'cp' ? best.score.value : best.score.value > 0 ? 10000 : -10000)
  if (moverAfter > -50) {
    const [replySan] = reply.pv[0] ? pvSan(fenAfter, reply.pv.slice(0, 1)) : []
    const shut = replySan ? shuts(fenAfter, reply.pv[0], keys) : null
    const afterText = !replySan ? '' : shut ? ` After …${replySan}, which guards ${shut}, ${theirStanding(reply.score, them)}.` : ` After ${lineText(fenAfter, [replySan])}, ${theirStanding(reply.score, them)}.`
    // What the move was for, when there's something real to say: "Saves the attacked b2 pawn, but it's too slow."
    const [purpose] = boardIdeas(fenBefore, uci, reply.pv).filter((i) => i.weight >= 9)
    const head = purpose
      ? `${capitalise(clause(purpose.text))}, but ${bestSan && /[+#x]/.test(bestSan) ? 'it’s too slow' : 'it misses the chance'}.`
      : san.includes('+') ? 'The check leads nowhere.'
      : moverBest >= 300 && moverAfter < 150 ? 'Lets the win slip.' : 'Lets some of the edge go.'
    // For the coach: what the move did, said of the move itself.
    const also = purpose ? `${san} ${clause(purpose.text)}, but it’s ${bestSan && /[+#x]/.test(bestSan) ? 'too slow' : 'not the best'}.` : san.includes('+') ? `${san} is a check that leads nowhere.` : undefined
    return chance(`${head}${afterText}`, also)
  }

  const replyUci = reply.pv[0]
  if (!replyUci) return null
  const punished = playLine(fenAfter, reply.pv)
  const replySan = punished.san[0]
  if (!replySan) return null
  const [rFrom, rTo] = squares(replyUci)
  const movedCapture = new Chess(fenBefore).get(to)?.type
  // A capture is counted from before it, so taking back isn't a win: what's lost for good is the story.
  const net = movedCapture ? playLine(fenBefore, [uci, ...reply.pv], 10) : null
  const netWon = net ? winning(net, them) : null
  const story = !net || punished.mateAt || mateFor(reply.score, them)
    ? lineStory(fenAfter, reply, punished)
    : netWon && netWon.capture.ply > 1
      ? `${lineText(fenAfter, [replySan])}, then ${numbered(fenAfter, netWon.capture.ply - 1, net.san[netWon.capture.ply])} ${netWon.text}`
      : netWon
        ? `${lineText(fenAfter, [replySan])} ${netWon.text}`
        : null
  // What they take for good (nothing, if it's only a trade).
  const firstTake = punished.gain >= 1 && (!net || netWon) ? punished.captures.find((c) => c.by === them) : undefined
  const traded = movedCapture && firstTake?.square === to && VALUES[movedCapture] >= VALUES[firstTake.piece]

  // The threat: what they had before the move, if the move did nothing about it.
  let threatened = false
  if (threat?.pv[0] === replyUci) {
    const fenNull = nullMoveFen(fenBefore)
    const t = fenNull ? playLine(fenNull, threat.pv) : null
    const tStory = fenNull && t ? lineStory(fenNull, threat, t) : null
    // Only when it's the same story: a move that half-answers the threat (a counter-attack) isn't "nothing".
    if (tStory && t && direct(t, threat.pv) && (mateFor(threat.score, them) || Math.abs(t.gain - punished.gain) <= 1)) {
      threatened = true
      const what = tStory.replace(/^\S+ /, '')
      rows.push({
        key: 'threat',
        label: 'The threat',
        text: `${sideName(them)} was threatening ${replySan.replace(/[+#]$/, '')}, which ${what}.`,
        shapes: [{ orig: rFrom, dest: rTo, brush: 'red' }],
        ...(fenNull && { play: play(fenNull, [replyUci]) }),
      })
    }
  }

  // What the move itself does wrong.
  const moveShapes: ExplainShape[] = [{ orig: from, dest: to, brush: 'yellow' }]
  let moveText: string | null = null
  if (threatened) moveText = `Does nothing about ${replySan.replace(/[+#]$/, '')}.`
  else if (!traded && firstTake?.square === to && punished.gain >= Math.max(1, VALUES[firstTake.piece] - 1)) {
    moveText = `Puts the ${NAMES[firstTake.piece]} where it can be taken.`
  } else if (firstTake && firstTake.square !== to) {
    // It used to guard what gets taken.
    const guards = new Chess(fenBefore).attackers(firstTake.square, short(mover))
    const guardsAfter = new Chess(fenAfter).attackers(firstTake.square, short(mover))
    if (guards.includes(from) && !guardsAfter.includes(to)) {
      const piece = pieceAt(fenAfter, firstTake.square)
      moveText = `Stops guarding the ${piece?.type === 'p' ? `${firstTake.square} pawn` : `${NAMES[firstTake.piece]} on ${firstTake.square}`}.`
      moveShapes.push({ orig: firstTake.square, brush: 'red' })
    }
  }
  if (!moveText && between(rFrom, rTo).includes(from)) moveText = `Opens the way for ${lineText(fenAfter, [replySan])}.`
  // It stops guarding a piece, and the reply goes straight for it.
  if (!moveText) {
    const b = new Chess(fenBefore)
    const a = new Chess(fenAfter)
    const r = new Chess(fenAfter)
    try {
      r.move(uciToMove(replyUci))
      for (const row of a.board())
        for (const x of row) {
          if (moveText || !x || x.color !== short(mover) || x.type === 'k' || x.square === to) continue
          const was = b.attackers(x.square, short(mover)).includes(from)
          const now = a.attackers(x.square, short(mover)).includes(to)
          const hit = r.attackers(x.square, short(them)).includes(rTo) && !a.attackers(x.square, short(them)).includes(rFrom)
          // And it's really in danger now: nothing else guards it, or the attacker is worth less.
          const attacker = r.get(rTo)
          const exposed = !r.attackers(x.square, short(mover)).length || (attacker && attacker.type !== 'k' && VALUES[attacker.type] < VALUES[x.type])
          if (was && !now && hit && exposed) {
            moveText = `Stops guarding ${pieceWords({ piece: x.type, square: x.square })}, and ${lineText(fenAfter, [replySan])} attacks it.`
            moveShapes.push({ orig: x.square, brush: 'red' })
          }
        }
    } catch {
      // The reply doesn't play: nothing to say about it.
    }
  }
  if (moveText) rows.push({ key: 'move', label: san, text: moveText, shapes: moveShapes, play: play(fenBefore, [uci]) })

  // How it loses: the punishing line, played out.
  const label = cls === 'blunder' ? 'How it loses' : 'What it allows'
  const mating = mateFor(reply.score, them) && sacrifice(fenAfter, replyUci)
    ? mateRows({ fenBefore: fenAfter, uci: replyUci, san: replySan, reply: { pv: reply.pv.slice(1), score: reply.score }, playedTake: replyTake, theirs: true }, punished.fens[0], { orig: rFrom, dest: rTo, brush: 'red' }, punished.length)
    : null
  const sac = mating ? { rows: mating, lines: [] as ShownLine[] } : sacrificeStory(fenAfter, reply, replyTake, { key: 'loses', label, from: 'after', brush: 'red', yours: false, standing: theirStanding(reply.score, them) })
  const loses = story ? `${capitalise(story)}. ${theirStanding(reply.score, them)}.` : `After ${lineText(fenAfter, [replySan])}, ${theirStanding(reply.score, them)}.`
  const loseShapes: ExplainShape[] = [{ orig: rFrom, dest: rTo, brush: 'red' }]
  if (firstTake && firstTake.square !== rTo) loseShapes.push({ orig: firstTake.square, brush: 'red' })
  if (sac) rows.push(...sac.rows)
  else rows.push({ key: 'loses', label, text: loses, shapes: loseShapes, play: play(fenAfter, reply.pv, punished.length) })

  // Better: the review's best move, and what it does about it.
  let bestPoint: CoachFacts['better'] | null = null
  if (bestUci && bestSan && bestPlayed) {
    const [bFrom, bTo] = squares(bestUci)
    const bestText = lineText(fenBefore, [bestSan])
    let point: string | null = null
    const bestStory = bestRetakes ? null : lineStory(fenBefore, best, bestPlayed)
    if (retakeWords) point = retakeWords
    else if (bestStory && (mateFor(best.score, mover) || bestPlayed.gain >= 1)) point = bestStory.replace(/^\S+ /, '')
    else if (firstTake && bFrom === firstTake.square) point = `saves the ${NAMES[firstTake.piece]}`
    // Only for a quiet reply: guarding the square of a capture is a different story.
    else if (!pieceAt(fenAfter, rTo) && coversReply(fenBefore, bestUci, replyUci)) point = `covers ${rTo}`
    else if (sacrifice(fenBefore, bestUci)) point = `sacrifices the ${NAMES[sacrifice(fenBefore, bestUci)!.piece]}`
    else point = betterPoint(fenBefore, bestUci, best.pv, fenAfter, reply.pv, uci)
    bestPoint = { move: bestText, point }
    rows.push({
      key: 'better',
      label: 'Better',
      text: `${bestText}${point ? `${point.startsWith('then ') ? ',' : ''} ${point}` : ' was the move'}. ${capitalise(standing(best.score, mover))}.`,
      shapes: [{ orig: bFrom, dest: bTo, brush: 'suggest' }],
      play: play(fenBefore, best.pv, bestPlayed.length),
    })
  }

  // For the coach: what the move did wrong, then what it allows (or else what was better).
  const allows = mating
    ? `${lineText(fenAfter, [replySan])} gives up ${mating[0].text.match(/gives up (the \w+)/)?.[1] ?? 'a piece'}, and it’s mate either way.`
    : sac?.rows.some((r) => r.key === 'take')
      ? `${sac.rows[0].text.split('. ')[0].replace(/\.$/, '')}.`
      : story
        ? `${capitalise(story)}.`
        : null
  const own = moveText ? `${san} ${moveText.charAt(0).toLowerCase()}${moveText.slice(1)}` : undefined
  const coach: CoachFacts = { own, allows: allows ?? undefined, better: bestPoint ?? undefined }
  return { rows, lines: sac?.lines ?? [shownLine('The line', 'after', fenAfter, reply.pv, punished)], coach }
}

/** "the knight guards h7": a piece of the mating side, besides the mating one, covering the mating square. */
function mateGuard(fenMate: string, sq: Square, moved: Square): string | null {
  const chess = new Chess(fenMate)
  const mater = chess.get(sq)
  const [g] = mater ? chess.attackers(sq, mater.color) : []
  if (!g) return null
  const p = chess.get(g)!
  return `${g === moved ? `the ${NAMES[p.type]}` : p.type === 'p' ? `the ${g} pawn` : `the ${NAMES[p.type]} on ${g}`} guards ${sq}`
}

/**
 * A move that leads to mate, told like a coach: what it gives up, the mate it threatens and what makes
 * it work, and when it's a sacrifice, why taking it is mate too.
 */
interface MateInput {
  fenBefore: string
  uci: string
  san: string
  reply: EngineLine
  ownThreat?: EngineLine | null
  playedTake?: EngineLine | null
  /** The opponent's move, told to the player who's getting mated. */
  theirs?: boolean
}

function mateRows(input: MateInput, fenAfter: string, mine: ExplainShape, n: number): ExplainRow[] | null {
  const { fenBefore, uci, san, reply, ownThreat, playedTake, theirs } = input
  const [, to] = squares(uci)
  const them = other(turnOf(fenBefore))
  const rows: ExplainRow[] = []
  const mateText = (k: number, s: string) => `${numbered(fenBefore, k, s.replace(/#$/, ''))} mate`
  const sac = sacrifice(fenBefore, uci)

  // What it gives up, said first: the point of a sacrifice is that it looks like a gift.
  if (sac) {
    const [tFrom] = squares(sac.take)
    const taker = new Chess(fenAfter).get(tFrom)
    const who = !taker ? 'it' : taker.type === 'p' ? `the ${tFrom} pawn` : `the ${NAMES[taker.type]} on ${tFrom}`
    const gives = `ives up the ${NAMES[sac.piece]}: ${who} can take it.`
    rows.push({
      key: theirs ? 'loses' : 'idea',
      label: theirs ? 'How it loses' : 'The idea',
      text: theirs ? `${lineText(fenBefore, [san])} g${gives}` : `G${gives}`,
      shapes: [mine, { orig: tFrom, dest: sac.square, brush: 'red' }],
      play: play(fenBefore, [uci]),
    })
  }

  // The mate it threatens: what it would do with a free move, or else the line itself.
  let threat: { san: string; from: Square; to: Square; fen: string } | null = null
  const ownNull = nullMoveFen(fenAfter)
  // Without the search for it, a mate in one is easy to find by hand.
  const threatUci = ownThreat?.pv[0] ?? (ownNull ? mateInOne(ownNull) : null)
  if (threatUci && ownNull) {
    try {
      const c = new Chess(ownNull)
      const m = c.move(uciToMove(threatUci))
      if (c.isCheckmate()) threat = { san: m.san, from: m.from, to: m.to, fen: c.fen() }
    } catch {
      // Not a move here: no threat to name.
    }
  }
  const pv = [uci, ...reply.pv]
  const played = playLine(fenBefore, pv, 12)
  if (threat && !san.includes('+')) {
    const guard = mateGuard(threat.fen, threat.to, to)
    rows.push({
      key: sac ? 'threat' : 'idea',
      label: sac ? 'The threat' : 'The idea',
      text: `${sac ? `Next is ${mateText(2, threat.san)}` : `Threatens ${mateText(2, threat.san)}`}${guard ? `: ${guard}` : ''}.`,
      shapes: [mine, { orig: threat.from, dest: threat.to, brush: 'yellow' }],
      play: play(fenBefore, pv, n),
    })
  } else if (played.mateAt) {
    const k = played.mateAt - 1
    const guard = mateGuard(played.fens[k], squares(pv[k])[1], to)
    const end = `${numbered(fenBefore, k, played.san[k])}${guard ? `, and ${guard}` : ''}`
    rows.push({ key: sac ? 'threat' : 'idea', label: sac ? 'Then' : 'The idea', text: `${sac ? 'It s' : 'S'}tarts a mate in ${Math.ceil(played.mateAt / 2)}: it ends with ${end}.`, shapes: [mine], play: play(fenBefore, pv, played.mateAt) })
  } else return null

  // A sacrifice: taking it is mate too, often because the piece that takes stops guarding something.
  const takeMate = playedTake?.pv[0] ?? (sac ? mateAfterTake(fenBefore, uci, sac.take) : null)
  if (sac && takeMate) {
    const line = [uci, sac.take, takeMate]
    const c = new Chess(fenBefore)
    try {
      c.move(uciToMove(line[0]))
      const take = c.move(uciToMove(line[1]))
      const takenFen = c.fen()
      const mate = c.move(uciToMove(line[2]))
      if (c.isCheckmate()) {
        const left = new Chess(fenAfter).attackers(mate.to, take.color).includes(take.from)
        const who = take.piece === 'p' ? 'pawn' : NAMES[take.piece]
        rows.push({
          key: 'take',
          label: `If ${numbered(fenBefore, 1, take.san)}`,
          text: `${left ? `The ${who} has left ${take.from}, so ` : ''}${numbered(fenBefore, 2, mate.san.replace(/#$/, ''))} is mate.`,
          shapes: [{ orig: mate.from, dest: mate.to, brush: 'suggest' }, ...(left ? [{ orig: take.from, brush: 'red' as const }] : [])],
          position: { fen: takenFen, lastMove: [take.from, take.to] },
          play: play(fenBefore, line, 3),
        })
        rows.push({ key: 'result', label: 'Either way', text: `${theirs ? 'You' : sideName(them)} can’t take it and can’t leave it: it’s mate either way.`, shapes: [mine] })
      }
    } catch {
      // The take doesn't play: the threat alone tells it.
    }
  }
  return rows
}

/** A move that's fine: what it does (when there's something real to point at), then what else there was. */
function explainGood(input: ExplainInput, fenAfter: string): Explanation | null {
  const { fenBefore, uci, cls, best, reply, threat, ownThreat, playedTake, second, previous } = input
  const mover = turnOf(fenBefore)
  const them = other(mover)
  const [from, to] = squares(uci)
  const mine: ExplainShape = { orig: from, dest: to, brush: 'suggest' }
  const playedLine: EngineLine = { pv: [uci, ...reply.pv], score: reply.score }
  const played = playLine(fenBefore, playedLine.pv)
  const rows: ExplainRow[] = []
  let lines: ShownLine[] = []
  const idea = (text: string, shapes: ExplainShape[] = [mine], n = 1) =>
    rows.push({ key: 'idea', label: 'The idea', text, shapes, play: play(fenBefore, playedLine.pv, n) })

  const after = new Chess(fenAfter)
  const move = new Chess(fenBefore).move(uciToMove(uci))
  // A line that ends in mate is ours only when we give it (an odd number of moves in).
  const mate = played.mateAt ? (played.mateAt % 2 ? Math.ceil(played.mateAt / 2) : null) : mateFor(reply.score, mover)
  const mated = mateFor(reply.score, them)
  const sac = sacrificeStory(fenBefore, playedLine, playedTake, { key: 'idea', label: 'The idea', from: 'before', brush: 'suggest', yours: true, standing: standing(reply.score, mover) })
  const wins = winsWhat(played, mover)
  const fork = forkTargets(fenAfter, to)
  // What they were threatening, if this move stops it.
  const fenNull = nullMoveFen(fenBefore)
  const tPlayed = threat && fenNull ? playLine(fenNull, threat.pv) : null
  const tStory = threat && fenNull && tPlayed && direct(tPlayed, threat.pv) ? lineStory(fenNull, threat, tPlayed) : null
  // What the move threatens now.
  const ownNull = nullMoveFen(fenAfter)
  const oPlayed = ownThreat && ownNull ? playLine(ownNull, ownThreat.pv) : null
  const oStory = ownThreat && ownNull && oPlayed && direct(oPlayed, ownThreat.pv) ? lineStory(ownNull, ownThreat, oPlayed) : null
  // Without those searches, a mate in one either way is still plain to see.
  const ownMate = !ownThreat && ownNull ? mateInOne(ownNull) : null
  const theirMate = !threat && fenNull ? mateInOne(fenNull) : null
  // Taking back what was just taken: material was down before the move and level after it.
  const behind = balance(new Chess(fenBefore), mover)
  const winsBack = move.captured && (input.previous !== undefined ? previous?.slice(2, 4) === to : behind < 0 && played.gain <= -behind)
  const replySan = reply.pv[0] ? pvSan(fenAfter, reply.pv.slice(0, 2)) : []
  // A check that also hits a piece, which falls once the king has moved.
  const won = winning(played, mover)
  const forkWin = !move.captured && after.inCheck() && won && won.capture.from === to && won.capture.ply === 2 ? won : null
  // Out of check: and what still falls anyway.
  const inCheck = new Chess(fenBefore).inCheck()
  // Long enough to see an exchange through: a recapture six moves in still counts.
  const punished = reply.pv.length ? playLine(fenAfter, reply.pv, 10) : null
  // "Still" only when it falls at once: the very next move takes it.
  const stillLost = punished?.captures[0]?.ply === 0 && punished.captures[0].by === them ? winsWhat(punished, them) : null
  // A threat they can simply answer by taking the piece that makes it isn't one.
  const ownTaken = ownThreat?.pv[0] && reply.pv[0]?.slice(2, 4) === ownThreat.pv[0].slice(0, 2)
  // What the move does on the board: its outpost, file, pin, passed pawn…
  const [top] = boardIdeas(fenBefore, uci, reply.pv)

  if (after.isCheckmate()) idea('Checkmate.')
  else if (mated && reply.pv[0]) {
    // Lost anyway: the best move only delays it.
    const [mSan] = replySan
    const mateNow = mated === 1 && mSan ? `${numbered(fenAfter, 0, mSan.replace(/#$/, ''))} is mate` : `it’s mate in ${mated}`
    idea(`${move.captured ? `Takes the ${NAMES[move.captured]}, but n` : 'N'}othing saves the king now: ${mateNow}.`, [mine, { orig: squares(reply.pv[0])[0], dest: squares(reply.pv[0])[1], brush: 'red' }], 2)
  } else if (mate) {
    const told = mateRows(input, fenAfter, mine, played.mateAt ?? played.length)
    if (told) rows.push(...told)
    else idea(`Starts a mate in ${mate}.`, [mine], played.mateAt ?? played.length)
  }
  else if (cls === 'forced') idea('The only legal move.')
  else if (sac) {
    rows.push(...sac.rows)
    lines = sac.lines
  } else if (winsBack) idea(`Takes back the ${NAMES[move.captured!]}.`)
  else if (move.captured && wins && fork.length) {
    // "Wins the knight on g4 and the e6 pawn: it forks the king and the knight." when the fork is how.
    const how = fork.some((f) => wins.includes(f.square))
    idea(how ? `${capitalise(wins)}: it forks ${forkWords(fork, false)}.` : `Forks ${forkWords(fork, false)}, and ${wins}.`, [mine], played.length)
  } else if (move.captured && won && won.capture.ply > 0 && won.capture.from !== to) {
    // The capture isn't the win; a later move is: "Takes the e4 pawn, then 6…Qxd5 wins the bishop on d5."
    const traded = played.captures[1]?.ply === 1 && played.captures[1].square === to && VALUES[played.captures[1].piece] === VALUES[move.captured]
    const first = traded ? `Trades ${move.captured === move.piece ? `${NAMES[move.piece]}s` : `the ${NAMES[move.piece]} for the ${NAMES[move.captured]}`}` : `Takes the ${move.captured === 'p' ? `${to} pawn` : `${NAMES[move.captured]} on ${to}`}`
    idea(`${first}, then ${numbered(fenBefore, won.capture.ply, played.san[won.capture.ply])} ${won.text}.`, [mine], played.length)
  } else if (move.captured && wins) idea(`${capitalise(wins)}.`, [mine], played.length)
  else if (move.captured) idea(`Takes the ${move.captured === 'p' ? `${to} pawn` : `${NAMES[move.captured]} on ${to}`}.`)
  else if (forkWin) {
    const target = pieceWords(forkWin.capture)
    idea(`Forks the king and ${target}: after the king moves, ${numbered(fenBefore, 2, played.san[2])} wins it.`, [mine, { orig: to, dest: forkWin.capture.square, brush: 'yellow' }], 3)
  } else if (inCheck) {
    idea(`Gets out of check${stillLost && replySan[0] ? `, but ${lineText(fenAfter, [replySan[0]])} still ${stillLost}` : ''}.`, [mine], stillLost ? 2 : 1)
  }
  else if (tStory && reply.pv[0] !== threat!.pv[0]) {
    idea(`Deals with ${sideName(them)}’s threat of ${tPlayed!.san[0].replace(/[+#]$/, '')}, which ${tStory.replace(/^\S+ /, '')}.`, [{ ...mine }, { orig: squares(threat!.pv[0])[0], dest: squares(threat!.pv[0])[1], brush: 'red' }])
  } else if (theirMate && reply.pv[0] !== theirMate && !mateInOne(fenAfter)) {
    idea(`Stops ${numbered(fenAfter, 0, pvSan(fenNull!, [theirMate])[0].replace(/#$/, ''))} mate.`, [mine, { orig: squares(theirMate)[0], dest: squares(theirMate)[1], brush: 'red' }])
  } else if (ownMate && !after.inCheck()) {
    idea(`Threatens ${numbered(fenAfter, 1, pvSan(ownNull!, [ownMate])[0].replace(/#$/, ''))} mate.`, [mine, { orig: squares(ownMate)[0], dest: squares(ownMate)[1], brush: 'yellow' }])
  } else if (oStory && !ownTaken) {
    idea(`Threatens ${oPlayed!.san[0].replace(/[+#]$/, '')}, which ${oStory.replace(/^\S+ /, '')}.`, [mine, { orig: squares(ownThreat!.pv[0])[0], dest: squares(ownThreat!.pv[0])[1], brush: 'yellow' }])
  } else if (top) idea(top.text, [mine, ...top.shapes], top.plies)
  else if (cls === 'book') idea('A well-known opening move.')
  else if (after.inCheck()) {
    const [r, next] = replySan
    idea(r && next ? `Gives check: after ${lineText(fenAfter, [r])}, ${numbered(fenAfter, 1, next)} follows.` : 'Gives check.', [mine], next ? 3 : 1)
  }
  // Nothing to point at: some moves are best for reasons a line can't show.
  else if (cls === 'best' || cls === 'great' || cls === 'brilliant') idea(`No tactic here: it’s simply the most useful move in the position.`)
  else idea(`A sensible move that keeps things going.`)

  // What else there was.
  // The review called it best: its own search may just have preferred another move by a hair.
  const isBest = uci === best.pv[0] || cls === 'best' || cls === 'great' || cls === 'brilliant'
  if (mated) {
    // Nothing else to compare: every move loses.
  } else if (isBest && second?.move && second.move !== uci) {
    const [nextSan] = pvSan(fenBefore, [second.move])
    if (nextSan) {
      const gap = Math.abs(winGap(best.score, second.score, mover))
      const how = cls === 'great' ? 'Nothing else holds' : gap >= 15 ? 'Well ahead of the rest' : gap >= 5 ? 'A little ahead of the rest' : 'One of several good moves'
      rows.push({
        key: 'next',
        label: 'Next best',
        text: `${how}: ${lineText(fenBefore, [nextSan])} was next (${formatScore(second.score)}).`,
        shapes: [{ orig: squares(second.move)[0], dest: squares(second.move)[1], brush: 'yellow' }],
        play: play(fenBefore, [second.move]),
      })
    }
  } else if (!isBest && best.pv[0]) {
    const bestPlayed = playLine(fenBefore, best.pv)
    const story = lineStory(fenBefore, best, bestPlayed)
    const bestSac = sacrifice(fenBefore, best.pv[0])
    const point = story ? story.replace(/^\S+ /, '') : bestSac ? `sacrifices the ${NAMES[bestSac.piece]}` : betterPoint(fenBefore, best.pv[0], best.pv, fenAfter, null, uci)
    rows.push({
      key: 'better',
      label: 'Best',
      text: `${lineText(fenBefore, bestPlayed.san.slice(0, 1))}${point ? `${point.startsWith('then ') ? ',' : ''} ${point}` : ' was a little better'} (${formatScore(best.score)}).`,
      shapes: [{ orig: squares(best.pv[0])[0], dest: squares(best.pv[0])[1], brush: 'suggest' }],
      play: play(fenBefore, best.pv, bestPlayed.length),
    })
  }
  if (!lines.length && reply.pv.length) lines = [shownLine('Best play from here', 'after', fenAfter, reply.pv, playLine(fenAfter, reply.pv))]
  // For the coach: the idea, and for a sacrifice, why it works.
  const first = rows[0]
  const either = rows.find((r) => r.label === 'Either way')
  const take = rows.find((r) => r.key === 'take')
  const also = either
    ? `${sideName(them)} can’t take it and can’t leave it: it’s mate either way.`
    : take
      ? `${take.label}, ${take.text.charAt(0).toLowerCase()}${take.text.slice(1)}`
      : undefined
  return { rows, lines, coach: first ? { idea: either ? `${first.text.split(':')[0]}.` : first.text, also } : undefined }
}

/** How far apart two scores are, in the mover's win chance (0–100). */
const winGap = (a: Score, b: Score, mover: Color) => (mover === 'white' ? 1 : -1) * (winPercent(a) - winPercent(b))

/** The positions a row's moves pass through, for playing them on the board: the start, then after each move. */
export function playSteps({ fen, uci }: Play): { fen: string; lastMove?: [Square, Square] }[] {
  const chess = new Chess(fen)
  const steps: { fen: string; lastMove?: [Square, Square] }[] = [{ fen }]
  for (const u of uci) {
    try {
      const move = chess.move(uciToMove(u))
      steps.push({ fen: chess.fen(), lastMove: [move.from, move.to] })
    } catch {
      break
    }
  }
  return steps
}
