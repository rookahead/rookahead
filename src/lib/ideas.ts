import { Chess, type PieceSymbol, type Square } from 'chess.js'
import type { ExplainShape } from './explain'
import { uciToMove } from './tree'

// What a good move does on the board when it wins nothing straight away: the outpost it takes, the
// file, the pin, the passed pawn. Each idea is a plain fact about the position (or the engine's own
// next move), with a weight for how much it matters; Explain says the heaviest one.
//
// The rules come from what'sthisposition (github.com/acunli/whatsthisposition, GPL-3.0,
// src/lib/reason/ideas.ts), rewritten on chess.js and in our wording.

type Side = 'w' | 'b'
interface Piece {
  type: PieceSymbol
  color: Side
}
type Board = Partial<Record<Square, Piece>>

export interface BoardIdea {
  text: string
  weight: number
  /** What the board draws besides the move itself. */
  shapes: ExplainShape[]
  /** How many moves of the line to play when the row is clicked (the move alone, if not set). */
  plies?: number
}

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const SIDE: Record<Side, string> = { w: 'White', b: 'Black' }
const FILES = 'abcdefgh'
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const CENTRE: Square[] = ['d4', 'e4', 'd5', 'e5']
/** How many squares each piece usually has, to tell a passive one. */
const TYPICAL: Partial<Record<PieceSymbol, number>> = { n: 5, b: 7, r: 8, q: 14 }

const fileOf = (s: Square) => s.charCodeAt(0) - 97
const rankOf = (s: Square) => Number(s[1]) - 1
const at = (f: number, r: number): Square | null => (f >= 0 && f < 8 && r >= 0 && r < 8 ? (`${FILES[f]}${r + 1}` as Square) : null)
const ALL: Square[] = Array.from({ length: 64 }, (_, i) => at(i % 8, Math.floor(i / 8))!)
const other = (c: Side): Side => (c === 'w' ? 'b' : 'w')
/** 0 = the side's own back rank, 7 = the far one. */
const relRank = (s: Square, c: Side) => (c === 'w' ? rankOf(s) : 7 - rankOf(s))
const dirsOf = (t: PieceSymbol) => (t === 'r' ? ROOK : t === 'b' ? BISHOP : t === 'q' ? [...ROOK, ...BISHOP] : [])
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function boardOf(fen: string): Board {
  const b: Board = {}
  for (const row of new Chess(fen).board()) for (const x of row) if (x) b[x.square] = { type: x.type, color: x.color }
  return b
}

/** "the knight on c6", or "the d5 pawn". */
function nm(b: Board, s: Square): string {
  const x = b[s]!
  return x.type === 'p' ? `the ${s} pawn` : `the ${NAMES[x.type]} on ${s}`
}

/** Every square from `from` (not counting it) to the edge, one way. */
function ray(from: Square, df: number, dr: number): Square[] {
  const out: Square[] = []
  for (let f = fileOf(from) + df, r = rankOf(from) + dr, s = at(f, r); s; f += df, r += dr, s = at(f, r)) out.push(s)
  return out
}

/** The squares between two on a line, not counting either end. */
function between(a: Square, b: Square): Square[] {
  const df = Math.sign(fileOf(b) - fileOf(a)), dr = Math.sign(rankOf(b) - rankOf(a))
  const lined = fileOf(a) === fileOf(b) || rankOf(a) === rankOf(b) || Math.abs(fileOf(b) - fileOf(a)) === Math.abs(rankOf(b) - rankOf(a))
  if (!lined || a === b) return []
  const out: Square[] = []
  for (const s of ray(a, df, dr)) {
    if (s === b) break
    out.push(s)
  }
  return out
}

