// Games played against the computer on this device, newest first, for "My recent games".
import type { ClockSetting } from './clock'
import type { Color } from './evaluation'
import type { Outcome } from './playGame'

export interface PlayedGame {
  id: string
  pgn: string
  result: 'win' | 'loss' | 'draw'
  reason: Outcome['reason']
  color: Color
  level: number
  clock: ClockSetting
  takebacks: number
  hints: number
  endedAt: number
}

const KEY = 'rookahead.games.v1'
const LIMIT = 200
const defaultStorage = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

export function loadGames(storage = defaultStorage()): PlayedGame[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as PlayedGame[]) : []
  } catch {
    return []
  }
}

export function saveGame(game: PlayedGame, storage = defaultStorage()): void {
  try {
    const games = [game, ...loadGames(storage).filter((g) => g.id !== game.id)].sort((a, b) => b.endedAt - a.endedAt).slice(0, LIMIT)
    storage?.setItem(KEY, JSON.stringify(games))
  } catch {
    // Storage full or unavailable: the game just isn't listed.
  }
}
