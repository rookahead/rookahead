import { useEffect, useRef, type CSSProperties } from 'react'
import { useBoardPrefs } from '../lib/boardPrefs'
import { boardColors } from './Board'
import { ClassIcon } from './ClassIcon'
import { COACH_BLINK_MS, blinkGap, COACH_BODY, COACH_EYE_Y, COACH_EYES } from './RookCoach'

// The pictures on Home's cards. They keep still until you point at their card: then a piece makes its move, the
// coach stands up straight. Nothing moves on its own when the page arrives.

const ROLE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/** A piece for a card's picture: the board's own pieces (pieces.css), a little smaller than on a board. */
function CardPiece({ piece }: { piece: string }) {
  return <i className={`card-piece ${ROLE[piece.toLowerCase()]} ${piece === piece.toUpperCase() ? 'white' : 'black'}`} />
}

export interface TilePiece {
  /** "N" for a white knight, "q" for a black queen. */
  piece: string
  /** Its square: column and row from the top left. */
  at: [number, number]
  /** Where it goes while you point at the card, in squares. */
  to?: [number, number]
}

/** A corner of a board in your board's colours, a few pieces on it. */
export function TileBoard({ size = 5, pieces, flash, className = '', style }: { size?: number; pieces: TilePiece[]; flash?: [number, number]; className?: string; style?: CSSProperties }) {
  return (
    <span className={`art-board ${className}`} style={{ '--n': size, ...style } as CSSProperties} aria-hidden>
      {Array.from({ length: size * size }, (_, i) => {
        const col = i % size
        const row = Math.floor(i / size)
        const lit = flash && flash[0] === col && flash[1] === row
        // A real board's top-right corner (h8) is dark, so this corner of one is too.
        return <i key={i} className={`${(col + row) % 2 ? 'light' : 'dark'} ${lit ? 'flash' : ''}`} />
      })}
      {pieces.map(({ piece, at, to }) => (
        <span
          key={`${piece}${at}`}
          className={`art-piece ${to ? 'moves' : ''}`}
          style={{ left: `${(at[0] / size) * 100}%`, top: `${(at[1] / size) * 100}%`, width: `${100 / size}%`, '--to-x': `${(to?.[0] ?? 0) * 100}%`, '--to-y': `${(to?.[1] ?? 0) * 100}%` } as CSSProperties}
        >
          <CardPiece piece={piece} />
        </span>
      ))}
    </span>
  )
}

/**
 * The coach at work: the big board a coach hangs on the wall to teach from, in your colours in a white frame, and the
 * pointer on the move that matters: the rook up to the back rank, mate. The move's squares are lit yellow with an
 * arrow up them, the mated king's square red. It keeps still.
 */
export function DemoBoard({ style }: { style?: CSSProperties }) {
  return (
    <span className="demo-board" style={style} aria-hidden>
      <svg className="demo-hang" viewBox="0 0 60 20">
        <path d="M6 20 30 3 54 20" />
        <circle cx="30" cy="3" r="2.6" />
      </svg>
      <span className="art-board squares" style={{ '--n': 5 } as CSSProperties}>
        {Array.from({ length: 25 }, (_, i) => {
          const col = i % 5
          const row = Math.floor(i / 5)
          const mark = col === 3 && (row === 2 || row === 0) ? 'moved' : col === 0 && row === 0 ? 'mated' : ''
          return <i key={i} className={`${(col + row) % 2 ? 'dark' : 'light'} ${mark}`} />
        })}
        {/* The rook's move: a thin white arrow from the square it left to the one it mates on, under the pieces. */}
        <svg className="demo-arrow" viewBox="0 0 5 5">
          <path d="M3.5 2.5V1.2" />
          <path className="head" d="M3.5 1.02 3.66 1.26H3.34Z" />
        </svg>
        {DEMO_PIECES.map(({ piece, at }) => (
          <span key={`${piece}${at}`} className="art-piece" style={{ left: `${at[0] * 20}%`, top: `${at[1] * 20}%`, width: '20%' }}>
            <CardPiece piece={piece} />
          </span>
        ))}
      </span>
      <span className="demo-stick" />
    </span>
  )
}

/** Back-rank mate: the king in the corner, boxed in by its own pawns, and the rook that has just reached the back rank. */
const DEMO_PIECES: TilePiece[] = [
  { piece: 'k', at: [0, 0] },
  { piece: 'p', at: [0, 1] },
  { piece: 'p', at: [1, 1] },
  { piece: 'p', at: [2, 1] },
  { piece: 'R', at: [3, 0] },
]