/** The squares the piece on `sq` attacks (own pieces included: it defends those). */
function attacksFrom(b: Board, sq: Square): Square[] {
  const x = b[sq]
  if (!x) return []
  const f = fileOf(sq), r = rankOf(sq)
  const jumps = (list: number[][]) => list.map(([df, dr]) => at(f + df, r + dr)).filter((s): s is Square => !!s)
  if (x.type === 'p') return jumps(x.color === 'w' ? [[-1, 1], [1, 1]] : [[-1, -1], [1, -1]])
  if (x.type === 'n') return jumps(KNIGHT)
  if (x.type === 'k') return jumps([...ROOK, ...BISHOP])
  const out: Square[] = []
  for (const [df, dr] of dirsOf(x.type))
    for (const s of ray(sq, df, dr)) {
      out.push(s)
      if (b[s]) break
    }
  return out
}

const attackersOf = (b: Board, sq: Square, by: Side) => ALL.filter((s) => b[s]?.color === by && attacksFrom(b, s).includes(sq))

/** Does a `by` pawn guard the square? */
function pawnGuards(b: Board, sq: Square, by: Side): boolean {
  const back = by === 'w' ? -1 : 1
  return [at(fileOf(sq) - 1, rankOf(sq) + back), at(fileOf(sq) + 1, rankOf(sq) + back)].some((s) => s && b[s]?.type === 'p' && b[s]!.color === by)
}

/** Squares the piece could go to without walking into a pawn. */
function safeSquares(b: Board, sq: Square): Square[] {
  const x = b[sq]!
  return attacksFrom(b, sq).filter((t) => b[t]?.color !== x.color && !pawnGuards(b, t, other(x.color)))
}

/** Attacked, and either undefended or attacked by something cheaper. */
function loose(b: Board, sq: Square): boolean {
  const x = b[sq]
  if (!x || x.type === 'k') return false
  const atk = attackersOf(b, sq, other(x.color))
  if (!atk.length) return false
  return !attackersOf(b, sq, x.color).length || atk.some((a) => b[a]!.type !== 'k' && VALUES[b[a]!.type] < VALUES[x.type])
}

/** Can the other side simply take it without losing anything? Then what it attacks doesn't count. */
function capturable(b: Board, sq: Square): boolean {
  const x = b[sq]
  if (!x || x.type === 'k') return false
  const defended = attackersOf(b, sq, x.color).length > 0
  return attackersOf(b, sq, other(x.color)).some((a) => {
    const t = b[a]!.type
    return !defended || (t !== 'k' && VALUES[t] <= VALUES[x.type])
  })
}

function passed(b: Board, sq: Square): boolean {
  const x = b[sq]!
  return !ALL.some((s) => b[s]?.type === 'p' && b[s]!.color !== x.color && Math.abs(fileOf(s) - fileOf(sq)) <= 1 && relRank(s, x.color) > relRank(sq, x.color))
}

/** A square on the far half that a pawn guards and no enemy pawn can ever attack. */
function outpost(b: Board, sq: Square, me: Side): boolean {
  const rr = relRank(sq, me)
  if (rr < 3 || rr > 5 || !pawnGuards(b, sq, me)) return false
  return !ALL.some((s) => b[s]?.type === 'p' && b[s]!.color !== me && Math.abs(fileOf(s) - fileOf(sq)) === 1 && relRank(s, me) > rr)
}

/** Pieces stuck in front of something worth more (or the king), on a line a slider holds. */
function pins(b: Board): { pinner: Square; pinned: Square; behind: Square }[] {
  const out: { pinner: Square; pinned: Square; behind: Square }[] = []
  for (const sq of ALL) {
    const x = b[sq]
    if (!x) continue
    for (const [df, dr] of dirsOf(x.type)) {
      const [front, back] = ray(sq, df, dr).filter((s) => b[s])
      if (!front || !back) continue
      const F = b[front]!, B = b[back]!
      if (F.color === x.color || B.color !== F.color || F.type === 'k') continue
      if (B.type === 'k' || VALUES[B.type] > VALUES[F.type]) out.push({ pinner: sq, pinned: front, behind: back })
    }
  }
  return out
}

