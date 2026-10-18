// Parsing for the UCI "info" lines Stockfish streams while searching.

export type Score =
  | { type: 'cp'; value: number } // centipawns
  // Moves to mate; negative = getting mated. `mate 0` means the side to move is
  // already checkmated — `mated` records who that is once converted to White POV.
  | { type: 'mate'; value: number; mated?: 'white' | 'black' }

export interface InfoLine {
  depth: number
  seldepth?: number
  multipv: number
  score: Score
  /** Search was cut by an aspiration window — the score is only a bound. */
  bound?: 'lower' | 'upper'
  /** Win/draw/loss per mille, from the side to move's point of view. */
  wdl?: [number, number, number]
  nodes?: number
  nps?: number
  time?: number
  pv: string[]
}

/** Parses an `info ... pv ...` line. Returns null for lines without a scored PV. */
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ')) return null
  const t = line.split(/\s+/)
  let depth: number | undefined
  let score: Score | undefined
  const out: Partial<InfoLine> = { multipv: 1 }

  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        depth = Number(t[++i])
        break
      case 'seldepth':
        out.seldepth = Number(t[++i])
        break
      case 'multipv':
        out.multipv = Number(t[++i])
        break
      case 'nodes':
        out.nodes = Number(t[++i])
        break
      case 'nps':
        out.nps = Number(t[++i])
        break
      case 'time':
        out.time = Number(t[++i])
        break
      case 'wdl':
        out.wdl = [Number(t[i + 1]), Number(t[i + 2]), Number(t[i + 3])]
        i += 3
        break
      case 'score': {
        const kind = t[++i]
        const value = Number(t[++i])
        if (kind === 'cp' || kind === 'mate') score = { type: kind, value }
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          out.bound = t[++i] === 'lowerbound' ? 'lower' : 'upper'
        }
        break
      }
      case 'pv':
        out.pv = t.slice(i + 1).filter(Boolean)
        i = t.length
        break
      case 'string':
        return null
    }
  }

  if (depth === undefined || !score || !out.pv?.length) return null
  return { ...out, depth, score } as InfoLine
}

/** Parses `bestmove e2e4 [ponder e7e5]`. Returns null for `(none)`. */
export function parseBestMove(line: string): string | null | undefined {
  if (!line.startsWith('bestmove')) return undefined
  const move = line.split(/\s+/)[1]
  return !move || move === '(none)' ? null : move
}
