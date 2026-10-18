import { Chess } from 'chess.js'
import { useMemo, type CSSProperties } from 'react'
import type { Color } from '../lib/evaluation'
import type { BoardTheme } from '../lib/settings'
import { boardImage, BOARD_THEMES } from './Board'
import { PieceIcon } from './PieceIcon'

const ROLE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/** A small, static picture of a position (no Chessground), e.g. the daily puzzle on Home. */
export function MiniBoard({ fen, orientation, theme, lastMove }: { fen: string; orientation: Color; theme: BoardTheme; lastMove?: [string, string] }) {
  const squares = useMemo(() => {
    const rows = new Chess(fen).board()
    const ordered = orientation === 'white' ? rows : [...rows].reverse().map((r) => [...r].reverse())
    return ordered.flat()
  }, [fen, orientation])
  const colors = BOARD_THEMES[theme]
  const style = { '--board-image': boardImage(colors.light, colors.dark), '--last-move': colors.lastMove ?? 'rgba(255, 255, 51, 0.42)' } as CSSProperties
  // Square names in display order, for the last-move highlight.
  const names = useMemo(() => {
    const files = 'abcdefgh'
    const list: string[] = []
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) list.push(orientation === 'white' ? files[f] + (8 - r) : files[7 - f] + (r + 1))
    return list
  }, [orientation])
  return (
    <div className="mini-board" style={style} role="img" aria-label="Puzzle position">
      {squares.map((p, i) => (
        <span key={i} className={lastMove?.includes(names[i]) ? 'last' : undefined}>
          {p && <PieceIcon role={ROLE[p.type]} color={p.color === 'w' ? 'white' : 'black'} />}
        </span>
      ))}
    </div>
  )
}
