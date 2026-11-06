// The clocks to show at a position of an analysed game, from the `[%clk]` times on its moves.
import type { GameTree, PgnHeaders } from './tree'
import { isMainline, pathTo, ROOT_ID } from './tree'

export interface Clocks {
  white?: number
  black?: number
}

/** The starting time and the increment, in seconds, from a TimeControl tag ("180", "180+2", "600+5"), if it names them. */
function timeControl(headers: PgnHeaders): { base: number; increment: number } | undefined {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(headers.TimeControl ?? '')
  return m ? { base: Number(m[1]), increment: Number(m[2] ?? 0) } : undefined
}

const baseTime = (headers: PgnHeaders) => timeControl(headers)?.base

/**
 * What each player's clock read after their latest move up to `nodeId`. Nothing for a game without
 * clocks, or once you step off the played line (side lines carry no times).
 */
export function clocksAt(tree: GameTree, nodeId: string, headers: PgnHeaders): Clocks {
  if (!isMainline(tree, nodeId)) return {}
  if (!Object.values(tree.nodes).some((n) => n.clock !== undefined)) return {}
  // Before a player's first move the clock still has the whole time control (when the PGN names it).
  const base = baseTime(headers)
  const out: Clocks = { white: base, black: base }
  for (const n of pathTo(tree, nodeId)) {
    if (n.id === ROOT_ID) continue
    const mover = tree.nodes[n.parentId!].fen.split(' ')[1] === 'b' ? 'black' : 'white'
    out[mover] = n.clock
  }
  return out
}

/** 3:05, or 0:09.6 once it's under ten seconds, or 1:02:03 for the long games. */
export function formatClockFace(seconds: number): string {
  const s = Math.max(0, seconds)
  if (s < 10) {
    const tenths = Math.floor(s * 10)
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`
  }
  const whole = Math.floor(s)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const sec = whole % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * Seconds each move of the played line took: the player's clock before it, less their clock after it,
 * plus the increment they were given. A player's first move has no clock before it unless the PGN names the
 * time control, and a move without a clock is left out.
 */
export function timeSpent(tree: GameTree, headers: PgnHeaders): Record<string, number> {
  const out: Record<string, number> = {}
  const tc = timeControl(headers)
  const before: Clocks = { white: tc?.base, black: tc?.base }
  let id = tree.nodes[ROOT_ID].children[0]
  while (id) {
    const n = tree.nodes[id]
    const mover = tree.nodes[n.parentId!].fen.split(' ')[1] === 'b' ? 'black' : 'white'
    if (n.clock !== undefined) {
      const was = before[mover]
      if (was !== undefined) out[id] = Math.max(0, was - n.clock + (tc?.increment ?? 0))
      before[mover] = n.clock
    }
    id = n.children[0]
  }
  return out
}

/** 4.9s, 24s, 1:12 — how long a move took. */
export function formatSpent(seconds: number): string {
  if (seconds < 10) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`
  if (seconds < 60) return `${Math.floor(seconds)}s`
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
