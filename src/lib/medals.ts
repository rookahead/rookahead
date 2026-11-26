import { Chess } from 'chess.js'
import type { GameReport } from './classify'
import type { Color } from './evaluation'
import { howItEnded } from './homeGames'
import type { MyGame } from './myGames'
import type { CachedReview } from './reviewCache'
import type { MoveNode } from './tree'

/** What a game can earn, besides its move grades. Only what can be read off the game for certain. */
export type Medal = 'repetition' | 'backToBack' | 'legendary' | 'checkmate'

/** How rare: the medal's colour. */
export type MedalTier = 'common' | 'uncommon' | 'rare' | 'unique'

export const MEDALS: Record<Medal, { label: string; tier: MedalTier; about: string }> = {
  repetition: { label: 'Draw by repetition', tier: 'common', about: 'The same position came up three times' },
  backToBack: { label: 'Back to back', tier: 'rare', about: 'Two Legendary moves in a row' },
  legendary: { label: 'Legendary', tier: 'rare', about: 'You played a Legendary move' },
  // Only in the lists of games, to tell how a game ended at a glance.
  checkmate: { label: 'Checkmate', tier: 'common', about: 'The game ended in checkmate' },
}

/** A position as repetition counts it: the pieces, whose turn, castling rights and en passant. */
const place = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

/** Did the game end on a position seen for the third time? */
export function endsInRepetition(fens: string[]): boolean {
  if (!fens.length) return false
  const last = place(fens[fens.length - 1])
  return fens.filter((f) => place(f) === last).length >= 3
}

/** Did `color` play two Legendary moves one after the other? */
export function backToBack(line: MoveNode[], report: GameReport, color: Color): boolean {
  let previous = false
  for (let i = 1; i < line.length; i++) {
    const mover: Color = line[i - 1].fen.split(' ')[1] === 'b' ? 'black' : 'white'
    if (mover !== color) continue
    const legendary = report.moves[line[i].id]?.cls === 'brilliant'
    if (legendary && previous) return true
    previous = legendary
  }
  return false
}

/** Each side's back-to-back Legendary moves, as a review saves them. */
export const backToBackBySide = (line: MoveNode[], report: GameReport): Record<Color, boolean> => ({
  white: backToBack(line, report, 'white'),
  black: backToBack(line, report, 'black'),
})

/** A review's medals for each side, the rarest first: a drawn game that ended in a repetition earns it for both. */
export function reviewMedals(line: MoveNode[], report: GameReport, drawn: boolean): Record<Color, Medal[]> {
  const repetition = drawn && endsInRepetition(line.map((n) => n.fen))
  const medals = (c: Color): Medal[] => [
    ...(backToBack(line, report, c) ? (['backToBack'] as const) : []),
    ...(report.counts[c]?.brilliant ? (['legendary'] as const) : []),
    ...(repetition ? (['repetition'] as const) : []),
  ]
  return { white: medals('white'), black: medals('black') }
}

// Whether each drawn game ended in a repetition, worked out once: it means reading the whole PGN.
const repeats = new Map<string, boolean>()

function drawnByRepetition(game: MyGame): boolean {
  const id = `${game.source}:${game.key}`
  if (!repeats.has(id)) {
    let repeated = /repetition/i.test(/\[Termination "([^"]*)"\]/.exec(game.pgn)?.[1] ?? '')
    if (!repeated) {
      try {
        const chess = new Chess()
        chess.loadPgn(game.pgn.trim())
        repeated = chess.isThreefoldRepetition()
      } catch {
        // A game chess.js won't read: no medal.
      }
    }
    repeats.set(id, repeated)
  }
  return repeats.get(id)!
}

/** A game's medals in your list, the rarest first: from the game itself and its saved review (if it has one). Legendary shows once however many; checkmate (won or lost) shows only here. */
export function gameMedals(game: MyGame, review?: CachedReview): Medal[] {
  const medals: Medal[] = []
  if (review?.backToBack?.[game.color]) medals.push('backToBack')
  if (review?.brilliant[game.color]) medals.push('legendary')
  if (howItEnded(game) === 'by checkmate') medals.push('checkmate')
  if (game.result === 'draw' && drawnByRepetition(game)) medals.push('repetition')
  return medals
}
