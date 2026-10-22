// Share links: a game and its review packed into the URL fragment, so a link opens
// instantly with the sharer's exact verdicts and nothing is stored on a server.
// Format: docs/superpowers/specs/2026-10-18-share-links-design.md. Links are permanent once
// posted: never change how version 1 decodes; add a new version instead.
import { Chess } from 'chess.js'
import type { PositionEval } from '../hooks/useAnalysis'
import { CLASS_INFO, type GameReport, type MoveClass } from './classify'
import type { Color } from './evaluation'
import { addLine, createTree, mainline, moveNumberLabel, ROOT_ID, type GameTree, type MoveNode, type PgnHeaders } from './tree'
import type { Score } from './uci'

export interface SharedReview {
  depth: number
  /** One per main-line position (start included), White POV. */
  scores: Score[]
  /** The engine's best move (UCI) in the position before each move. */
  bestMoves: (string | null)[]
  classes: MoveClass[]
}

export interface SharedGame {
  startFen: string
  /** The main line, UCI. */
  moves: string[]
  headers: PgnHeaders
  orientation: Color
  review?: SharedReview
}

export type ShareError = 'damaged' | 'newer-version'

export const SHARE_VERSION = 1

/** Index = class code in the link. Fixed forever: new classes get new codes at the end. */
export const CLASS_CODES: MoveClass[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'forced']

const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
/** Link header key ↔ PGN header name. */
const HEADER_KEYS: [string, string][] = [
  ['w', 'White'],
  ['b', 'Black'],
  ['wr', 'WhiteElo'],
  ['br', 'BlackElo'],
  ['r', 'Result'],
  ['d', 'Date'],
  ['t', 'TimeControl'],
  ['x', 'Termination'],
  ['u', 'Link'],
]
const MAX_HEADER = 100
const MAX_CP = 15000
const MATE = 20000
const NO_MOVE = 255

class Damaged extends Error {}

/** The moves chess.js works out before it dresses them up: squares as 0x88 indices. */
type RawMoves = { _moves?: (options: { legal: boolean }) => { from: number; to: number; promotion?: string }[] }
const squareName = (i: number) => 'abcdefgh'[i & 15] + (8 - (i >> 4))

/**
 * Legal moves in UCI, sorted, so indices don't depend on chess.js's generation order. Read from chess.js's
 * own move list: its `moves({ verbose: true })` writes each one out in full (its SAN and the position before
 * and after), some 26 times slower, and every saved review is decoded move by move with this. Should a
 * chess.js update take that list away, the verbose way gives the very same moves (share.test.ts checks).
 */
export function sortedMoves(chess: Chess): string[] {
  const raw = (chess as unknown as RawMoves)._moves
  if (typeof raw !== 'function') return chess.moves({ verbose: true }).map((m) => m.lan).sort()
  return raw.call(chess, { legal: true }).map((m) => squareName(m.from) + squareName(m.to) + (m.promotion ?? '')).sort()
}

function encodeScore(s: Score): number {
  if (s.type === 'cp') return Math.max(-MAX_CP, Math.min(MAX_CP, Math.round(s.value)))
  if (s.value === 0) return s.mated === 'white' ? -MATE : MATE
  return Math.sign(s.value) * (MATE + Math.abs(s.value))
}

function decodeScore(n: number): Score {
  if (Math.abs(n) < MATE) return { type: 'cp', value: n }
  const moves = Math.abs(n) - MATE
  if (moves === 0) return { type: 'mate', value: 0, mated: n > 0 ? 'black' : 'white' }
  return { type: 'mate', value: Math.sign(n) * moves }
}

class Writer {
  bytes: number[] = []
  varint(n: number) {
    do {
      let b = n % 128
      n = Math.floor(n / 128)
      if (n > 0) b |= 128
      this.bytes.push(b)
    } while (n > 0)
  }
  signed(n: number) {
    this.varint(n < 0 ? -2 * n - 1 : 2 * n)
  }
}

