// Your Legendary moves, gathered from your reviewed games for the Legendary moves page.
import { Chess } from 'chess.js'
import type { Color } from './evaluation'
import type { SharedGame } from './share'

/** What a Legendary move gave up, going by the piece that moved: a promotion to anything but a queen is its own kind. */
export type LegendaryKind = 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn' | 'king' | 'underpromotion'

export const KIND_LABEL: Record<LegendaryKind, string> = {
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
  pawn: 'Pawn',
  king: 'King',
  underpromotion: 'Underpromotion',
}

const PIECE_KIND: Record<string, LegendaryKind> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn', k: 'king' }

export interface LegendaryMove {
  /** How many moves into the game it comes (1 is the first move): where to open the game. */
  ply: number
  /** "7. Bxh7+", "23… Qxf2". */
  label: string
  /** The position after it. */
  fen: string
  from: string
  to: string
  kind: LegendaryKind
}

/** The Legendary moves `color` played in a reviewed game, in order. */
export function legendaryMoves(game: SharedGame, color: Color): LegendaryMove[] {
  const classes = game.review?.classes
  if (!classes) return []
  const chess = new Chess(game.startFen)
  const found: LegendaryMove[] = []
  for (let i = 0; i < game.moves.length; i++) {
    const uci = game.moves[i]
    const mover: Color = chess.turn() === 'w' ? 'white' : 'black'
    const number = chess.moveNumber()
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    if (classes[i] !== 'brilliant' || mover !== color) continue
    found.push({
      ply: i + 1,
      label: `${number}${mover === 'white' ? '.' : '…'} ${move.san}`,
      fen: chess.fen(),
      from: move.from,
      to: move.to,
      kind: move.promotion && move.promotion !== 'q' ? 'underpromotion' : PIECE_KIND[move.piece],
    })
  }
  return found
}

export type Period = '7d' | '30d' | '90d' | 'all'

/** The earliest time (ms) a period covers. */
export function sinceFor(period: Period, now = Date.now()): number {
  const days = { '7d': 7, '30d': 30, '90d': 90, all: Infinity }[period]
  return now - days * 86400000
}
