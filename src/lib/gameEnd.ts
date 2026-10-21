// How a game ended, as marks on the kings: what the board shows on a game's final position.
import { Chess, SQUARES, type Square } from 'chess.js'

export type EndKind = 'mate' | 'resign' | 'timeout' | 'winner' | 'draw'

export interface EndMark {
  square: Square
  kind: EndKind
  label: string
}

/** What the game's record says about its end: the PGN Result and Termination headers. */
export interface Ending {
  result?: string
  termination?: string
}

function kingSquares(chess: Chess) {
  const kings: { w?: Square; b?: Square } = {}
  for (const sq of SQUARES) {
    const piece = chess.get(sq)
    if (piece?.type === 'k') kings[piece.color] = sq
  }
  return kings
}

/** The loser's mark, read off a Termination header from Chess.com, Lichess or our own games. */
function lossOf(termination: string | undefined): { kind: EndKind; label: string } | null {
  if (!termination) return null
  if (/time|forfeit/i.test(termination)) return { kind: 'timeout', label: 'Time out' }
  if (/abandon/i.test(termination)) return { kind: 'resign', label: 'Abandoned' }
  if (/resign/i.test(termination)) return { kind: 'resign', label: 'Resigned' }
  // Lichess says "Normal" for both mate and resignation; mate is read off the board first.
  if (/^normal$/i.test(termination.trim())) return { kind: 'resign', label: 'Resigned' }
  return null
}

/**
 * The marks for the kings in `fen`. Checkmate and stalemate are read off the board (so they show in
 * side lines too); any other ending needs the game's record, so pass it only on the game's last move.
 */
export function endMarks(fen: string, ending: Ending = {}): EndMark[] {
  const chess = new Chess(fen, { skipValidation: true })
  const kings = kingSquares(chess)
  const toMove = chess.turn()
  const other = toMove === 'w' ? 'b' : 'w'
  if (!kings.w || !kings.b) return []

  if (chess.isCheckmate()) {
    return [
      { square: kings[toMove]!, kind: 'mate', label: 'Checkmate' },
      { square: kings[other]!, kind: 'winner', label: 'Winner' },
    ]
  }
  if (chess.isStalemate()) {
    return [
      { square: kings[toMove]!, kind: 'draw', label: 'Stalemate' },
      { square: kings[other]!, kind: 'draw', label: 'Draw' },
    ]
  }

  const { result, termination } = ending
  if (result === '1/2-1/2') {
    return [
      { square: kings.w, kind: 'draw', label: 'Draw' },
      { square: kings.b, kind: 'draw', label: 'Draw' },
    ]
  }
  if (result !== '1-0' && result !== '0-1') return []
  const [winner, loser] = result === '1-0' ? (['w', 'b'] as const) : (['b', 'w'] as const)
  const loss = lossOf(termination)
  const win: EndMark = { square: kings[winner]!, kind: 'winner', label: 'Winner' }
  return loss ? [{ square: kings[loser]!, ...loss }, win] : [win]
}