class Reader {
  private pos = 0
  private bytes: Uint8Array
  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }
  byte() {
    if (this.pos >= this.bytes.length) throw new Damaged()
    return this.bytes[this.pos++]
  }
  varint() {
    let n = 0
    for (let shift = 1; ; shift *= 128) {
      if (shift > 2 ** 35) throw new Damaged()
      const b = this.byte()
      n += (b & 127) * shift
      if (b < 128) return n
    }
  }
  signed() {
    const n = this.varint()
    return n % 2 ? -(n + 1) / 2 : n / 2
  }
  take(length: number) {
    if (this.pos + length > this.bytes.length) throw new Damaged()
    return this.bytes.slice(this.pos, (this.pos += length))
  }
  done() {
    return this.pos === this.bytes.length
  }
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** Packs a game into a link token, "1.<payload>". */
export async function encodeShare(game: SharedGame): Promise<string> {
  const header: Record<string, string> = {}
  for (const [key, name] of HEADER_KEYS) {
    const value = game.headers[name]
    if (value) header[key] = value.slice(0, MAX_HEADER)
  }
  if (game.startFen !== STANDARD_START) header.f = game.startFen
  if (game.orientation === 'black') header.o = 'b'

  const w = new Writer()
  const json = new TextEncoder().encode(JSON.stringify(header))
  w.varint(json.length)
  w.bytes.push(...json)
  w.varint(game.moves.length)

  const chess = new Chess(game.startFen)
  const legalBefore: string[][] = []
  for (const uci of game.moves) {
    const legal = sortedMoves(chess)
    const index = legal.indexOf(uci)
    if (index < 0) throw new Error(`Illegal move in shared game: ${uci}`)
    legalBefore.push(legal)
    w.bytes.push(index)
    chess.move(uci)
  }

  const review = game.review
  w.bytes.push(review ? 1 : 0)
  if (review) {
    w.varint(review.depth)
    review.scores.forEach((s) => w.signed(encodeScore(s)))
    review.bestMoves.forEach((uci, i) => {
      const index = uci ? legalBefore[i].indexOf(uci) : -1
      w.bytes.push(index < 0 ? NO_MOVE : index)
    })
    for (let i = 0; i < review.classes.length; i += 2) {
      const hi = CLASS_CODES.indexOf(review.classes[i])
      const lo = i + 1 < review.classes.length ? CLASS_CODES.indexOf(review.classes[i + 1]) : 0
      w.bytes.push((hi << 4) | lo)
    }
  }

  const packed = await transform(Uint8Array.from(w.bytes), new CompressionStream('deflate-raw'))
  return `${SHARE_VERSION}.${toBase64Url(packed)}`
}

/** Unpacks a link token. Never throws: a bad link comes back as an error. */
export async function decodeShare(token: string): Promise<SharedGame | { error: ShareError }> {
  const match = /^(\d+)\.(.*)$/.exec(token)
  if (!match) return { error: 'damaged' }
  const version = Number(match[1])
  if (version > SHARE_VERSION) return { error: 'newer-version' }
  if (version !== SHARE_VERSION) return { error: 'damaged' }
  try {
    const r = new Reader(await transform(fromBase64Url(match[2]), new DecompressionStream('deflate-raw')))
    const header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(r.take(r.varint()))) as Record<string, unknown>
    const headers: PgnHeaders = {}
    for (const [key, name] of HEADER_KEYS) if (typeof header[key] === 'string') headers[name] = header[key]
    const startFen = typeof header.f === 'string' ? header.f : STANDARD_START

    const n = r.varint()
    const chess = new Chess(startFen)
    const moves: string[] = []
    const legalBefore: string[][] = []
    for (let i = 0; i < n; i++) {
      const legal = sortedMoves(chess)
      const uci = legal[r.byte()]
      if (!uci) throw new Damaged()
      legalBefore.push(legal)
      moves.push(uci)
      chess.move(uci)
    }

    const game: SharedGame = { startFen, moves, headers, orientation: header.o === 'b' ? 'black' : 'white' }
    const hasReview = r.byte()
    if (hasReview > 1) throw new Damaged()
    if (hasReview) {
      const depth = r.varint()
      const scores = Array.from({ length: n + 1 }, () => decodeScore(r.signed()))
      const bestMoves = legalBefore.map((legal) => {
        const index = r.byte()
        if (index === NO_MOVE) return null
        if (!legal[index]) throw new Damaged()
        return legal[index]
      })
      const classes: MoveClass[] = []
      for (let i = 0; i < n; i += 2) {
        const b = r.byte()
        for (const code of i + 1 < n ? [b >> 4, b & 15] : [b >> 4]) {
          if (!CLASS_CODES[code]) throw new Damaged()
          classes.push(CLASS_CODES[code])
        }
      }
      game.review = { depth, scores, bestMoves, classes }
    }
    if (!r.done()) throw new Damaged()
    return game
  } catch {
    return { error: 'damaged' }
  }
}

function parseTokenHash(hash: string): { token: string; ply: number | null } | null {
  const match = /^#(\d+)\.([A-Za-z0-9_-]+)(?:&m=(\d+))?/.exec(hash)
  if (!match) return null
  return { token: `${match[1]}.${match[2]}`, ply: match[3] === undefined ? null : Number(match[3]) }
}

/** Finds a share token in `/r#1.<payload>&m=<ply>`, ignoring junk a chat app may append. */
export function parseShareHash(pathname: string, hash: string): { token: string; ply: number | null } | null {
  return pathname === '/r' || pathname === '/r/' ? parseTokenHash(hash) : null
}

/** The same token on the embed page, `/embed#1.<payload>&m=<ply>`. */
export function parseEmbedHash(pathname: string, hash: string): { token: string; ply: number | null } | null {
  return /^\/embed(\.html|\/)?$/.test(pathname) ? parseTokenHash(hash) : null
}

