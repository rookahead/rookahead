import { Chess } from 'chess.js'
import { useMemo, type CSSProperties } from 'react'
import { useBoardPrefs } from '../lib/boardPrefs'
import { CLASS_INFO, type MoveClass } from '../lib/classify'
import type { Color } from '../lib/evaluation'
import type { BoardTheme } from '../lib/settings'
import { boardColors, boardImage } from './Board'
import { ClassIcon } from './ClassIcon'
import { PieceIcon } from './PieceIcon'

const ROLE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

interface Props {
  fen: string
  orientation: Color
  theme: BoardTheme
  lastMove?: [string, string]
  /** The last move's grade: an arrow along it, in the grade's colour, and its badge on the square it went to. */
  grade?: MoveClass
  label?: string
}

/** Where a square's centre sits, in eighths of the board, for the given orientation. */
function centreOf(square: string, orientation: Color) {
  const f = square.charCodeAt(0) - 97
  const r = Number(square[1]) - 1
  return orientation === 'white' ? { x: f + 0.5, y: 7.5 - r } : { x: 7.5 - f, y: r + 0.5 }
}

/** A small, static picture of a position (no Chessground), e.g. the daily puzzle on Home. */
export function MiniBoard({ fen, orientation, theme, lastMove, grade, label = 'Puzzle position' }: Props) {
  const squares = useMemo(() => {
    const rows = new Chess(fen).board()
    const ordered = orientation === 'white' ? rows : [...rows].reverse().map((r) => [...r].reverse())
    return ordered.flat()
  }, [fen, orientation])
  const { palette } = useBoardPrefs()
  const colors = boardColors(theme, palette)
  const style = { '--board-image': boardImage(colors.light, colors.dark), '--last-move': colors.lastMove ?? 'rgba(255, 255, 51, 0.42)' } as CSSProperties
  // Square names in display order, for the last-move highlight.
  const names = useMemo(() => {
    const files = 'abcdefgh'
    const list: string[] = []
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) list.push(orientation === 'white' ? files[f] + (8 - r) : files[7 - f] + (r + 1))
    return list
  }, [orientation])
  const from = grade && lastMove ? centreOf(lastMove[0], orientation) : null
  const to = grade && lastMove ? centreOf(lastMove[1], orientation) : null
  return (
    <div className="mini-board" style={style} role="img" aria-label={label}>
      {squares.map((p, i) => (
        <span key={i} className={lastMove?.includes(names[i]) ? 'last' : undefined}>
          {p && <PieceIcon role={ROLE[p.type]} color={p.color === 'w' ? 'white' : 'black'} />}
        </span>
      ))}
      {from && to && (
        <>
          {/* Stops short of the destination's centre, so the piece shows through. */}
          <svg className="mini-arrow" viewBox="0 0 8 8" aria-hidden>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x - ((to.x - from.x) / Math.hypot(to.x - from.x, to.y - from.y)) * 0.3}
              y2={to.y - ((to.y - from.y) / Math.hypot(to.x - from.x, to.y - from.y)) * 0.3}
              stroke={CLASS_INFO[grade!].color}
            />
          </svg>
          {/* On the right-hand file or the top rank it tucks inside: the board's rounded clip would cut it. */}
          <span
            className={`mini-badge ${to.x > 7 ? 'edge-right' : ''} ${to.y < 1 ? 'edge-top' : ''}`}
            style={{ left: `${(to.x + 0.5) * 12.5}%`, top: `${(to.y - 0.5) * 12.5}%` }}
            aria-hidden
          >
            <ClassIcon cls={grade!} size={18} />
          </span>
        </>
      )}
    </div>
  )
}
