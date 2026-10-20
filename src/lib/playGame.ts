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

/** No draws before both sides have made this many moves (plies). */
export const DRAW_AFTER_PLIES = 20

/**
 * Whether the computer takes a draw: like a person, when it isn't better (`botWin`, its own chance of
 * winning, 0–100), and the weaker it is the more it's also happy to when only a little better. Not in
 * the opening. (It used to need a dead-level position, so it turned draws down even when losing.)
 */
export function acceptsDraw(botWin: number, plies: number, level: number): boolean {
  return plies >= DRAW_AFTER_PLIES && botWin <= 50 + (11 - level)
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

type PlayMeta = { color: Color; level: number; clock: ClockSetting; outcome: Outcome | null; date: Date; startFen?: string }

/** The game's PGN tags: players, date, result and how it ended. */
export function playHeaders(meta: PlayMeta): Record<string, string> {
  const computer = `Rookahead Level ${meta.level}`
  const white = meta.color === 'white' ? 'You' : computer
  const black = meta.color === 'black' ? 'You' : computer
  const d = meta.date
  const headers: Record<string, string> = {
    Event: 'Rookahead · vs computer',
    Site: 'https://rookahead.com',
    Date: `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`,
    White: white,
    Black: black,
    Result: meta.outcome?.result ?? '*',
    TimeControl: meta.clock === 'none' ? '-' : meta.clock,
  }
  if (meta.outcome) {
    const { result, reason } = meta.outcome
    const winner = result === '1-0' ? white : result === '0-1' ? black : null
    headers.Termination = winner ? `${winner} won by ${REASON_TEXT[reason]}` : `Game drawn by ${REASON_TEXT[reason]}`
  }
  return headers
}

/** The finished (or unfinished) game as a PGN for the games list and for review. */
export function playPgn(moves: string[], meta: PlayMeta): string {
  const chess = new Chess(meta.startFen)
  for (const [name, value] of Object.entries(playHeaders(meta))) chess.setHeader(name, value)
  for (const uci of moves) chess.move(uciToMove(uci))
  return chess.pgn()
}
