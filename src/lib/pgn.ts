// PGN export for the Share dialog: the main line, optionally with review marks (NAGs) and clocks.
// chess.js can't write NAGs, so this builds the movetext itself.
import { DEFAULT_POSITION } from 'chess.js'
import type { MoveClass } from './classify'
import type { MoveNode, PgnHeaders } from './tree'

/** Chess.com's codes, so its importer and ours read the marks back the same way. */
export const NAGS: Partial<Record<MoveClass, string>> = {
  brilliant: '$3',
  great: '$1',
  inaccuracy: '$6',
  mistake: '$2',
  miss: '$2',
  blunder: '$4',
}

const MAX_LINE = 80

/** Seconds → "h:mm:ss", keeping tenths when the clock has them. */
function formatClock(seconds: number): string {
  const tenths = Math.round(seconds * 10)
  const h = Math.floor(tenths / 36000)
  const m = Math.floor((tenths % 36000) / 600)
  const s = (tenths % 600) / 10
  const ss = s.toFixed(tenths % 10 ? 1 : 0).padStart(tenths % 10 ? 4 : 2, '0')
  return `${h}:${String(m).padStart(2, '0')}:${ss}`
}

const escapeTag = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export function exportPgn(line: MoveNode[], headers: PgnHeaders, opts: { classes?: Record<string, MoveClass> | null; clocks: boolean }): string {
  const tags: PgnHeaders = { ...headers }
  const startFen = line[0].fen
  if (startFen !== DEFAULT_POSITION) {
    tags.SetUp = '1'
    tags.FEN = startFen
  }
  const result = tags.Result || '*'

  // Tokens never break across lines (a clock comment is one token).
  const tokens: string[] = []
  let afterComment = true
  for (const node of line.slice(1)) {
    const white = node.ply % 2 === 1
    const number = Math.ceil(node.ply / 2)
    if (white) tokens.push(`${number}.`)
    else if (afterComment) tokens.push(`${number}...`)
    tokens.push(node.san!)
    afterComment = false
    const nag = opts.classes?.[node.id] && NAGS[opts.classes[node.id]]
    if (nag) tokens.push(nag)
    if (opts.clocks && node.clock !== undefined) {
      tokens.push(`{[%clk ${formatClock(node.clock)}]}`)
      afterComment = true
    }
  }
  tokens.push(result)

  const rows: string[] = []
  let row = ''
  for (const token of tokens) {
    if (row && row.length + 1 + token.length > MAX_LINE) {
      rows.push(row)
      row = token
    } else {
      row = row ? `${row} ${token}` : token
    }
  }
  if (row) rows.push(row)

  const header = Object.entries(tags)
    .map(([k, v]) => `[${k} "${escapeTag(v)}"]`)
    .join('\n')
  return `${header ? header + '\n\n' : ''}${rows.join('\n')}\n`
}

/** "Hikaru_vs_Bortnyk_2026-10-16.pgn" */
export function pgnFileName(headers: PgnHeaders): string {
  if (!headers.White && !headers.Black) return 'rookahead-game.pgn'
  const safe = (s: string) => s.replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '')
  const date = headers.Date && /^\d{4}\.\d{2}\.\d{2}$/.test(headers.Date) ? `_${headers.Date.replace(/\./g, '-')}` : ''
  return `${safe(headers.White || 'White')}_vs_${safe(headers.Black || 'Black')}${date}.pgn`
}
