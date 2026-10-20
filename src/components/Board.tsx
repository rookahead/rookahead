import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess, SQUARES, type Square } from 'chess.js'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Color } from '../lib/evaluation'
import { useBoardPrefs } from '../lib/boardPrefs'
import { ANIMATION_MS, type BoardTheme } from '../lib/settings'
import type { MoveClass } from '../lib/classify'
import { ClassIcon } from './ClassIcon'
import { PuzzleMark } from './PuzzleIcons'
import { PieceIcon } from './PieceIcon'

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string; label: string; lastMove?: string }> = {
  graphite: { light: '#d9dce1', dark: '#8e96a1', label: 'Graphite', lastMove: 'rgba(255, 214, 102, 0.55)' },
  iris: { light: '#d3cff3', dark: '#7d70dc', label: 'Iris', lastMove: 'rgba(238, 150, 232, 0.62)' },
  green: { light: '#ebecd0', dark: '#739552', label: 'Green' },
  brown: { light: '#f0d9b5', dark: '#b58863', label: 'Brown' },
  blue: { light: '#dee3e6', dark: '#8ca2ad', label: 'Blue' },
  slate: { light: '#c9cfd8', dark: '#6b7a8f', label: 'Slate' },
}

export function boardImage(light: string, dark: string) {
  let rects = ''
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) if ((r + f) % 2 === 1) rects += `<rect x="${f}" y="${r}" width="1" height="1"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${light}"/><g fill="${dark}">${rects}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

interface Props {
  fen: string
  orientation: Color
  lastMove?: [Square, Square]
  shapes: DrawShape[]
  theme: BoardTheme
  coordinates: boolean
  onMove: (move: { from: string; to: string; promotion?: string }) => void
  /** Classification of the move that led here: tints the last-move squares and badges the destination. */
  annotation?: MoveClass
  /** No moving pieces, ever (the embed viewer). Fixed for the board's lifetime: Chessground only reads it when it builds the board. */
  viewOnly?: boolean
  /** No moving pieces right now (e.g. the computer is thinking); unlike viewOnly, this can change at any time. */
  locked?: boolean
  /** A puzzle's verdict on the last move: a ✓ or ✗ badge on its square. */
  mark?: 'correct' | 'wrong'
}

/** Positions arriving closer together than this are someone tapping through the moves. */
const QUICK_STEP_MS = 350

/**
 * How the classification badge comes in: after the piece lands (one move at a time), straight
 * away when stepping through quickly (or it would never get to show), or straight away when the
 * verdict arrives for the position already on the board (nothing is sliding).
 */
type BadgeTiming = 'land' | 'quick' | 'late'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const PROMOTION_PIECES = ['q', 'n', 'r', 'b'] as const
const ROLE: Record<string, string> = { q: 'queen', n: 'knight', r: 'rook', b: 'bishop' }

/** Percent offsets of a square's top-left corner for the given orientation. */
function squarePosition(square: Square, orientation: Color) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  return orientation === 'white' ? { left: file * 12.5, top: (7 - rank) * 12.5 } : { left: (7 - file) * 12.5, top: rank * 12.5 }
}

export function Board({ fen, orientation, lastMove, shapes, theme, coordinates, onMove, annotation, viewOnly = false, locked = false, mark }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMoveRef = useRef(onMove)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; color: Color } | null>(null)
  const { highlightLastMove, showLegalMoves, animation } = useBoardPrefs()
  // How long a piece takes to slide to its square. The classification badge waits for it to land.
  const slideMs = reducedMotion() ? 0 : ANIMATION_MS[animation]

  useEffect(() => {
    onMoveRef.current = onMove
  })

  const position = useMemo(() => {
    const chess = new Chess(fen)
    const dests = new Map<Key, Key[]>()
    for (const sq of SQUARES) {
      const moves = chess.moves({ square: sq, verbose: true })
      if (moves.length) dests.set(sq, moves.map((m) => m.to))
    }
    return { chess, dests, turn: (chess.turn() === 'w' ? 'white' : 'black') as Color, check: chess.inCheck() }
  }, [fen])

  // Mount once, before the first paint; afterwards everything goes through api.set().
  useLayoutEffect(() => {
    if (!el.current) return
    api.current = Chessground(el.current, {
      // Animation, highlights and move dots follow the settings: the update below sets them, before the first paint.
      movable: { free: false },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      ranksPosition: 'left',
      drawable: {
        brushes: {
          // Warm amber reads on every board theme, violet included.
          best: { key: 'best', color: '#ffad33', opacity: 0.92, lineWidth: 12 },
          alt: { key: 'alt', color: '#ffad33', opacity: 0.5, lineWidth: 9 },
          suggest: { key: 'suggest', color: '#5fbf5a', opacity: 0.85, lineWidth: 12 },
          green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
          red: { key: 'r', color: '#cc3333', opacity: 1, lineWidth: 10 },
          blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
          yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
        },
      },
    })
    // Skip redraws while the board is collapsed (e.g. mid-layout): Chessground would compute NaN coordinates.
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) api.current?.redrawAll()
    })
    observer.observe(el.current)
    return () => {
      observer.disconnect()
      api.current?.destroy()
      api.current = null
    }
  }, [])

  // Before paint (as is the mount above), so a new board's first frame already shows its position.
  useLayoutEffect(() => {
    api.current?.set({
      fen,
      viewOnly,
      orientation,
      turnColor: position.turn,
      check: position.check,
      lastMove,
      coordinates,
      animation: { enabled: slideMs > 0, duration: slideMs },
      highlight: {
        lastMove: highlightLastMove,
        check: true,
        custom: annotation && lastMove ? new Map(lastMove.map((sq) => [sq as Key, `cls-${annotation}`])) : new Map(),
      },
      movable: {
        showDests: showLegalMoves,
        color: locked ? undefined : position.turn,
        dests: locked ? new Map() : position.dests,
        events: {
          after: (orig, dest) => {
            const piece = position.chess.get(orig as Square)
            const lastRank = dest[1] === '8' || dest[1] === '1'
            if (piece?.type === 'p' && lastRank) {
              setPromotion({ from: orig as Square, to: dest as Square, color: position.turn })
            } else {
              onMoveRef.current({ from: orig, to: dest })
            }
          },
        },
      },
    })
    setPromotion(null)
  }, [fen, viewOnly, locked, orientation, position, lastMove, coordinates, annotation, highlightLastMove, showLegalMoves, slideMs])

  useEffect(() => {
    api.current?.setAutoShapes(shapes)
  }, [shapes])

  const colors = BOARD_THEMES[theme]
  const style = {
    '--board-image': boardImage(colors.light, colors.dark),
    '--sq-light': colors.light,
    '--sq-dark': colors.dark,
    '--last-move': colors.lastMove ?? 'rgba(255, 255, 51, 0.42)',
    '--slide-ms': `${slideMs}ms`,
  } as CSSProperties

  // The picker drops down from the promotion square, toward the centre of the board.
  const pickerFile = promotion ? promotion.to.charCodeAt(0) - 97 : 0
  const column = orientation === 'white' ? pickerFile : 7 - pickerFile
  const fromTop = promotion ? (promotion.to[1] === '8') === (orientation === 'white') : true

  const badge = (annotation || mark) && lastMove ? squarePosition(lastMove[1], orientation) : null
  const badgeKey = badge ? `${lastMove!.join('')}-${annotation ?? mark}` : ''
  // Each badge's timing is worked out when it first appears, from when the position before came in.
  // The badge itself waits for that (a re-render before the frame is painted), so it never starts with the wrong one.
  const shownAt = useRef({ fen, at: -Infinity })
  const [badgeShown, setBadgeShown] = useState<{ key: string; timing: BadgeTiming } | null>(null)
  useLayoutEffect(() => {
    const now = performance.now()
    const last = shownAt.current
    const moved = last.fen !== fen
    if (moved) shownAt.current = { fen, at: now }
    if (!badgeKey) return
    const timing: BadgeTiming = !moved ? 'late' : now - last.at < QUICK_STEP_MS ? 'quick' : 'land'
    setBadgeShown((b) => (b?.key === badgeKey ? b : { key: badgeKey, timing }))
  }, [fen, badgeKey])

  return (
    <div className="board" style={style}>
      <div ref={el} className="board-cg" />
      {badge && badgeShown?.key === badgeKey && (
        // Keyed by the move, so the badge pops in afresh on every move rather than jumping squares.
        <div key={badgeKey} className={`board-badge ${badgeShown.timing}`} style={{ left: `${badge.left}%`, top: `${badge.top}%` }} aria-hidden>
          {mark ? <PuzzleMark kind={mark} size={28} /> : <ClassIcon cls={annotation!} size={28} />}
        </div>
      )}
      {promotion && (
        <div
          className="promotion"
          onClick={() => {
            setPromotion(null)
            api.current?.set({ fen })
          }}
        >
          <div
            className={`promotion-choices ${fromTop ? 'top' : 'bottom'}`}
            style={{ left: `${column * 12.5}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            {PROMOTION_PIECES.map((p) => (
              <button
                key={p}
                className="promotion-piece"
                aria-label={`Promote to ${ROLE[p]}`}
                onClick={() => {
                  onMoveRef.current({ from: promotion.from, to: promotion.to, promotion: p })
                  setPromotion(null)
                }}
              >
                <PieceIcon role={ROLE[p]} color={promotion.color} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
