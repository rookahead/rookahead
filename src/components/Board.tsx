import { Chessground } from '@lichess-org/chessground'
import type { AnimCurrent } from '@lichess-org/chessground/anim'
import type { Api } from '@lichess-org/chessground/api'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Chess, SQUARES, type Square } from 'chess.js'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Color } from '../lib/evaluation'
import { useBoardPrefs } from '../lib/boardPrefs'
import { ANIMATION_MS, type BoardTheme, type Palette } from '../lib/settings'
import type { MoveClass } from '../lib/classify'
import type { EndKind, EndMark } from '../lib/gameEnd'
import { playSound } from '../lib/sound'
import { ClassIcon } from './ClassIcon'
import { EndChip } from './EndIcon'
import { PuzzleMark } from './PuzzleIcons'
import { PieceIcon } from './PieceIcon'

export interface BoardColors {
  light: string
  dark: string
  label: string
  lastMove?: string
  /** The engine's arrows, where the usual amber would melt into the squares. */
  arrow?: string
}

// Warm amber reads on almost every board, violet included.
const ARROW = '#ffad33'
const brushes = (arrow: string) => ({
  best: { key: 'best', color: arrow, opacity: 0.92, lineWidth: 12 },
  alt: { key: 'alt', color: arrow, opacity: 0.5, lineWidth: 9 },
  suggest: { key: 'suggest', color: '#5fbf5a', opacity: 0.85, lineWidth: 12 },
  green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
  red: { key: 'r', color: '#cc3333', opacity: 1, lineWidth: 10 },
  blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
  yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
})

export const BOARD_THEMES: Record<Exclude<BoardTheme, 'theme'>, BoardColors> = {
  graphite: { light: '#d9dce1', dark: '#8e96a1', label: 'Graphite', lastMove: 'rgba(255, 214, 102, 0.55)' },
  iris: { light: '#d3cff3', dark: '#7d70dc', label: 'Iris', lastMove: 'rgba(238, 150, 232, 0.62)' },
  green: { light: '#ebecd0', dark: '#739552', label: 'Green' },
  brown: { light: '#f0d9b5', dark: '#b58863', label: 'Brown' },
  blue: { light: '#dee3e6', dark: '#8ca2ad', label: 'Blue' },
  slate: { light: '#c9cfd8', dark: '#6b7a8f', label: 'Slate' },
}

/** The Theme board for each colour theme: its seed colour's hue at tone 90 and 60 (Material's HCT, as index.css's
 * --t-* tones). Gold's last move goes yellow-green, as plain yellow would vanish on its squares; Gold and Coral
 * take blue arrows for the same reason. Indigo's is the Iris board, whose violets suit it better. */
const THEME_BOARDS: Record<Palette, BoardColors> = {
  gold: { light: '#f8dfbb', dark: '#b38a43', label: 'Theme', lastMove: 'rgba(214, 210, 0, 0.6)', arrow: '#3b82f6' },
  sky: { light: '#d1e5f4', dark: '#5e97b8', label: 'Theme', lastMove: 'rgba(255, 214, 102, 0.62)' },
  indigo: { light: '#d3cff3', dark: '#7d70dc', label: 'Theme', lastMove: 'rgba(238, 150, 232, 0.62)' },
  coral: { light: '#ffdad2', dark: '#c97d6a', label: 'Theme', lastMove: 'rgba(255, 214, 102, 0.62)', arrow: '#3b82f6' },
  forest: { light: '#cfe9d9', dark: '#5d9d7f', label: 'Theme', lastMove: 'rgba(255, 214, 102, 0.62)' },
  ivory: { light: '#e2e2e2', dark: '#919191', label: 'Theme', lastMove: 'rgba(255, 214, 102, 0.55)' },
}

