// Layout for board images and GIF frames: player bar, board, player bar, footer caption.
import type { GameReport, MoveClass } from './classify'
import type { Color } from './evaluation'
import { moveLabel } from './share'
import type { MoveNode, PgnHeaders } from './tree'

export interface FrameSpec {
  fen: string
  orientation: Color
  /** Squares of the move that led here. */
  lastMove?: [string, string]
  /** Badge for that move. */
  cls?: MoveClass
  top: { name: string; rating?: string }
  bottom: { name: string; rating?: string }
  /** The move, e.g. "10. Nxb5!!", or "Position" at the start. */
  caption: string
  /** The move's verdict, drawn after the caption with its icon and colour. */
  verdict?: MoveClass
  theme: { light: string; dark: string; lastMove: string }
}

export function frameLayout(width: number) {
  const square = width / 8
  const bar = Math.round(width * 0.08)
  const footer = Math.round(width * 0.09)
  return { bar, board: width, footer, square, height: 2 * bar + width + footer }
}

/** Top-left corner of a square, in pixels from the board's top-left. */
export function squareOrigin(square: string, orientation: Color, size: number) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  return orientation === 'white' ? { x: file * size, y: (7 - rank) * size } : { x: (7 - file) * size, y: rank * size }
}

/** Frame for one position: the move that led there, its badge (unless `badge` says no) and the players. */
export function frameFor(
  node: MoveNode,
  { headers, orientation, report, theme }: { headers: PgnHeaders; orientation: Color; report: GameReport | null; theme: FrameSpec['theme'] },
  badge: (cls: MoveClass) => boolean = () => true,
): FrameSpec {
  const player = (c: Color) => ({ name: headers[c === 'white' ? 'White' : 'Black'] || (c === 'white' ? 'White' : 'Black'), rating: headers[c === 'white' ? 'WhiteElo' : 'BlackElo'] })
  const cls = report?.moves[node.id]?.cls
  return {
    fen: node.fen,
    orientation,
    lastMove: node.from && node.to ? [node.from, node.to] : undefined,
    cls: cls && badge(cls) ? cls : undefined,
    top: player(orientation === 'white' ? 'black' : 'white'),
    bottom: player(orientation),
    caption: node.san ? moveLabel(node.ply, node.san, cls) : 'Position',
    verdict: cls,
    theme,
  }
}
