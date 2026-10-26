import { Chess, type Square } from 'chess.js'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Color } from '../lib/evaluation'
import type { BoardTheme } from '../lib/settings'
import { uciToMove } from '../lib/tree'
import { Board } from './Board'

/** A move being pointed at: the position after it, and the box of lines it's in (the preview sits by that). */
export interface Preview {
  fen: string
  lastMove?: [Square, Square]
  rect: DOMRect
}

/** The position after the first `count` moves of a line, for a preview of that move. */
export function previewAt(fen: string, pv: string[], count: number, rect: DOMRect): Preview | null {
  const chess = new Chess(fen)
  let last: [Square, Square] | undefined
  try {
    for (const uci of pv.slice(0, count)) {
      const move = chess.move(uciToMove(uci))
      last = [move.from, move.to]
    }
  } catch {
    return null
  }
  return { fen: chess.fen(), lastMove: last, rect }
}

const SIZE = 216
const NO_SHAPES: DrawShape[] = []
const noMove = () => {}
const GAP = 8

/**
 * A small board just under the lines being pointed at (over them when there's no room below), at their
 * left edge, as Lichess does: it stays in one place while the pointer moves along the moves.
 */
export function MovePreview({ preview, orientation, theme }: { preview: Preview | null; orientation: Color; theme: BoardTheme }) {
  if (!preview) return null
  const { rect } = preview
  const top = rect.bottom + GAP + SIZE <= window.innerHeight - GAP ? rect.bottom + GAP : Math.max(GAP, rect.top - SIZE - GAP)
  const left = Math.min(Math.max(GAP, rect.left + GAP), window.innerWidth - SIZE - GAP)
  return createPortal(
    // A real board, view-only, kept while the pointer moves along the moves: the pieces slide between them.
    <div className="move-preview" style={{ top, left, '--board-size': `${SIZE}px` } as CSSProperties} aria-hidden>
      <Board fen={preview.fen} orientation={orientation} lastMove={preview.lastMove} shapes={NO_SHAPES} theme={theme} coordinates={false} onMove={noMove} viewOnly />
    </div>,
    document.body,
  )
}
