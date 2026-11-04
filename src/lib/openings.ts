import type { MoveNode } from './tree'

// Opening book built from the Lichess opening list (CC0) by
// scripts/build-openings.mjs. Loaded lazily — it's ~90 KB gzipped.

export interface OpeningBook {
  isBook(fen: string): boolean
  /** "C50 Italian Game" style name if this exact position ends a named line. */
  nameAt(fen: string): string | undefined
}

interface BookData {
  names: string[]
  positions: Record<string, number>
}

const key = (fen: string) => fen.split(' ').slice(0, 3).join(' ')

export function makeBook(data: BookData): OpeningBook {
  return {
    isBook: (fen) => key(fen) in data.positions,
    nameAt: (fen) => {
      const i = data.positions[key(fen)]
      return i !== undefined && i >= 0 ? data.names[i] : undefined
    },
  }
}

let loading: Promise<OpeningBook> | null = null

export function loadOpeningBook(): Promise<OpeningBook> {
  loading ??= import('../data/openings.json').then((m) => makeBook(m.default as BookData))
  return loading
}

export interface Opening {
  eco: string
  name: string
}

/** The most specific named opening reached along `path` (root → current). */
export function openingOf(book: OpeningBook, path: MoveNode[]): Opening | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const label = book.nameAt(path[i].fen)
    if (label) {
      const space = label.indexOf(' ')
      return { eco: label.slice(0, space), name: label.slice(space + 1) }
    }
  }
  return undefined
}

/**
 * The opening the last move of `path` reaches, only when it's new there: the first time a line is named,
 * or when it narrows to a variation. Repeats of the same name along the line give nothing.
 */
export function newOpeningAt(book: OpeningBook, path: MoveNode[]): string | undefined {
  const last = path[path.length - 1]
  const name = last && book.nameAt(last.fen)?.replace(/^\S+ /, '')
  if (!name) return undefined
  return name !== openingOf(book, path.slice(0, -1))?.name ? name : undefined
}
