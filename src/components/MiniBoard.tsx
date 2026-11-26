import { Chess } from 'chess.js'
import { useMemo, type CSSProperties } from 'react'
import { useBoardPrefs } from '../lib/boardPrefs'
import { CLASS_INFO, type MoveClass } from '../lib/classify'
import type { Color } from '../lib/evaluation'
import type { BoardTheme } from '../lib/settings'
import { boardColors, boardImage, lastMoveTint } from './Board'
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
  /**
   * Counts up to play the last move again: the piece slides in from where it came from over what it took, then the
   * arrow and badge come back. 0 (or none) shows it already made.
   */
  play?: number
  /** The piece the last move took (chess.js's letter), on its square until the mover lands. */
  captured?: string
}

/** Where a square's centre sits, in eighths of the board, for the given orientation. */
function centreOf(square: string, orientation: Color) {
  const f = square.charCodeAt(0) - 97
  const r = Number(square[1]) - 1
  return orientation === 'white' ? { x: f + 0.5, y: 7.5 - r } : { x: 7.5 - f, y: r + 0.5 }
}

/** A small, static picture of a position (no Chessground), e.g. the daily puzzle on Home. */
export function MiniBoard({ fen, orientation, theme, lastMove, grade, label = 'Puzzle position', play = 0, captured }: Props) {
  const squares = useMemo(() => {
    const rows = new Chess(fen).board()
    const ordered = orientation === 'white' ? rows : [...rows].reverse().map((r) => [...r].reverse())
    return ordered.flat()
  }, [fen, orientation])
  const { palette, lastMoveColor, lastMoveCustom, lastMoveStrength } = useBoardPrefs()
  const colors = boardColors(theme, palette)
  const style = { '--board-image': boardImage(colors.light, colors.dark), '--last-move': lastMoveTint(lastMoveColor, colors, lastMoveCustom, lastMoveStrength) } as CSSProperties
  // Square names in display order, to find the last move's square.
  const names = useMemo(() => {
    const files = 'abcdefgh'
    const list: string[] = []
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) list.push(orientation === 'white' ? files[f] + (8 - r) : files[7 - f] + (r + 1))
    return list
  }, [orientation])
  const from = grade && lastMove ? centreOf(lastMove[0], orientation) : null
  const to = grade && lastMove ? centreOf(lastMove[1], orientation) : null
  const replay = play > 0 && lastMove ? { from: centreOf(lastMove[0], orientation), to: centreOf(lastMove[1], orientation) } : null
  return (
    <div className="mini-board" style={style} role="img" aria-label={label}>
      {/* The last move's squares, drawn on the same 8×8 grid as the board under them (not as tinted cells), so at
          any size they scale and blend exactly as the squares do: no seam of the square's colour at their edges. */}
      {lastMove && (
        <svg className="mini-last" viewBox="0 0 8 8" aria-hidden>
          {lastMove.map((sq) => {
            const c = centreOf(sq, orientation)
            return <rect key={sq} x={c.x - 0.5} y={c.y - 0.5} width="1" height="1" />
          })}
        </svg>
      )}
      {squares.map((p, i) => {
        const color = p?.color === 'w' ? 'white' : 'black'
        if (p && replay && names[i] === lastMove![1]) {
          // The move again: what it took sits on the square until the mover, sliding in from its own square, lands.
          const move = { '--dx': replay.from.x - replay.to.x, '--dy': replay.from.y - replay.to.y } as CSSProperties
          return (
            <span key={i} className="moving">
              {captured && (
                <i key={`t${play}`} className="mini-taken">
                  <PieceIcon role={ROLE[captured]} color={color === 'white' ? 'black' : 'white'} />
                </i>
              )}
              <i key={`m${play}`} className="mini-mover" style={move}>
                <PieceIcon role={ROLE[p.type]} color={color} />
              </i>
            </span>
          )
        }
        return (
          <span key={i}>
            {p && <PieceIcon role={ROLE[p.type]} color={color} />}
          </span>
        )
      })}
      {from && to && (
        <>
          {/* Stops short of the destination's centre, so the piece shows through. */}
          <svg key={`a${play}`} className={`mini-arrow ${play ? 'replay' : ''}`} viewBox="0 0 8 8" aria-hidden>
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
            key={`b${play}`}
            className={`mini-badge ${play ? 'replay' : ''} ${to.x > 7 ? 'edge-right' : ''} ${to.y < 1 ? 'edge-top' : ''}`}
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