/** A board's colours; the Theme board's follow your colour theme. */
export function boardColors(theme: BoardTheme, palette: Palette): BoardColors {
  return theme === 'theme' ? THEME_BOARDS[palette] : BOARD_THEMES[theme]
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
  /** How the game ended, marked on the kings (see endMarks). */
  ends?: EndMark[]
  /** Arrived by stepping forward onto a Legendary move: the board shakes as the piece lands. */
  legendary?: boolean
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

/** The square colour under a king, by how its game ended. */
const END_TINT: Record<EndKind, string> = { mate: 'end-loss', resign: 'end-loss', timeout: 'end-loss', winner: 'end-win', draw: 'end-draw' }

/**
 * The board shaking for a Legendary move: a hard jolt that settles in a third of a second. Timed by the
 * offsets alone (linear between them): an eased ending crept the last pixel back over a third of a second,
 * a hairline wobble after the shake was over.
 */
const QUAKE: Keyframe[] = [
  { translate: '0 0', rotate: '0deg' },
  { translate: '-8px 5px', rotate: '-0.6deg', offset: 0.1 },
  { translate: '7px -6px', rotate: '0.5deg', offset: 0.22 },
  { translate: '-6px -3px', rotate: '-0.4deg', offset: 0.36 },
  { translate: '5px 4px', rotate: '0.3deg', offset: 0.52 },
  { translate: '-3px 2px', rotate: '-0.15deg', offset: 0.7 },
  { translate: '1px -1px', rotate: '0deg', offset: 0.86 },
  { translate: '0 0', rotate: '0deg' },
]
const QUAKE_MS = 340

/** A Legendary move begins in slow motion: the piece rises a little off its square before it sets off. */
const LIFT_MS = 550
/** Restarts a Chessground slide's clock from where it is now, at `pace` (a tiny pace all but stops it). */
function runClock(anim: AnimCurrent, pace: number) {
  anim.start = performance.now()
  anim.frequency = pace
}

/** How it looks raised: a touch bigger and higher, a shadow under it and a violet glow. */
const LIFTED = { scale: '1.12', translate: '0 -6%', filter: 'drop-shadow(0 8px 6px rgba(0, 0, 0, 0.35)) drop-shadow(0 0 10px rgba(167, 139, 250, 0.85))' }

/** How long a game's end is spelled out (coloured square, label on its corner) before it settles to a badge. */
const END_INTRO_MS = 1800

const PROMOTION_PIECES = ['q', 'n', 'r', 'b'] as const
const ROLE: Record<string, string> = { q: 'queen', n: 'knight', r: 'rook', b: 'bishop' }

/** Percent offsets of a square's top-left corner for the given orientation. */
function squarePosition(square: Square, orientation: Color) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  return orientation === 'white' ? { left: file * 12.5, top: (7 - rank) * 12.5 } : { left: (7 - file) * 12.5, top: rank * 12.5 }
}