/** How many enemy pieces hit the squares around a king. */
function kingPressure(b: Board, k: Square, by: Side): number {
  const zone = [k, ...[...ROOK, ...BISHOP].map(([df, dr]) => at(fileOf(k) + df, rankOf(k) + dr)).filter((s): s is Square => !!s)]
  return zone.reduce((n, s) => n + attackersOf(b, s, by).length, 0)
}

/** The side's least active minor or major piece, if one is really passive. */
function worstPiece(b: Board, c: Side): Square | null {
  let worst: Square | null = null
  let score = Infinity
  for (const s of ALL) {
    const x = b[s]
    const typical = x && x.color === c ? TYPICAL[x.type] : undefined
    if (!typical) continue
    const sc = safeSquares(b, s).length / typical
    if (sc < score) {
      score = sc
      worst = s
    }
  }
  return score < 0.45 ? worst : null
}

/** "12.Qh6", or "12…Qh6", numbered from the position it's played in. */
function numbered(fen: string, san: string): string {
  const [, turn, , , , full] = fen.split(' ')
  return `${full}${turn === 'w' ? '.' : '…'}${san}`
}

/** Everything the move does, heaviest first. `line` is the engine's best play after it (the other
 *  side's reply first). */
export function boardIdeas(fenBefore: string, uci: string, line: string[]): BoardIdea[] {
  const chess = new Chess(fenBefore)
  let m
  try {
    m = chess.move(uciToMove(uci))
  } catch {
    return []
  }
  const fenAfter = chess.fen()
  const before = boardOf(fenBefore)
  const after = boardOf(fenAfter)
  const me = m.color
  const them = other(me)
  const piece = m.piece
  const name = NAMES[piece]
  const castle = m.isKingsideCastle() || m.isQueensideCastle()
  const check = chess.inCheck()
  const myK = ALL.find((s) => after[s]?.type === 'k' && after[s]!.color === me)
  const theirK = ALL.find((s) => after[s]?.type === 'k' && after[s]!.color === them)
  const ideas: BoardIdea[] = []
  const add = (text: string, weight: number, shapes: ExplainShape[] = [], plies?: number) => ideas.push({ text, weight, shapes, plies })
  const has = (re: RegExp) => ideas.some((i) => re.test(i.text))
  // The mover's own moves in the engine line (the line starts with the reply).
  const mine: { from: Square; to: Square }[] = []
  for (let i = 1; i < Math.min(line.length, 8); i += 2) mine.push({ from: line[i].slice(0, 2) as Square, to: line[i].slice(2, 4) as Square })

  if (m.promotion) add(`Promotes the pawn to a ${NAMES[m.promotion]}.`, 60)

  // ---- Tactics around the moved piece ----
  // What a piece really threatens: the king, anything worth more, or anything undefended.
  const targets = (b: Board, from: Square) =>
    attacksFrom(b, from).filter((s) => {
      const x = b[s]
      if (!x || x.color === b[from]!.color) return false
      return x.type === 'k' || VALUES[x.type] > VALUES[b[from]!.type] || !attackersOf(b, s, x.color).length
    })
  // A piece that can simply be taken threatens nothing.
  const moverLoose = capturable(after, m.to)
  const hitBefore = new Set(before[m.from] ? targets(before, m.from) : [])
  const fresh = (moverLoose ? [] : targets(after, m.to)).filter((s) => !hitBefore.has(s) || check)
  const valuable = fresh.filter((s) => after[s]!.type !== 'p' || !attackersOf(after, s, them).length).sort((a, b) => VALUES[after[b]!.type] - VALUES[after[a]!.type])
  if (valuable.length >= 2 && valuable.some((s) => after[s]!.type !== 'p')) {
    const names = valuable.slice(0, 2).map((s) => (after[s]!.type === 'k' ? 'the king' : nm(after, s)))
    add(`Forks ${names.join(' and ')}: both can’t be saved.`, 40, valuable.slice(0, 2).map((s) => ({ orig: m.to, dest: s, brush: 'yellow' })))
  } else {
    const s = fresh.find((x) => after[x]!.type !== 'k')
    if (s) {
      const t = after[s]!
      const undefended = !attackersOf(after, s, them).length
      add(`${piece === 'p' ? 'Kicks' : 'Attacks'} ${nm(after, s)}${undefended ? ', which has no defender' : ''}.`, t.type === 'q' ? 16 : undefended ? 14 : piece === 'p' ? 12 : 11, [{ orig: m.to, dest: s, brush: 'yellow' }])
    }
  }

  // Skewers: something valuable in front, another piece behind it on the same line.
  if (dirsOf(piece).length && !moverLoose) {
    for (const [df, dr] of dirsOf(piece)) {
      const [front, back] = ray(m.to, df, dr).filter((s) => after[s])
      if (!front || !back) continue
      const F = after[front]!, B = after[back]!
      if (F.color !== them || B.color !== them) continue
      if ((F.type === 'k' || VALUES[F.type] > VALUES[B.type]) && VALUES[B.type] >= 3 && VALUES[F.type] > VALUES[piece === 'q' ? 'r' : piece]) {
        add(`Skewers ${F.type === 'k' ? 'the king' : `the ${NAMES[F.type]}`}: when it moves, ${nm(after, back)} behind it falls.`, 34, [{ orig: m.to, dest: back, brush: 'yellow' }])
        break
      }
    }
  }

  // Pins the move makes (with the moved piece, or a line it opens).
  const pinnedBefore = new Set(pins(before).map((p) => p.pinned + p.pinner))
  for (const p of pins(after)) {
    if (after[p.pinner]!.color !== me || pinnedBefore.has(p.pinned + p.pinner) || loose(after, p.pinner) || after[p.pinned]!.type === 'p') continue
    const absolute = after[p.behind]!.type === 'k'
    add(`Pins ${nm(after, p.pinned)} to the ${NAMES[after[p.behind]!.type]}.`, absolute ? 24 : 18, [{ orig: p.pinner, dest: p.behind, brush: 'yellow' }, { orig: p.pinned, brush: 'red' }])
    break
  }

  // Discovered attacks: a slider that was behind the moved piece now reaches something.
  if (!castle) {
    for (const sq of ALL) {
      const x = after[sq]
      if (!x || x.color !== me || sq === m.to || !dirsOf(x.type).length || !attacksFrom(before, sq).includes(m.from)) continue
      const gained = attacksFrom(after, sq)
        .filter((t) => after[t]?.color === them && !attacksFrom(before, sq).includes(t))
        .sort((a, b) => VALUES[after[b]!.type] - VALUES[after[a]!.type])
      const t = gained[0]
      if (!t) continue
      if (after[t]!.type === 'k') add(`Uncovers check from ${nm(after, sq)}.`, 28, [{ orig: sq, dest: t, brush: 'yellow' }])
      else if (VALUES[after[t]!.type] >= VALUES[x.type] || !attackersOf(after, t, them).length)
        add(`Uncovers ${nm(after, sq)}, which now hits ${nm(after, t)}.`, 18, [{ orig: sq, dest: t, brush: 'yellow' }])
      break
    }
  }

  // ---- Lines: files, the seventh rank, batteries ----
  if (piece === 'r' && m.from[0] !== m.to[0] && !m.captured) {
    const f = fileOf(m.to)
    const pawns = { w: 0, b: 0 }
    for (let r = 0; r < 8; r++) {
      const x = after[at(f, r)!]
      if (x?.type === 'p') pawns[x.color]++
    }
    const kind = !pawns.w && !pawns.b ? 'open' : !pawns[me] ? 'half-open' : null
    if (kind) {
      const ahead = ray(m.to, 0, me === 'w' ? 1 : -1).filter((s) => after[s])
      const [first, second] = ahead
      const target = first && after[first]!.color === them ? first : second && after[second]!.color === them && after[first]!.color === me ? second : null
      const uses = mine.some((x) => fileOf(x.from) === f || fileOf(x.to) === f)
      const aim = target ? `, aiming at ${nm(after, target)}` : ''
      add(`Takes the ${kind} ${m.to[0]}-file${aim}.`, (kind === 'open' ? 15 : 12) + (target ? 5 : 0) + (uses ? 8 : 0), target ? [{ orig: m.to, dest: target, brush: 'yellow' }] : [])
    }
  }
  if (piece === 'r' && relRank(m.to, me) === 6 && relRank(m.from, me) !== 6) {
    const victims = ALL.filter((s) => rankOf(s) === rankOf(m.to) && after[s]?.color === them && after[s]!.type === 'p').length
    const kingBack = theirK && relRank(theirK, me) === 7
    if (victims || kingBack) {
      const what = [victims ? `it hits ${victims} pawn${victims > 1 ? 's' : ''}` : '', kingBack ? 'the king is stuck on the back rank' : ''].filter(Boolean)
      add(`The rook reaches the seventh rank: ${what.join(', and ')}.`, 18)
    }
  }
  if (piece === 'q' || piece === 'r' || piece === 'b') {
    for (const [df, dr] of dirsOf(piece)) {
      const next = ray(m.to, df, dr).find((s) => after[s])
      const y = next && after[next]
      if (!next || !y || y.color !== me) continue
      const straight = df === 0 || dr === 0
      const ok = straight ? (y.type === 'r' || y.type === 'q') && piece !== 'b' : (y.type === 'b' || y.type === 'q') && piece !== 'r'
      if (!ok || (piece === y.type && !straight)) continue
      if (ray(m.from, df, dr).find((s) => before[s]) === next) continue
      // It has to point at something: an enemy piece ahead, or a file free of the mover's pawns.
      const front = ray(m.to, -df, -dr).find((s) => after[s])
      const fileFree = df === 0 && !ALL.some((s) => fileOf(s) === fileOf(m.to) && after[s]?.type === 'p' && after[s]!.color === me)
      if (!(front && after[front]!.color === them) && !fileFree) continue
      const n = rankOf(m.to) + 1
      const where = straight ? (df === 0 ? `the ${m.to[0]}-file` : `the ${n}${['st', 'nd', 'rd'][n - 1] ?? 'th'} rank`) : 'the diagonal'
      add(piece === y.type ? `Doubles the ${name}s on ${where}.` : `Lines up the ${name} and ${NAMES[y.type]} on ${where}.`, 10, [{ orig: next, dest: m.to, brush: 'yellow' }])
      break
    }
  }

  // ---- The king ----
  if (castle) add('Castles: the king is safe and the rook comes into play.', 12)
  else if (piece === 'k' && kingPressure(before, m.from, them) - kingPressure(after, m.to, them) >= 2) add('The king steps out of the firing line.', 12)
  if (piece === 'p' && myK && relRank(myK, me) === 0 && (fileOf(myK) <= 2 || fileOf(myK) >= 5) && Math.abs(fileOf(m.from) - fileOf(myK)) <= 1 && relRank(m.to, me) === 2) {
    if (ALL.some((s) => after[s]?.color === them && (after[s]!.type === 'r' || after[s]!.type === 'q'))) add('Gives the king a square to escape to, so a back-rank check isn’t mate.', 8)
  }

  // ---- Pieces: outposts, activity, trapping ----
  if (!moverLoose && (piece === 'n' || piece === 'b') && outpost(after, m.to, me) && !outpost(before, m.from, me))
    add(`Puts the ${name} on an outpost: a pawn guards ${m.to}, and no pawn can chase it away.`, 17, [{ orig: m.to, brush: 'suggest' }])
  else if (!moverLoose && piece === 'n' && CENTRE.includes(m.to) && !CENTRE.includes(m.from)) add('Brings the knight to the centre, where it reaches the most squares.', 7)
  if ((piece === 'n' || piece === 'b' || piece === 'r' || piece === 'q') && !m.captured && !moverLoose) {
    const gain = safeSquares(after, m.to).length - safeSquares(before, m.from).length
    if (worstPiece(before, me) === m.from && gain >= 3) add(`Brings ${SIDE[me]}’s least active piece, the ${name}, into play.`, 10)
    else if (gain >= 5) add(`Puts the ${name} on a more active square.`, 4)
  }
  for (const sq of ALL) {
    const x = after[sq]
    if (!x || x.color !== them || x.type === 'p' || x.type === 'k') continue
    if (!safeSquares(after, sq).length && safeSquares(before, sq).length && !loose(after, sq) && attackersOf(after, sq, me).length) {
      add(`Traps ${nm(after, sq)}: it has no safe square left.`, 26, [{ orig: sq, brush: 'red' }])
      break
    }
  }
  // A pawn moving out of a long-range piece's way.
  if (piece === 'p') {
    for (const sq of ALL) {
      const x = after[sq]
      if (!x || x.color !== me || !dirsOf(x.type).length || !attacksFrom(before, sq).includes(m.from)) continue
      if (attacksFrom(after, sq).length - attacksFrom(before, sq).length >= 3) {
        add(`Opens a line for ${nm(after, sq)}.`, 6, [{ orig: sq, dest: m.from, brush: 'yellow' }])
        break
      }
    }
  }

  // ---- Pawns ----
  if (piece === 'p') {
    const rr = relRank(m.to, me)
    if (passed(before, m.from) && !m.promotion) add(`Pushes the passed pawn to ${m.to}${rr >= 5 ? ', close to queening' : ''}.`, rr >= 5 ? 20 : 11)
    else if (passed(after, m.to)) add(`Makes a passed pawn on ${m.to}: no pawn can stop it any more.`, rr >= 4 ? 16 : 10, [{ orig: m.to, brush: 'suggest' }])
    if (!m.captured) {
      const hit = attacksFrom(after, m.to).find((s) => after[s]?.color === them && after[s]!.type === 'p')
      if (hit) add(`A pawn break: it challenges ${nm(after, hit)} to open lines.`, 10, [{ orig: m.to, dest: hit, brush: 'yellow' }])
      else if (rr === 4 && !pawnGuards(after, m.to, them)) add(`Gains space on the ${fileOf(m.to) < 4 ? 'queenside' : 'kingside'}: the pawn on ${m.to} cramps ${SIDE[them]}’s pieces.`, 5)
    }
  }

  // ---- Pressure, and defence ----
  if (piece !== 'k' && !m.captured && !moverLoose && !has(/^(Forks|Attacks|Kicks)/)) {
    for (const t of attacksFrom(after, m.to)) {
      const x = after[t]
      if (!x || x.color !== them || x.type === 'k' || attacksFrom(before, m.from).includes(t)) continue
      const atk = attackersOf(after, t, me).length
      const def = attackersOf(after, t, them).length
      if (atk >= 2 && atk >= def) {
        add(`Piles up on ${nm(after, t)}: ${atk} attackers against ${def} defender${def === 1 ? '' : 's'}.`, atk > def ? 14 : 9, [
          ...attackersOf(after, t, me).map((a) => ({ orig: a, dest: t, brush: 'yellow' as const })),
        ])
        break
      }
    }
  }
  if (piece !== 'k' && loose(before, m.from) && !loose(after, m.to)) add(`Moves the attacked ${name} to safety.`, 14)
  for (const s of ALL) {
    if (s === m.from || s === m.to || before[s]?.color !== me || !loose(before, s) || loose(after, s)) continue
    add(`Protects ${nm(after, s)}, which was hanging.`, 12, [{ orig: s, brush: 'suggest' }])
    break
  }
  if (piece !== 'k' && !has(/^Protects/)) {
    for (const t of attacksFrom(after, m.to)) {
      const x = after[t]
      if (!x || x.color !== me || x.type === 'k' || attacksFrom(before, m.from).includes(t)) continue
      const atk = attackersOf(after, t, them).length
      const def = attackersOf(before, t, me).length
      if (atk >= 1 && atk >= def && !loose(before, t)) {
        add(`Adds a defender to ${nm(after, t)}, which had as many attackers as defenders.`, 9, [{ orig: t, brush: 'suggest' }])
        break
      }
    }
  }

  // ---- Development ----
  const moveNo = Number(fenBefore.split(' ')[5]) || 1
  if (moveNo <= 15 && (piece === 'n' || piece === 'b') && relRank(m.from, me) === 0 && !m.captured) add(`Develops the ${name}.`, moveNo <= 10 ? 9 : 6)
  const back = me === 'w' ? '1' : '8'
  const rights = fenAfter.split(' ')[2]
  if (relRank(m.from, me) === 0 && piece !== 'k' && piece !== 'r') {
    const clear = (files: string) => [...files].every((f) => !after[`${f}${back}` as Square])
    if (rights.includes(me === 'w' ? 'K' : 'k') && 'fg'.includes(m.from[0]) && clear('fg')) add('Clears the way to castle kingside.', 7)
    else if (rights.includes(me === 'w' ? 'Q' : 'q') && 'bcd'.includes(m.from[0]) && clear('bcd')) add('Clears the way to castle queenside.', 7)
  }
  const rooks = ALL.filter((s) => after[s]?.color === me && after[s]!.type === 'r' && relRank(s, me) === 0)
  if (rooks.length === 2 && myK && relRank(myK, me) === 0 && (fileOf(myK) <= 2 || fileOf(myK) >= 6)) {
    const joined = (b: Board) => between(rooks[0], rooks[1]).every((s) => !b[s]) && b[rooks[0]]?.type === 'r' && b[rooks[1]]?.type === 'r'
    if (joined(after) && !joined(before)) add('Connects the rooks: they can now guard each other.', 7)
  }

  // ---- Prepares: the engine's next move for the mover, which this move makes possible ----
  const replay = new Chess(fenAfter)
  try {
    if (line[0] && line[1]) {
      replay.move(uciToMove(line[0]))
      const fenNext = replay.fen()
      const inCheck = replay.inCheck()
      const next = replay.move(uciToMove(line[1]))
      if (!inCheck && !next.captured && next.piece !== 'k') {
        const nb = boardOf(fenNext)
        const clears = between(next.from, next.to).includes(m.from)
        const needsCover = attackersOf(nb, next.to, them).length > 0
        const hadCover = attackersOf(before, next.to, me).some((a) => a !== next.from)
        const supports = next.from !== m.to && needsCover && !hadCover && attacksFrom(after, m.to).includes(next.to)
        if (clears || supports) {
          const trade = next.piece === 'q' && attackersOf(nb, next.to, them).some((a) => nb[a]?.type === 'q')
          const purpose = trade ? ', offering a trade of queens' : replay.inCheck() ? ', with check' : ''
          add(`Prepares ${numbered(fenNext, purpose ? next.san.replace(/[+#]$/, '') : next.san)}${purpose}: the ${name} ${clears ? 'clears the way' : `covers ${next.to}`}.`, trade ? 16 : 12, [{ orig: next.from, dest: next.to, brush: 'yellow' }], 3)
        }
      }
    }
  } catch {
    // A line that doesn't play out says nothing.
  }

  return ideas.sort((a, b) => b.weight - a.weight).map((i) => ({ ...i, text: capitalise(i.text) }))
}
