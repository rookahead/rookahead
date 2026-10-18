// Rules of a game against the computer: how it ends, what a takeback undoes, when a draw is accepted.
import { Chess } from 'chess.js'
import type { ClockSetting } from './clock'
import type { Color } from './evaluation'
import { uciToMove } from './tree'

export interface Outcome {
  result: '1-0' | '0-1' | '1/2-1/2'
  reason: 'checkmate' | 'stalemate' | 'insufficient material' | 'threefold repetition' | 'fifty-move rule' | 'timeout' | 'resignation' | 'agreement'
}

/** How the position after `moves` ends the game, if it does. */
export function outcomeOf(startFen: string, moves: string[]): Outcome | null {
  const chess = new Chess(startFen)
  for (const uci of moves) chess.move(uciToMove(uci))
  if (chess.isCheckmate()) return { result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' }
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' }
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient material' }
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'threefold repetition' }
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', reason: 'fifty-move rule' }
  return null
}

/** Plies a takeback removes: your last move, plus the computer's reply if it has moved. 0 = none of yours yet. */
export function takebackPlies(movesPlayed: number, playerColor: Color, startTurn: Color): number {
  const moverOf = (ply: number): Color => ((ply % 2 === 1) === (startTurn === 'white') ? 'white' : 'black')
  for (let back = 1; back <= Math.min(2, movesPlayed); back++) {
    if (moverOf(movesPlayed - back + 1) === playerColor) return back
  }
  return 0
}

/** The computer agrees to a draw only in a level position, and not in the opening. */
export function acceptsDraw(scoreCp: number | null, mate: boolean, plies: number): boolean {
  return !mate && scoreCp !== null && Math.abs(scoreCp) <= 30 && plies >= 30
}

const REASON_TEXT: Record<Outcome['reason'], string> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  'insufficient material': 'insufficient material',
  'threefold repetition': 'threefold repetition',
  'fifty-move rule': 'the fifty-move rule',
  timeout: 'timeout',
  resignation: 'resignation',
  agreement: 'agreement',
}

/** The finished (or unfinished) game as a PGN for the games list and for review. */
export function playPgn(moves: string[], meta: { color: Color; level: number; clock: ClockSetting; outcome: Outcome | null; date: Date; startFen?: string }): string {
  const chess = new Chess(meta.startFen)
  const computer = `Rookahead Level ${meta.level}`
  const white = meta.color === 'white' ? 'You' : computer
  const black = meta.color === 'black' ? 'You' : computer
  const d = meta.date
  chess.setHeader('Event', 'Rookahead · vs computer')
  chess.setHeader('Site', 'https://rookahead.com')
  chess.setHeader('Date', `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`)
  chess.setHeader('White', white)
  chess.setHeader('Black', black)
  chess.setHeader('Result', meta.outcome?.result ?? '*')
  chess.setHeader('TimeControl', meta.clock === 'none' ? '-' : meta.clock)
  if (meta.outcome) {
    const { result, reason } = meta.outcome
    const winner = result === '1-0' ? white : result === '0-1' ? black : null
    chess.setHeader('Termination', winner ? `${winner} won by ${REASON_TEXT[reason]}` : `Game drawn by ${REASON_TEXT[reason]}`)
  }
  for (const uci of moves) chess.move(uciToMove(uci))
  return chess.pgn()
}