/** Fix your mistakes on the Puzzles page, where every tile's picture keeps still: the review's Blunder mark, flat and fixed. */
export function FixMark() {
  return (
    <span className="fix-mark" aria-hidden>
      <ClassIcon cls="blunder" size={84} />
      <i className="fix-mark-tick">
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </i>
    </span>
  )
}

/** A square of a 5×5 corner as left/top percentages: column and row from the top left. */
const at5 = (col: number, row: number): CSSProperties => ({ left: `${col * 20}%`, top: `${row * 20}%` })

/**
 * Fix your mistakes: a mate in one you missed, on a corner of the board in your colours (d8 to h4). Black's king on
 * g8 behind its pawns; White's queen on e5, and the move you played as a faded ghost queen on g5 with an arrow and
 * the review's Mistake badge. Pointing at the card plays the right move: the ghost goes, the queen slides up to e8,
 * mate, with the Best badge and the king's square red. All fixed: it stays on the mate.
 */
export function QueenFix({ fixed = false }: { fixed?: boolean }) {
  const { boardTheme, palette } = useBoardPrefs()
  const squares = boardColors(boardTheme, palette)
  return (
    <span className={`queen-fix ${fixed ? 'fixed' : ''}`} style={{ '--sq-light': squares.light, '--sq-dark': squares.dark } as CSSProperties} aria-hidden>
      <span className="queen-fix-board">
        {Array.from({ length: 25 }, (_, i) => (
          // h8, the corner's top right, is dark as on a real board.
          <i key={i} className={((i % 5) + Math.floor(i / 5)) % 2 ? 'light' : 'dark'} />
        ))}
        <i className="queen-fix-tint best" style={at5(1, 3)} />
        <i className="queen-fix-tint best" style={at5(1, 0)} />
        <i className="queen-fix-tint mated" style={at5(3, 0)} />
        <svg className="queen-fix-arrow" viewBox="0 0 5 5">
          <path d="M1.78 3.5H3.2" />
          <path className="head" d="M3.44 3.5 3.2 3.34V3.66Z" />
        </svg>
        <span className="queen-fix-piece" style={at5(3, 0)}>
          <CardPiece piece="k" />
        </span>
        {[2, 3, 4].map((col) => (
          <span key={col} className="queen-fix-piece" style={at5(col, 1)}>
            <CardPiece piece="p" />
          </span>
        ))}
        <span className="queen-fix-piece ghost" style={at5(3, 3)}>
          <CardPiece piece="Q" />
        </span>
        <span className="queen-fix-piece queen" style={at5(1, 3)}>
          <CardPiece piece="Q" />
        </span>
      </span>
      {/* The badges on their squares' top right corners, as on the review board, outside the board's clip. */}
      <span className="queen-fix-badge mistake" style={at5(3, 3)}>
        <ClassIcon cls="mistake" size={24} />
      </span>
      <span className="queen-fix-badge best" style={at5(1, 0)}>
        <ClassIcon cls="best" size={24} />
      </span>
    </span>
  )
}

/** Where the rook's eyes sit, and how far they look. */
const EYES = COACH_EYES
const REACH = { x: 6, y: 4 }

/**
 * The coach, whole: its eyes follow your pointer and blink every few seconds (oval, dot, dash, dot,
 * oval).
 */
export function RookWatch() {
  const eyes = useRef<SVGGElement>(null)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const look = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const g = eyes.current
        const box = g?.ownerSVGElement?.getBoundingClientRect()
        if (!g || !box) return
        const dx = e.clientX - (box.left + box.width / 2)
        const dy = e.clientY - (box.top + box.height / 2)
        const reach = Math.min(1, Math.hypot(dx, dy) / 300)
        const angle = Math.atan2(dy, dx)
        g.style.translate = `${(Math.cos(angle) * reach * REACH.x).toFixed(2)}px ${(Math.sin(angle) * reach * REACH.y).toFixed(2)}px`
      })
    }
    let timer = 0
    const blink = () => {
      timer = window.setTimeout(() => {
        eyes.current?.classList.add('blink')
        timer = window.setTimeout(() => {
          eyes.current?.classList.remove('blink')
          blink()
        }, COACH_BLINK_MS)
      }, blinkGap())
    }
    blink()
    window.addEventListener('pointermove', look)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      window.removeEventListener('pointermove', look)
    }
  }, [])
  return (
    <svg className="rook-watch" viewBox="0 0 120 120" aria-hidden>
      <path d={COACH_BODY} />
      <g ref={eyes} className="rook-watch-eyes coach-eyes">
        {EYES.map((x) => (
          <g key={x}>
            <ellipse className="open" cx={x} cy={COACH_EYE_Y} rx="7" ry="9" />
            <path className="shut" d={`M${x - 8} ${COACH_EYE_Y + 2}H${x + 8}`} />
          </g>
        ))}
      </g>
    </svg>
  )
}