export function Board({ fen, orientation, lastMove, shapes, theme, coordinates, onMove, annotation, viewOnly = false, locked = false, mark, ends, legendary = false }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMoveRef = useRef(onMove)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; color: Color } | null>(null)
  const { highlightLastMove, showLegalMoves, animation, moveEffects, soundVolume, palette } = useBoardPrefs()
  // How long a piece takes to slide to its square. The classification badge waits for it to land.
  const slideMs = reducedMotion() ? 0 : ANIMATION_MS[animation]

  useEffect(() => {
    onMoveRef.current = onMove
  })

  // Pages build a fresh lastMove array on every render: key it by its squares, so a re-render
  // with the same move (e.g. an engine update) doesn't reconfigure the board mid-slide.
  const lastMoveKey = lastMove ? lastMove.join('') : ''
  const move = useMemo(() => (lastMoveKey ? ([lastMoveKey.slice(0, 2), lastMoveKey.slice(2, 4)] as [Square, Square]) : undefined), [lastMoveKey])
  // Likewise the arrows, which pages rebuild on every engine update, and the end-of-game marks.
  const shapesKey = JSON.stringify(shapes)
  const endsKey = JSON.stringify(ends ?? [])
  const endList = useMemo(() => JSON.parse(endsKey) as EndMark[], [endsKey])
  // A game's end is spelled out each time its final position comes up, then settles to the badges.
  const endsAt = `${fen}|${endsKey}`
  const [endIntro, setEndIntro] = useState({ at: endsAt, done: false })
  if (endIntro.at !== endsAt) setEndIntro({ at: endsAt, done: false })
  const introducing = endList.length > 0 && !endIntro.done
  // The first position, for building the board: it starts there rather than sliding in from the opening position.
  const arrow = boardColors(theme, palette).arrow ?? ARROW
  const initial = useRef({ fen, orientation, coordinates, arrow })
  const drawnArrow = useRef(arrow)

  const position = useMemo(() => {
    // Pages pass legal positions; skipping the check also allows a bare board (no kings) while loading.
    const chess = new Chess(fen, { skipValidation: true })
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
      fen: initial.current.fen,
      orientation: initial.current.orientation,
      coordinates: initial.current.coordinates,
      // Animation, highlights and move dots follow the settings: the update below sets them, before the first paint.
      movable: { free: false },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      ranksPosition: 'left',
      drawable: {
        brushes: brushes(initial.current.arrow),
      },
    })
    // Chessground watches its own size and repositions the pieces in place.
    return () => {
      api.current?.destroy()
      api.current = null
    }
  }, [])

  // A king's end-of-game badge takes the corner over the move's badge, should they share a square.
  const endOnLanding = Boolean(lastMove && endList.some((m) => m.square === lastMove[1]))
  const badge = (annotation || mark) && lastMove && !endOnLanding ? squarePosition(lastMove[1], orientation) : null
  const badgeKey = badge ? `${lastMove!.join('')}-${annotation ?? mark}` : ''
  const celebrate = legendary && moveEffects && annotation === 'brilliant'
  // Each badge's timing is worked out when it first appears, from when the position before came in.
  // The badge itself waits for that (a re-render before the frame is painted), so it never starts with the wrong one.
  const shownAt = useRef({ fen, at: -Infinity })
  const [badgeShown, setBadgeShown] = useState<{ key: string; timing: BadgeTiming } | null>(null)
  // The position a Legendary move is shaking the board for.
  const [quake, setQuake] = useState<string | null>(null)
  // The lift, then the usual slide.
  const landing = LIFT_MS + slideMs
  const quaking = quake === fen && !reducedMotion()
  // The position whose Legendary move has landed: until then its squares keep the plain last-move colour,
  // so the violet doesn't give it away.
  const [landed, setLanded] = useState<string | null>(null)
  const holdVerdict = quaking && landed !== fen
  useLayoutEffect(() => {
    const now = performance.now()
    const last = shownAt.current
    const moved = last.fen !== fen
    if (moved) shownAt.current = { fen, at: now }
    const timing: BadgeTiming = !moved ? 'late' : now - last.at < QUICK_STEP_MS ? 'quick' : 'land'
    // Only a move played out at normal speed shakes the board: not a quick tap through, not a late verdict.
    if (moved) {
      const legendaryArrival = Boolean(badgeKey && celebrate && timing === 'land')
      setQuake(legendaryArrival ? fen : null)
      setLanded(null)
    }
    if (!badgeKey) return
    setBadgeShown((b) => (b?.key === badgeKey ? b : { key: badgeKey, timing }))
  }, [fen, badgeKey, celebrate])

  // Before paint (as is the mount above), so a new board's first frame already shows its position.
  useLayoutEffect(() => {
    api.current?.set({
      fen,
      viewOnly,
      orientation,
      turnColor: position.turn,
      check: position.check,
      lastMove: move,
      coordinates,
      animation: { enabled: slideMs > 0, duration: slideMs },
      highlight: {
        lastMove: highlightLastMove,
        check: true,
        custom: new Map<Key, string>([
          ...(annotation && move && !holdVerdict ? move.map((sq) => [sq as Key, `cls-${annotation}`] as const) : []),
          ...(introducing ? endList.map((m) => [m.square as Key, END_TINT[m.kind]] as const) : []),
        ]),
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
  }, [fen, viewOnly, locked, orientation, position, move, coordinates, annotation, highlightLastMove, showLegalMoves, slideMs, endList, introducing, holdVerdict])

  // Chessground draws the file and rank labels only when it builds the board: rebuild it when they're
  // switched on or off (the update above has just told it which).
  const drawnCoordinates = useRef(coordinates)
  useLayoutEffect(() => {
    if (drawnCoordinates.current === coordinates) return
    drawnCoordinates.current = coordinates
    api.current?.redrawAll()
  }, [coordinates])

  useEffect(() => {
    api.current?.setAutoShapes(JSON.parse(shapesKey))
  }, [shapesKey])

  // A new board or colour theme can change the arrows' colour: redrawn in the new one.
  useEffect(() => {
    if (arrow === drawnArrow.current) return
    drawnArrow.current = arrow
    api.current?.set({ drawable: { brushes: brushes(arrow) } })
    api.current?.redrawAll()
  }, [arrow])

  const colors = boardColors(theme, palette)
  const style = {
    '--board-image': boardImage(colors.light, colors.dark),
    '--sq-light': colors.light,
    '--sq-dark': colors.dark,
    '--last-move': colors.lastMove ?? 'rgba(255, 255, 51, 0.42)',
    // The badge and end marks wait for the piece to land, which a Legendary move takes its time over.
    '--slide-ms': `${quaking && slideMs > 0 ? landing : slideMs}ms`,
    '--slow-ms': `${landing}ms`,
    '--end-intro': `${END_INTRO_MS}ms`,
  } as CSSProperties

  // The picker drops down from the promotion square, toward the centre of the board.
  const pickerFile = promotion ? promotion.to.charCodeAt(0) - 97 : 0
  const column = orientation === 'white' ? pickerFile : 7 - pickerFile
  const fromTop = promotion ? (promotion.to[1] === '8') === (orientation === 'white') : true


  useEffect(() => {
    if (!endList.length) return
    const t = setTimeout(() => setEndIntro((e) => (e.at === endsAt ? { ...e, done: true } : e)), slideMs + END_INTRO_MS)
    return () => clearTimeout(t)
  }, [endsAt, endList.length, slideMs])

  // The lift. Chessground's clock for the slide (the board update above started it) is stopped while the
  // piece rises, then restarted to run at its usual pace. Before paint, so the piece never sets off early.
  useLayoutEffect(() => {
    const anim = api.current?.state.animation.current
    if (!quake || !anim || slideMs === 0 || reducedMotion()) return
    const pace = anim.frequency
    runClock(anim, 1e-9)
    const go = setTimeout(() => runClock(anim, pace), LIFT_MS)
    const piece = el.current?.querySelector<HTMLElement>('cg-board piece.anim')
    // The browser scales a piece after Chessground has moved it into place (the scale property composes
    // with its transform), so the scale's anchor has to follow the piece: its centre, every frame.
    let frame = 0
    const anchor = () => {
      const m = piece?.style.transform.match(/translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/)
      if (piece && m) piece.style.transformOrigin = `calc(${m[1]}px + 50%) calc(${m[2]}px + 50%)`
      frame = requestAnimationFrame(anchor)
    }
    anchor()
    const rise = piece?.animate(
      [
        { scale: '1', translate: '0 0', filter: 'none', easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)' },
        { ...LIFTED, offset: LIFT_MS / landing },
        { ...LIFTED, offset: Math.max(LIFT_MS, landing - 60) / landing },
        { scale: '1', translate: '0 0', filter: 'none' },
      ],
      { duration: landing },
    )
    if (rise)
      rise.onfinish = () => {
        cancelAnimationFrame(frame)
        if (piece) piece.style.transformOrigin = ''
      }
    return () => {
      clearTimeout(go)
      cancelAnimationFrame(frame)
      rise?.cancel()
      if (piece) piece.style.transformOrigin = ''
    }
  }, [quake, slideMs, landing])

  // A Legendary move starts in slow motion, before the badge has said why: the board dims and the sound
  // swells as the piece lifts and travels, then the landing hits and shakes the board.
  useEffect(() => {
    if (!quake) return
    if (reducedMotion() || slideMs === 0) {
      playSound('legendary', soundVolume)
      return
    }
    playSound('swell', soundVolume, landing)
    const impact = setTimeout(() => {
      playSound('legendary', soundVolume)
      setLanded(quake)
    }, landing)
    const motion = root.current?.animate(QUAKE, { duration: QUAKE_MS, delay: landing })
    return () => {
      clearTimeout(impact)
      motion?.cancel()
    }
  }, [quake, soundVolume, slideMs, landing])

  return (
    <div ref={root} className={`board ${quaking ? 'legendary' : ''}`} style={style}>
      <div ref={el} className="board-cg" />
      {quake && quaking && lastMove && (
        // The board dims slowly as the piece lifts; on impact the square flashes, a bubble rolls out and the dark lifts.
        <div
          key={quake}
          className="board-quake"
          style={
            {
              '--x': `${squarePosition(lastMove[1], orientation).left + 6.25}%`,
              '--y': `${squarePosition(lastMove[1], orientation).top + 6.25}%`,
              '--fx': `${squarePosition(lastMove[0], orientation).left + 6.25}%`,
              '--fy': `${squarePosition(lastMove[0], orientation).top + 6.25}%`,
              '--lift': `${LIFT_MS}ms`,
            } as CSSProperties
          }
          aria-hidden
        >
          <span className="quake-dim" />
          <span className="quake-flash" />
          <span className="quake-bubble" />
        </div>
      )}
      {endList.map((m) => {
        const at = squarePosition(m.square, orientation)
        return (
          <div key={m.square} className={`board-end ${at.left === 87.5 ? 'edge-right' : ''}`} style={{ left: `${at.left}%`, top: `${at.top}%` }}>
            {/* Keyed by the showing, so each one starts again from the label. */}
            <EndChip key={endsAt} mark={m} topRow={at.top === 0} rightEdge={at.left === 87.5} settleAfter={slideMs + END_INTRO_MS} />
          </div>
        )
      })}
      {badge && badgeShown?.key === badgeKey && (
        // Keyed by the move, so the badge pops in afresh on every move rather than jumping squares.
        <div key={badgeKey} className={`board-badge ${badgeShown.timing} ${quaking ? 'legendary' : ''} ${badge.left === 87.5 ? 'edge-right' : ''} ${badge.top === 0 ? 'top-row' : ''}`} style={{ left: `${badge.left}%`, top: `${badge.top}%` }} aria-hidden>
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
