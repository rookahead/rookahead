import { Chess, DEFAULT_POSITION, type Square } from 'chess.js'
import type { Color } from './evaluation'
import { formatClock } from './pgn'

// The game is a tree: every node is a position, `children[0]` continues the
// main line and any further children are side variations. Ids are derived
// from the move path, so the same line always gets the same id.

export const ROOT_ID = 'root'

export interface MoveNode {
  id: string
  parentId: string | null
  children: string[]
  /** 0 for the start position, 1 after White's first move, … */
  ply: number
  fen: string
  /** Move that led here (absent on the root). */
  san?: string
  uci?: string
  from?: Square
  to?: Square
  /** Seconds left on the mover's clock after this move, from `[%clk]`. */
  clock?: number
}

export interface GameTree {
  nodes: Record<string, MoveNode>
}

export type MoveInput = string | { from: string; to: string; promotion?: string }

export function createTree(fen: string = DEFAULT_POSITION): GameTree {
  const ply = plyFromFen(fen)
  return { nodes: { [ROOT_ID]: { id: ROOT_ID, parentId: null, children: [], ply, fen } } }
}

/** Ply count implied by a FEN's move number and side to move. */
export function plyFromFen(fen: string): number {
  const parts = fen.split(' ')
  const fullmove = Number(parts[5] ?? 1) || 1
  return (fullmove - 1) * 2 + (parts[1] === 'b' ? 1 : 0)
}

/**
 * Plays `move` from `parentId`. If the move already exists as a child it is
 * reused rather than duplicated. Returns null for an illegal move.
 */
export function addMove(
  tree: GameTree,
  parentId: string,
  move: MoveInput,
  extra?: Partial<Pick<MoveNode, 'clock'>>,
): { tree: GameTree; nodeId: string } | null {
  const parent = tree.nodes[parentId]
  if (!parent) return null
  const chess = new Chess(parent.fen)
  let played
  try {
    played = chess.move(move)
  } catch {
    return null
  }
  const uci = played.from + played.to + (played.promotion ?? '')
  const id = parentId === ROOT_ID ? uci : `${parentId}.${uci}`
  if (tree.nodes[id]) return { tree, nodeId: id }

  const node: MoveNode = {
    id,
    parentId,
    children: [],
    ply: parent.ply + 1,
    fen: chess.fen(),
    san: played.san,
    uci,
    from: played.from,
    to: played.to,
    ...extra,
  }
  return {
    tree: {
      nodes: {
        ...tree.nodes,
        [parentId]: { ...parent, children: [...parent.children, id] },
        [id]: node,
      },
    },
    nodeId: id,
  }
}

/** Plays a sequence of UCI moves from `parentId`, returning the last node. `clocks` gives the clock after each move. */
export function addLine(tree: GameTree, parentId: string, ucis: string[], clocks?: number[]) {
  let current = { tree, nodeId: parentId }
  for (const [i, uci] of ucis.entries()) {
    const clock = clocks?.[i]
    const next = addMove(current.tree, current.nodeId, uciToMove(uci), clock !== undefined ? { clock } : undefined)
    if (!next) break
    current = next
  }
  return current
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
}

/** Root followed by every main-line position. */
export function mainline(tree: GameTree): MoveNode[] {
  const line: MoveNode[] = []
  let node: MoveNode | undefined = tree.nodes[ROOT_ID]
  while (node) {
    line.push(node)
    node = node.children.length ? tree.nodes[node.children[0]] : undefined
  }
  return line
}

/** Nodes from the root down to `id`, inclusive. */
export function pathTo(tree: GameTree, id: string): MoveNode[] {
  const path: MoveNode[] = []
  let node: MoveNode | undefined = tree.nodes[id]
  while (node) {
    path.unshift(node)
    node = node.parentId ? tree.nodes[node.parentId] : undefined
  }
  return path
}

export function isMainline(tree: GameTree, id: string): boolean {
  let node = tree.nodes[id]
  while (node?.parentId) {
    const parent = tree.nodes[node.parentId]
    if (parent.children[0] !== node.id) return false
    node = parent
  }
  return Boolean(node)
}

/** Removes a node and everything below it. */
export function deleteNode(tree: GameTree, id: string): GameTree {
  const node = tree.nodes[id]
  if (!node?.parentId) return tree
  const nodes = { ...tree.nodes }
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    stack.push(...nodes[cur].children)
    delete nodes[cur]
  }
  const parent = nodes[node.parentId]
  nodes[node.parentId] = { ...parent, children: parent.children.filter((c) => c !== id) }
  return { nodes }
}

/** Makes the variation containing `id` the main line at its branch point. */
export function promoteVariation(tree: GameTree, id: string): GameTree {
  let node = tree.nodes[id]
  const nodes = { ...tree.nodes }
  while (node?.parentId) {
    const parent = nodes[node.parentId]
    if (parent.children[0] !== node.id) {
      nodes[parent.id] = { ...parent, children: [node.id, ...parent.children.filter((c) => c !== node.id)] }
      return { nodes }
    }
    node = parent
  }
  return tree
}

export type PgnHeaders = Record<string, string>

export interface ImportedGame {
  tree: GameTree
  headers: PgnHeaders
  pgn: string
}

/** Where chess.js's PGN parser stopped, when it couldn't read the text. */
function parseStop(err: unknown): number | null {
  const at = (err as { location?: { start?: { offset?: unknown } } } | null)?.location?.start?.offset
  return typeof at === 'number' ? at : null
}