/** A link's moment as an index into the main line, clamped to the game's end. */
export function clampPly(ply: number | null, lineLength: number): number | null {
  return ply === null ? null : Math.min(ply, lineLength - 1)
}

export function shareUrl(token: string, ply: number | null, origin: string): string {
  return `${origin}/r#${token}${ply === null ? '' : `&m=${ply}`}`
}

export function embedUrl(token: string, ply: number | null, origin: string): string {
  return `${origin}/embed#${token}${ply === null ? '' : `&m=${ply}`}`
}

export type EmbedSize = 'small' | 'medium' | 'large'
export const EMBED_SIZES: Record<EmbedSize, { width: number; height: number; label: string }> = {
  small: { width: 360, height: 470, label: 'Small' },
  medium: { width: 640, height: 420, label: 'Medium' },
  large: { width: 840, height: 560, label: 'Large' },
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function iframeSnippet(url: string, size: EmbedSize, title: string): string {
  const { width, height } = EMBED_SIZES[size]
  return `<iframe src="${escapeAttr(url)}" width="${width}" height="${height}" style="border:0;border-radius:8px" title="${escapeAttr(title)}" loading="lazy" allowfullscreen></iframe>`
}

/** The main line and, when every position has been reviewed, its review. */
export function toSharedGame(
  line: MoveNode[],
  headers: PgnHeaders,
  orientation: Color,
  review: { evals: Record<string, PositionEval>; report: GameReport; depth: number } | null,
): SharedGame {
  const game: SharedGame = { startFen: line[0].fen, moves: line.slice(1).map((n) => n.uci!), headers, orientation }
  const complete = review && line.every((n) => review.evals[n.fen]) && line.slice(1).every((n) => review.report.moves[n.id])
  if (review && complete) {
    game.review = {
      depth: review.depth,
      scores: line.map((n) => review.evals[n.fen].score),
      bestMoves: line.slice(0, -1).map((n) => review.evals[n.fen].bestMove),
      classes: line.slice(1).map((n) => review.report.moves[n.id].cls),
    }
  }
  return game
}

/** Rebuilds the game, its review evals (by FEN) and the shipped classes (by node id). */
export function fromSharedGame(shared: SharedGame): {
  tree: GameTree
  headers: PgnHeaders
  orientation: Color
  evals: Record<string, PositionEval>
  classes: Record<string, MoveClass> | null
} {
  const { tree } = addLine(createTree(shared.startFen), ROOT_ID, shared.moves)
  const headers = shared.startFen === STANDARD_START ? { ...shared.headers } : { ...shared.headers, SetUp: '1', FEN: shared.startFen }
  const line = mainline(tree)
  const evals: Record<string, PositionEval> = {}
  let classes: Record<string, MoveClass> | null = null
  const review = shared.review
  if (review) {
    classes = {}
    line.forEach((node, i) => {
      const bestMove = review.bestMoves[i] ?? null
      evals[node.fen] = { score: review.scores[i], bestMove, pv: bestMove ? [bestMove] : [], depth: review.depth }
      if (i > 0) classes![node.id] = review.classes[i - 1]
    })
  }
  return { tree, headers, orientation: shared.orientation, evals, classes }
}

const ANNOTATIONS: Partial<Record<MoveClass, string>> = { brilliant: '!!', great: '!', inaccuracy: '?!', mistake: '?', miss: '?', blunder: '??' }
const players = (headers: PgnHeaders) => `${headers.White || 'White'} vs ${headers.Black || 'Black'}`

/** "10. Nxb5!!" — `ply` is the node's ply (1 = White's first move from the standard start). */
export function moveLabel(ply: number, san: string, cls?: MoveClass): string {
  return `${moveNumberLabel(ply)} ${san}${(cls && ANNOTATIONS[cls]) ?? ''}`
}

/** "20… Nxc4!! Brilliant · Hikaru vs Bortnyk, reviewed on Rookahead" */
export function momentShareText(ply: number, san: string, cls: MoveClass | undefined, headers: PgnHeaders): string {
  if (!cls) return `${moveLabel(ply, san)} · ${players(headers)}, on Rookahead`
  return `${moveLabel(ply, san, cls)} ${CLASS_INFO[cls].label} · ${players(headers)}, reviewed on Rookahead`
}

/** "Hikaru vs Bortnyk: accuracy 87 vs 82, reviewed on Rookahead" */
export function gameShareText(headers: PgnHeaders, accuracy: Record<Color, number | null> | null): string {
  const scored = accuracy?.white != null && accuracy.black != null
  return `${players(headers)}${scored ? `: accuracy ${Math.round(accuracy.white!)} vs ${Math.round(accuracy.black!)}` : ''}, reviewed on Rookahead`
}
