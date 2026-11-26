import { useEffect, useRef, type CSSProperties } from 'react'
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

/** Where the sparkles fly when a blunder turns Legendary: x, y (px) and size. */
const SPARKS = [
  [-58, -34, 15],
  [56, -44, 12],
  [62, 20, 14],
  [-60, 28, 11],
  [0, -62, 10],
  [-24, 56, 9],
]

/**
 * Fixing a mistake: the review's blunder mark, big. While you point at the card it spins over like a coin into the
 * Legendary mark, and sparkles burst out.
 */
export function LegendFlip() {
  return (
    <span className="legend-flip" aria-hidden>
      <span className="legend-coin">
        <span className="legend-face bad">
          <ClassIcon cls="blunder" size={92} />
        </span>
        <span className="legend-face good">
          <ClassIcon cls="brilliant" size={92} />
        </span>
      </span>
      {SPARKS.map(([x, y, size], i) => (
        <svg key={i} className="legend-spark" viewBox="0 0 20 20" style={{ '--x': `${x}px`, '--y': `${y}px`, '--s': `${size}px`, '--d': `${0.32 + i * 0.03}s` } as CSSProperties}>
          <path d="M10 0Q11 9 20 10Q11 11 10 20Q9 11 0 10Q9 9 10 0Z" />
        </svg>
      ))}
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
