import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { EndKind, EndMark } from '../lib/gameEnd'

// How a game ended, on a king's square: first a label on the square's corner, which then morphs into a
// badge drawn like the move-class badges (ClassIcon): a rounded square with a white mark.

/** Red for the side that lost, green for the winner, grey for a draw. */
export const END_COLOR: Record<EndKind, string> = { mate: '#e0383e', resign: '#e0383e', timeout: '#e0383e', winner: '#4f9a3c', draw: '#6b707b' }

const line = { fill: 'none', stroke: '#fff', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Mark({ kind }: { kind: EndKind }) {
  switch (kind) {
    case 'mate': // #
      return <path d="M42 26L36 74M64 26L58 74M27 41H75M25 59H73" {...line} strokeWidth={9} />
    case 'resign': // a white flag
      return (
        <>
          <path d="M33 24V78" {...line} strokeWidth={9} />
          <path d="M36 27C46 21 54 33 70 27V53C54 59 46 47 36 53Z" fill="#fff" stroke="#fff" strokeWidth={5} strokeLinejoin="round" />
        </>
      )
    case 'timeout': // a clock
      return (
        <>
          <circle cx="50" cy="52" r="25" {...line} strokeWidth={8} />
          <path d="M50 38V53L60 60" {...line} strokeWidth={8} />
        </>
      )
    case 'winner': // a crown
      return <path d="M24 68L20 34L37 47L50 26L63 47L80 34L76 68Z" fill="#fff" stroke="#fff" strokeWidth={5} strokeLinejoin="round" />
    case 'draw': // ½
      return (
        <>
          <path d="M28 34L35 28V52" {...line} strokeWidth={7} />
          <path d="M66 24L34 76" {...line} strokeWidth={6} />
          <path d="M55 58C56 52 66 50 70 55C73 60 66 65 56 74H73" {...line} strokeWidth={7} />
        </>
      )
  }
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** The badge's corner radius, as a share of its width (ClassIcon's rx 28 on a 92-wide square). */
const BADGE_ROUND = 0.3
const MORPH_MS = 240
/** The label's text goes first, so the pill shrinks empty (scaled text would smear). */
const TEXT_OUT_MS = 90

interface ChipProps {
  mark: EndMark
  /** The king is on the board's top row: the label sits inside the square rather than over its edge. */
  topRow: boolean
  /** The king is on the board's right-hand file: the label keeps to the board. */
  rightEdge: boolean
  /** How long the label shows before it morphs into the badge. */
  settleAfter: number
}

/**
 * The label for how the game ended, which then morphs into its badge: the pill shrinks into the
 * square's corner as it takes the badge's colour, its text fading out and the mark fading in.
 * (FLIP: the pill is measured, the element becomes the badge, then it's animated from the pill's box.)
 */
export function EndChip({ mark, topRow, rightEdge, settleAfter }: ChipProps) {
  const chip = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const glyph = useRef<SVGSVGElement>(null)
  const pill = useRef<DOMRect | null>(null)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const fade = setTimeout(() => text.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TEXT_OUT_MS, fill: 'forwards' }), settleAfter - TEXT_OUT_MS)
    const settle = setTimeout(() => {
      pill.current = chip.current?.getBoundingClientRect() ?? null
      setSettled(true)
    }, settleAfter)
    return () => {
      clearTimeout(fade)
      clearTimeout(settle)
    }
  }, [settleAfter])

  useLayoutEffect(() => {
    const node = chip.current
    const first = pill.current
    if (!settled || !node || !first || reducedMotion()) return
    const last = node.getBoundingClientRect()
    if (!last.width || !last.height) return
    const sx = first.width / last.width
    const sy = first.height / last.height
    const r = first.height / 2
    const ease = 'cubic-bezier(0.3, 0.7, 0.2, 1)'
    node.animate(
      [
        {
          transformOrigin: '0 0',
          transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${sx}, ${sy})`,
          borderRadius: `${r / sx}px / ${r / sy}px`,
          backgroundColor: '#ffffff',
        },
        { transformOrigin: '0 0', transform: 'none', borderRadius: `${last.width * BADGE_ROUND}px`, backgroundColor: END_COLOR[mark.kind] },
      ],
      { duration: MORPH_MS, easing: ease },
    )
    glyph.current?.animate([{ opacity: 0, scale: '0.5' }, { opacity: 1, scale: '1' }], { duration: MORPH_MS * 0.6, delay: MORPH_MS * 0.4, easing: ease, fill: 'backwards' })
  }, [settled, mark.kind])

  const place = settled ? 'badge' : `pill${topRow ? ' top-row' : ''}${rightEdge ? ' edge-right' : ''}`
  return (
    <div ref={chip} className={`board-end-chip ${place}`} style={{ '--tone': END_COLOR[mark.kind] } as CSSProperties}>
      {!settled && (
        <span ref={text} className="board-end-text">
          {mark.label}
        </span>
      )}
      {settled && (
        <svg ref={glyph} className="board-end-glyph" viewBox="0 0 100 100" role="img" aria-label={mark.label}>
          <Mark kind={mark.kind} />
        </svg>
      )}
    </div>
  )
}
