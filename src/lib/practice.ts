// "Play it out": any position on a board (a puzzle, a mistake, the analysis board) played on against the computer.
import { Chess } from 'chess.js'
import type { Color } from './evaluation'
import { askPractice } from './playStore'
import { navigate } from './router'

/** Whether a position can be played on: someone has a move. */
export function canPlayOut(fen: string): boolean {
  try {
    return !new Chess(fen).isGameOver()
  } catch {
    return false
  }
}

/** Opens Play against the computer from `fen`, you playing `color`; Back comes here again. */
export function playItOut(fen: string, color: Color) {
  askPractice({ fen, color, from: location.pathname })
  navigate('/play/computer')
}