/**
 * Loads a PGN as people paste it. Notes after the result ("1-0 Great game!") are dropped. Anything else
 * that isn't chess says where, in words: "Couldn’t read the PGN near “Zoë’s” (move 3)", not the parser's
 * list of everything it expected.
 */
function loadPasted(chess: Chess, text: string): void {
  try {
    chess.loadPgn(text)
    return
  } catch (err) {
    const at = parseStop(err)
    if (at === null) throw err
    // The game ended before the stray text: read it up to its result.
    const end = [...text.slice(0, at).matchAll(/(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)(?=\s|$)/g)].pop()
    if (end && end.index !== undefined) {
      try {
        chess.loadPgn(text.slice(0, end.index + end[0].length))
        return
      } catch {
        // Not that either: say where the first problem is.
      }
    }
    const start = text.lastIndexOf('\n', at - 1) + 1
    const word = text.slice(at).match(/^\S*/)![0]
    const near = (text.slice(start, at).match(/\S*$/)![0] + word).slice(0, 24)
    // The last move number before the problem, outside the tags and comments.
    const before = text.slice(0, at).replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
    const move = [...before.matchAll(/(?:^|\s)(\d+)\.+/g)].pop()?.[1]
    const line = text.slice(0, at).split('\n').length
    throw new Error(`Couldn’t read the PGN near “${near}” (${move ? `move ${move}` : `line ${line}`}).`)
  }
}

/** Parses a PGN's main line (plus `[%clk]` clock comments) into a tree. */
export function treeFromPgn(pgn: string): ImportedGame {
  const chess = new Chess()
  loadPasted(chess, pgn.trim())
  // chess.js fills the tags a PGN leaves out with "?" (and the date with "????.??.??"): they'd show as names.
  const headers = Object.fromEntries(
    Object.entries(chess.getHeaders()).filter((e): e is [string, string] => typeof e[1] === 'string' && !/^[?.]+$/.test(e[1])),
  )
  const history = chess.history({ verbose: true })
  const startFen = headers.FEN && headers.SetUp !== '0' ? headers.FEN : (history[0]?.before ?? DEFAULT_POSITION)

  // Chess.com and Lichess annotate each move with its clock. Read it off the comment after the move itself,
  // so a PGN with a few clocks missing (or extra ones in a side line) still shows the ones it has.
  const clockOf = (comment: string | undefined) => {
    const m = comment && /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(comment)
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined
  }
  const commentAfter = new Map(chess.getComments().map((c) => [c.fen, c.comment]))
  const clocks = history.map((move) => clockOf(commentAfter.get(move.after)))

  let tree = createTree(startFen)
  let parentId = ROOT_ID
  history.forEach((move, i) => {
    const input = { from: move.from, to: move.to, promotion: move.promotion }
    const next = addMove(tree, parentId, input, clocks[i] !== undefined ? { clock: clocks[i] } : undefined)
    if (!next) throw new Error(`Illegal move in PGN: ${move.san}`)
    tree = next.tree
    parentId = next.nodeId
  })
  return { tree, headers, pgn }
}

/** The side a pasted game's player tags name, when one is a username we know. */
export function guessSide(pgn: string, users: (string | undefined)[]): Color | null {
  const known = users.filter(Boolean).map((u) => u!.toLowerCase())
  const tag = (name: string) => new RegExp(`\\[${name}\\s+"([^"]*)"\\]`).exec(pgn)?.[1].toLowerCase()
  const white = tag('White')
  const black = tag('Black')
  if (white && known.includes(white)) return 'white'
  if (black && known.includes(black)) return 'black'
  return null
}

/** Builds a PGN of the main line, for saving/restoring the session. */
export function mainlineToPgn(tree: GameTree, headers: PgnHeaders): string {
  const line = mainline(tree)
  const root = line[0]
  const chess = new Chess(root.fen)
  for (const [k, v] of Object.entries(headers)) chess.setHeader(k, v)
  if (root.fen !== DEFAULT_POSITION) {
    chess.setHeader('SetUp', '1')
    chess.setHeader('FEN', root.fen)
  }
  for (const node of line.slice(1)) {
    chess.move(uciToMove(node.uci!))
    // Keep the clocks: the saved game is read back as a PGN, and without them the board's clocks vanish.
    if (node.clock !== undefined) chess.setComment(`[%clk ${formatClock(node.clock)}]`)
  }
  return chess.pgn()
}

/** "12." for White's move, "12…" for Black's — for the move *leading to* `ply`. */
export function moveNumberLabel(ply: number): string {
  const n = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${n}.` : `${n}…`
}

export function turnAt(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

// Each "fen|uci" step already converted, as [san, fen after]. The engine resends lines that
// mostly share their start with the last update, so live analysis hardly ever runs chess.js.
const sanSteps = new Map<string, [string, string]>()

/** Converts an engine PV (UCI) into SAN moves from `fen`. Stops at the first illegal move. */
export function pvToSan(fen: string, pv: string[]): string[] {
  if (sanSteps.size > 20000) sanSteps.clear()
  let chess: Chess | null = null
  const out: string[] = []
  for (const uci of pv) {
    const key = `${fen}|${uci}`
    const known = sanSteps.get(key)
    if (known) {
      out.push(known[0])
      fen = known[1]
      chess = null
      continue
    }
    try {
      chess ??= new Chess(fen)
      const san = chess.move(uciToMove(uci)).san
      const after = chess.fen()
      sanSteps.set(key, [san, after])
      out.push(san)
      fen = after
    } catch {
      break
    }
  }
  return out
}
