// Home's game list: your games grouped by day, how each ended, and each reviewed game's moves as a strip of
// colours, one per move you played.
import { Chess } from 'chess.js'
import type { MoveClass } from './classify'
import { dayLabel, finalPosition, type MyGame } from './myGames'
import type { SharedGame } from './share'

/** A PGN tag's value, or undefined when the game doesn't have it. */
function tag(pgn: string, name: string): string | undefined {
  return new RegExp(`\\[${name} "([^"]*)"\\]`).exec(pgn)?.[1]
}

/**
 * How the game ended, the way a row says it: "by resignation", "on time", "by repetition". Chess.com and our own
 * games say so in Termination; Lichess says "Normal" for both mate and resignation, so mate is read off the board.
 */
export function howItEnded(game: MyGame): string | null {
  const termination = tag(game.pgn, 'Termination')
  if (!termination) return null
  const said = /\b(?:won|drawn)\s+((?:by|on)\s+.+)$/i.exec(termination)
  if (said) return said[1]
  if (/time/i.test(termination)) return 'on time'
  if (/abandon/i.test(termination)) return 'by abandonment'
  if (/^normal$/i.test(termination.trim())) {
    if (game.result === 'draw') return 'drawn'
    const final = finalPosition(game)
    try {
      if (final && new Chess(final.fen).isCheckmate()) return 'by checkmate'
    } catch {
      // A position chess.js won't load: say no more than that it was won.
    }
    return 'by resignation'
  }
  return null
}

/** Your rating after the game: what Chess.com gives, or Lichess's (from before it) with the game's change added. */
function ratingAfter(game: MyGame): number | null {
  const rating = game[game.color].rating
  if (rating == null) return null
  if (game.source === 'chesscom') return rating
  if (game.source === 'lichess') {
    const diff = tag(game.pgn, game.color === 'white' ? 'WhiteRatingDiff' : 'BlackRatingDiff')
    return diff != null && /^[+-]?\d+$/.test(diff) ? rating + Number(diff) : null
  }
  return null
}

/** Your rating before the game: Lichess's own, or for Chess.com your rating after your game before it, if it's here. */
function ratingBefore(game: MyGame, all: MyGame[]): number | null {
  if (game.source === 'lichess') return game[game.color].rating ?? null
  if (game.source !== 'chesscom') return null
  const earlier = all.find((g) => g.endedAt < game.endedAt && samePool(g, game))
  return earlier ? ratingAfter(earlier) : null
}

/** Rated the same way: one site and one time control (bullet, blitz and rapid each have their own rating). */
const samePool = (a: MyGame, b: MyGame) => a.source === b.source && a.time === b.time

export interface GameDay {
  label: string
  /** The day's games that are shown. */
  games: MyGame[]
  /** The whole day's results, shown or not. */
  won: number
  lost: number
  drawn: number
  /** Your rating at the start and end of the day in the shown games' time control, when they share one and both
   * ends are known. */
  rating: { time: string; from: number; to: number } | null
}

/** Games (newest first) grouped by the day they ended; `all` is every game you have, for each day's results and
 * rating, all of it, when only some of its games are shown. */
export function gameDays(games: MyGame[], all: MyGame[] = games, now = new Date()): GameDay[] {
  const days: GameDay[] = []
  for (const g of games) {
    const label = dayLabel(g.endedAt, now)
    let day = days.at(-1)
    if (day?.label !== label) days.push((day = { label, games: [], won: 0, lost: 0, drawn: 0, rating: null }))
    day.games.push(g)
  }
  for (const day of days) {
    for (const g of all) {
      if (dayLabel(g.endedAt, now) !== day.label) continue
      if (g.result === 'win') day.won++
      else if (g.result === 'loss') day.lost++
      else day.drawn++
    }
    const rated = day.games.filter((g) => g.source !== 'rookahead' && g[g.color].rating != null)
    if (!rated.length || !rated.every((g) => samePool(g, rated[0]))) continue
    // Every game of that day in the pool, not only the ones shown, so the day's change is the whole day's.
    const pool = all.filter((g) => samePool(g, rated[0]) && dayLabel(g.endedAt, now) === day.label)
    const from = ratingBefore(pool[pool.length - 1], all)
    const to = ratingAfter(pool[0])
    if (from != null && to != null) day.rating = { time: rated[0].time, from, to }
  }
  return days
}

/** What a move's colour in the strip stands for. The engine's top moves and the good ones read as one. */
export type Quality = 'book' | 'good' | 'clutch' | 'legendary' | 'slip' | 'mistake' | 'blunder'

const QUALITY: Record<MoveClass, Quality> = {
  book: 'book',
  best: 'good',
  excellent: 'good',
  good: 'good',
  forced: 'good',
  great: 'clutch',
  brilliant: 'legendary',
  inaccuracy: 'slip',
  mistake: 'mistake',
  miss: 'mistake',
  blunder: 'blunder',
}

export interface MoveQuality {
  /** One per move you played, in order. */
  moves: Quality[]
  /** A few words on the game's headline: its blunders and where the first was, else its Legendary moves. */
  note: string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Your moves' verdicts in a reviewed game, as the strip's colours and a short note. */
export function moveQuality(shared: SharedGame, color: 'white' | 'black'): MoveQuality | null {
  const classes = shared.review?.classes
  if (!classes?.length) return null
  const [, turn, , , , full] = shared.startFen.split(' ')
  const firstMover = turn === 'b' ? 'black' : 'white'
  const startMove = Number(full) || 1
  const moves: Quality[] = []
  let blunders = 0
  let firstBlunder = 0
  let legendary = 0
  let mistakes = 0
  classes.forEach((cls, i) => {
    const mover = (i % 2 === 0) === (firstMover === 'white') ? 'white' : 'black'
    if (mover !== color) return
    const q = QUALITY[cls]
    moves.push(q)
    if (q === 'blunder') {
      if (!blunders) firstBlunder = startMove + Math.floor((i + (firstMover === 'black' ? 1 : 0)) / 2)
      blunders++
    } else if (q === 'legendary') legendary++
    else if (q === 'mistake') mistakes++
  })
  const note = blunders
    ? `${plural(blunders, 'blunder')}, move ${firstBlunder}`
    : legendary
      ? `${legendary} Legendary`
      : mistakes
        ? plural(mistakes, 'mistake')
        : 'No mistakes'
  return { moves, note }
}
